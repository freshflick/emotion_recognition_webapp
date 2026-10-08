/**
 * Live microphone -> WebSocket -> FastAPI streaming client.
 *
 * ── Why Web Audio and not MediaRecorder ──
 * MediaRecorder is the obvious choice for "record audio in the browser", but
 * its WebM/Opus output is only decodable as a complete file: every chunk after
 * the first has no container header, so the server cannot decode it in
 * isolation. A continuous stream of MediaRecorder chunks is therefore
 * undecodable server-side past the first one.
 *
 * Instead we tap the raw audio graph and send headerless 16kHz mono PCM16.
 * Every byte pair is a sample, so the server can slice the stream anywhere and
 * still have valid audio (backend/models/audio_utils.py:wrap_pcm16_as_wav),
 * and no ffmpeg subprocess is needed per chunk.
 *
 * The PCM is uncompressed — 32 KB/s upstream. Fine on localhost or a LAN
 * demo; if this is ever deployed over a slow link, that's the thing to
 * revisit (Opus-encoding each chunk as its own complete file would work).
 */
import { getAccessToken } from "../lib/supabase";
import { BACKEND_ORIGIN } from "../config/runtime";
import { UtteranceEndpoint } from "./utteranceEndpoint";
import type { LiveServerMessage } from "./types";

const TARGET_SAMPLE_RATE = 16000;

/** Worklet source, inlined as a blob so there's no separate asset to serve. */
const WORKLET_SOURCE = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    // Copy — the buffer is reused by the audio thread after we return.
    if (channel) this.port.postMessage(new Float32Array(channel));
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;

function floatToPcm16(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    // getUserMedia already applies automatic gain control. Normalising each
    // worklet frame independently amplifies room noise and destabilises both
    // speaker embeddings and emotion cues.
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

/** Linear-interpolation downsample, used only if the browser wouldn't give
 *  us a 16kHz AudioContext directly. */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export interface LiveSessionCallbacks {
  onLatency?: (sample: {
    kind: "microphone" | "connection" | "preview-transcript" | "preview-emotion" | "final";
    ms: number;
  }) => void;
  onReady?: (info: {
    mock: boolean;
    expectedSpeakers: number;
    subjectSpeaker: string | null;
  }) => void;
  onReading?: (msg: Extract<LiveServerMessage, { type: "reading" }>) => void;
  /** Provisional rolling emotion estimate; never persisted as a reading. */
  onPreview?: (msg: Extract<LiveServerMessage, { type: "preview" }>) => void;
  /** Rolling partial transcript for the currently open turn. */
  onPartialTranscript?: (
    msg: Extract<LiveServerMessage, { type: "preview_transcript" }>,
  ) => void;
  /** Fires after a provisional preview has finished processing. */
  onPreviewDone?: () => void;
  onSummary?: (msg: Extract<LiveServerMessage, { type: "summary" }>) => void;
  onError?: (message: string) => void;
  /** Unexpected server close after the session connected. */
  onDisconnected?: (reason: string) => void;
  /** Fires with the current input level (0..1) for the waveform display. */
  onLevel?: (level: number) => void;
  /**
   * An utterance has been committed and the server is analysing it. The server
   * always answers a commit with `flush_done` (even if it held no speech), so
   * this pairs with a "you've finished speaking" indicator.
   */
  onProcessing?: (processing: boolean) => void;
  /**
   * Who is talking right now, and whether a turn is mid-flight. Drives the
   * turn prompt so people know when to speak.
   *
   * `finalising` means the speaker has paused and the server is working on
   * their last utterance; `speaking` means audio is still being collected.
   */
  onTurn?: (state: {
    speaking: boolean;
    finalising: boolean;
    meter: number;
  }) => void;
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private muted = true;
  private closed = false;
  /** Bytes buffered since the last commit, mirroring the server's buffer. */
  private bytesPending = 0;
  /** Audio accumulated since the last rolling preview request. */
  private bytesSincePreview = 0;
  /** Ceiling from the server; a turn this long is committed regardless. */
  private maxUtteranceBytes = 384000; // 12s, updated from server
  private previewIntervalBytes = 48000; // 1.5s at 16kHz PCM16
  private previewMinBytes = 28800; // 0.9s at 16kHz PCM16
  private previewInFlight = false;
  private endpoint = new UtteranceEndpoint();
  /** Set on commit, cleared by the server's flush_done. */
  private finalising = false;
  private expectedSpeakers: number;
  /** Zero-based index of the enrolled speaker to analyse, or null to
   *  analyse everyone. Set before start() so it rides along with the auth
   *  message the socket opens with. */
  private subjectSpeakerIndex: number | null = null;
  private subjectName = "";
  private enrollmentResolve: ((speakerIndex: number) => void) | null = null;
  private enrollmentReject: ((error: Error) => void) | null = null;
  private analysisResolve: (() => void) | null = null;
  private microphoneStartedAt = 0;
  private socketStartedAt = 0;
  private previewStartedAt = 0;
  private flushStartedAt = 0;

  private cb: LiveSessionCallbacks;

  constructor(cb: LiveSessionCallbacks = {}, expectedSpeakers = 1) {
    this.cb = cb;
    this.expectedSpeakers = Math.max(1, Math.min(Math.round(expectedSpeakers), 4));
  }

  /**
   * Choose which enrolled speaker's emotions to report.
   *
   * Can be called at any time, not just before start(). Before the socket is
   * open the choice rides along with the auth handshake; afterwards it is sent
   * as a `set_subject` message. That second path is the one that actually gets
   * used: the picker is only shown once everyone has enrolled, and enrollment
   * is what opened the socket, so the handshake value is always stale.
   */
  setSubject(speakerIndex: number | null, name = ""): void {
    this.subjectSpeakerIndex =
      speakerIndex === null || Number.isNaN(speakerIndex)
        ? null
        : Math.max(0, Math.min(Math.round(speakerIndex), this.expectedSpeakers - 1));
    this.subjectName = name.trim().slice(0, 60);

    // Already connected: the handshake carried nothing useful, so update now.
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: "set_subject",
          speakerIndex: this.subjectSpeakerIndex,
          name: this.subjectName,
        }),
      );
    }
  }

  /** Requests the mic, opens the socket, and begins streaming. */
  async start(): Promise<void> {
    this.microphoneStartedAt = performance.now();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.cb.onLatency?.({
      kind: "microphone",
      ms: performance.now() - this.microphoneStartedAt,
    });

    // Asking for 16kHz up front lets the browser resample for us. Not all
    // browsers honour it, hence the fallback resample() below.
    try {
      this.ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    } catch {
      this.ctx = new AudioContext();
    }
    const inputRate = this.ctx.sampleRate;

    await this.openSocket();
    if (this.closed) return;

    this.source = this.ctx.createMediaStreamSource(this.stream);

    this.endpoint.onBoundary = () => this.commit();

    const onSamples = (samples: Float32Array) => {
      if (this.muted) return;

      // Peak level for the waveform bars — computed here because this is the
      // only place with access to the raw samples.
      if (this.cb.onLevel) {
        let peak = 0;
        for (let i = 0; i < samples.length; i++) {
          const v = Math.abs(samples[i]);
          if (v > peak) peak = v;
        }
        this.cb.onLevel(peak);
      }

      // Speech/silence decision, made on the raw frame before resampling so the
      // energy measures the microphone rather than our own downsampler.
      const speaking = this.endpoint.push(samples, inputRate);

      if (this.ws?.readyState !== WebSocket.OPEN) return;
      const pcm = floatToPcm16(resample(samples, inputRate, TARGET_SAMPLE_RATE));
      this.ws.send(pcm);
      this.bytesPending += pcm.byteLength;
      this.bytesSincePreview += pcm.byteLength;

      // Ask for a rolling estimate while speech is in progress. This does not
      // reset bytesPending: the final pause still commits the entire utterance.
      if (
        this.bytesSincePreview >= this.previewIntervalBytes &&
        this.bytesPending >= this.previewMinBytes &&
        !this.previewInFlight &&
        !this.finalising
      ) {
        this.previewInFlight = true;
        this.bytesSincePreview = 0;
        this.previewStartedAt = performance.now();
        this.ws.send(JSON.stringify({ action: "preview" }));
      }

      // Ceiling for a monologue that never pauses. The normal boundary is the
      // silence detected above; this only stops the buffer growing unbounded.
      if (this.bytesPending >= this.maxUtteranceBytes && !this.finalising) {
        this.commit();
      }

      this.cb.onTurn?.({
        speaking,
        finalising: this.finalising,
        meter: this.endpoint.meter,
      });
    };

    await this.attachTap(onSamples);
  }

  /**
   * Close the current turn and ask the server to analyse it.
   *
   * Called from two places: the endpointing state machine when someone pauses,
   * and the monotonic buffer ceiling above. `pending` suppresses the duplicate
   * commit the ceiling could otherwise fire while a silence commit is still in
   * flight, which would split one utterance in two.
   */
  private commit(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    if (this.finalising) return;
    this.finalising = true;
    this.bytesPending = 0;
    this.bytesSincePreview = 0;
    this.endpoint.reset();
    this.flushStartedAt = performance.now();
    this.ws.send(JSON.stringify({ action: "flush" }));
    this.cb.onProcessing?.(true);
    this.cb.onTurn?.({ speaking: false, finalising: true, meter: 0 });
  }

  /** Prefer AudioWorklet (off the main thread); fall back where unavailable. */
  private async attachTap(onSamples: (s: Float32Array) => void): Promise<void> {
    const ctx = this.ctx!;

    if (ctx.audioWorklet) {
      const url = URL.createObjectURL(
        new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
      );
      try {
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, "pcm-tap");
        node.port.onmessage = (e) => onSamples(e.data as Float32Array);
        this.source!.connect(node);
        // Worklets need a destination path to be pulled, but we don't want to
        // hear ourselves — a muted gain node keeps the graph alive silently.
        const sink = ctx.createGain();
        sink.gain.value = 0;
        node.connect(sink).connect(ctx.destination);
        this.node = node;
        return;
      } catch {
        // fall through to ScriptProcessor
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    // Deprecated but universally supported. Runs on the main thread; fine at
    // this buffer size, and only reached on older browsers.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => onSamples(new Float32Array(e.inputBuffer.getChannelData(0)));
    this.source!.connect(node);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(ctx.destination);
    this.node = node;
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socketStartedAt = performance.now();
      const backendOrigin = BACKEND_ORIGIN || location.origin;
      const socketUrl = new URL("/ws/live-session", backendOrigin);
      socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(socketUrl.toString());
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      let settled = false;

      ws.onopen = async () => {
        // The server expects the auth handshake as the very first message.
        ws.send(
          JSON.stringify({
            token: (await getAccessToken()) ?? "",
            format: "pcm16",
            sampleRate: TARGET_SAMPLE_RATE,
            expectedSpeakers: this.expectedSpeakers,
            subjectSpeakerIndex: this.subjectSpeakerIndex,
            subjectName: this.subjectName,
          }),
        );
      };

      ws.onmessage = (event) => {
        let msg: LiveServerMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case "ready":
            if (!settled) {
              settled = true;
              this.cb.onLatency?.({
                kind: "connection",
                ms: performance.now() - this.socketStartedAt,
              });
              resolve();
            }
            this.maxUtteranceBytes = msg.chunkBytes;
            this.previewIntervalBytes = msg.previewBytes;
            this.previewMinBytes = msg.previewMinBytes;
            this.cb.onReady?.({
              mock: msg.mock,
              expectedSpeakers: msg.expectedSpeakers,
              subjectSpeaker: msg.subjectSpeaker ?? null,
            });
            break;
          case "reading":
            this.previewInFlight = false;
            this.cb.onReading?.(msg);
            break;
          case "preview":
            if (this.previewStartedAt > 0) {
              this.cb.onLatency?.({
                kind: "preview-emotion",
                ms: performance.now() - this.previewStartedAt,
              });
              this.previewStartedAt = 0;
            }
            this.cb.onPreview?.(msg);
            break;
          case "preview_transcript":
            if (this.previewStartedAt > 0) {
              this.cb.onLatency?.({
                kind: "preview-transcript",
                ms: performance.now() - this.previewStartedAt,
              });
            }
            this.cb.onPartialTranscript?.(msg);
            break;
          case "preview_done":
            this.previewInFlight = false;
            this.cb.onPreviewDone?.();
            break;
          case "preview_error":
            this.previewInFlight = false;
            this.cb.onError?.(`Live preview unavailable: ${msg.message}`);
            this.cb.onPreviewDone?.();
            break;
          case "flush_done":
            if (this.flushStartedAt > 0) {
              this.cb.onLatency?.({
                kind: "final",
                ms: performance.now() - this.flushStartedAt,
              });
              this.flushStartedAt = 0;
            }
            // The server has finished with this utterance, whether or not it
            // contained speech. Clearing on this rather than on the reading
            // is what stops the indicator hanging on a silent pause.
            this.finalising = false;
            this.cb.onProcessing?.(false);
            this.cb.onTurn?.({
              speaking: false,
              finalising: false,
              meter: 0,
            });
            break;
          case "enrollment_complete":
            this.enrollmentResolve?.(msg.speakerIndex);
            this.enrollmentResolve = null;
            this.enrollmentReject = null;
            break;
          case "enrollment_error":
            this.enrollmentReject?.(new Error(msg.message));
            this.enrollmentResolve = null;
            this.enrollmentReject = null;
            break;
          case "analysis_started":
            this.muted = false;
            this.analysisResolve?.();
            this.analysisResolve = null;
            break;
          case "summary":
            this.cb.onSummary?.(msg);
            break;
          case "error":
            this.cb.onError?.(msg.message);
            break;
        }
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(
            new Error(
              "Could not connect to the live analysis backend. Is it running on port 8000?",
            ),
          );
        }
      };

      ws.onclose = (e) => {
        if (!settled) {
          settled = true;
          // 4001 is our own "bad token" close code from the server.
          reject(
            new Error(
              e.code === 4001
                ? "Session rejected: not signed in, or the login has expired."
                : "Live session closed before it started.",
            ),
          );
        } else if (!this.closed) {
          const reason = e.reason || "The live analysis connection closed.";
          this.teardown();
          this.cb.onDisconnected?.(reason);
        }
      };
    });
  }

  /** Pause/resume streaming without dropping the socket or the mic grant. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted && this.ws?.readyState === WebSocket.OPEN) {
      // Drop the half-spoken turn and reset the detector, so resuming starts a
      // fresh boundary instead of inheriting a pause that would immediately
      // look like "speaker finished".
      this.bytesPending = 0;
      this.bytesSincePreview = 0;
      this.finalising = false;
      this.previewInFlight = false;
      this.endpoint.reset();
      this.ws.send(JSON.stringify({ action: "pause" }));
      this.cb.onProcessing?.(false);
      this.cb.onTurn?.({ speaking: false, finalising: false, meter: 0 });
    }
  }

  beginEnrollment(speakerIndex: number): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error("Speaker enrollment is not connected");
    }
    this.ws.send(JSON.stringify({ action: "begin_enrollment", speakerIndex }));
    this.muted = false;
  }

  finishEnrollment(): Promise<number> {
    this.muted = true;
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Speaker enrollment disconnected"));
        return;
      }
      this.enrollmentResolve = resolve;
      this.enrollmentReject = reject;
      this.ws.send(JSON.stringify({ action: "end_enrollment" }));
    });
  }

  beginAnalysis(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        reject(new Error("Live session disconnected"));
        return;
      }
      this.analysisResolve = resolve;
      this.ws.send(JSON.stringify({ action: "start_analysis" }));
    });
  }

  /**
   * Ask the server to flush the final partial chunk and persist the session.
   * Resolves with the saved report id once the summary arrives, or null if
   * the server doesn't answer in time.
   */
  async stop(): Promise<string | null> {
    if (this.closed) return null;
    this.closed = true;
    this.enrollmentReject?.(new Error("Speaker enrollment cancelled"));
    this.enrollmentResolve = null;
    this.enrollmentReject = null;
    this.analysisResolve = null;

    const summary = new Promise<string | null>((resolve) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return resolve(null);

      // The final chunk still has to run through Whisper + the model, so give
      // it real time — but never hang the UI forever.
      const timer = setTimeout(() => resolve(null), 20000);
      const previous = this.cb.onSummary;
      this.cb.onSummary = (msg) => {
        clearTimeout(timer);
        previous?.(msg);
        resolve(msg.reportId);
      };
      this.ws.send(JSON.stringify({ action: "end" }));
    });

    const reportId = await summary;
    this.teardown();
    return reportId;
  }

  /** Release the mic and socket immediately, without waiting for a summary. */
  teardown(): void {
    this.closed = true;

    if (this.node) {
      this.node.disconnect();
      if ("port" in this.node) this.node.port.onmessage = null;
      else this.node.onaudioprocess = null;
    }
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});

    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();

    this.node = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;
    this.ws = null;
  }
}
