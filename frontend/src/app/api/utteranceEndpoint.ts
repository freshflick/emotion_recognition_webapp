/**
 * Utterance endpointing: deciding where one person's turn ends.
 *
 * The reason this exists is that a fixed-time chunker makes live transcripts
 * unreadable. Splitting a stream every 2.5s cuts sentences at arbitrary
 * offsets, so the transcript fills with fragments like "The birch canoe slid
 * on the smooth pla" and, worse, the person speaking has no idea a boundary
 * was about to land. That is what makes two people talk over each other.
 *
 * So instead of cutting on a timer we cut on *silence*. A speaker's own pause
 * is the boundary: it is where a breath for the next clause goes anyway, and
 * it is the only signal available without a streaming ASR model. The moment
 * the room goes quiet for SPEECH_END_SILENCE_MS we declare the turn finished
 * and tell the server to commit.
 *
 * ── Why energy, and not a neural VAD ──
 * Silero/WebRTC VAD would be more accurate, particularly against music and
 * keyboard noise, but both need a model file and (for Silero) ONNX Runtime
 * pulled into the browser bundle. Plain RMS with an adaptive floor gets the
 * common case right — quiet room, two voices near one mic — for zero
 * dependencies. The floor is what makes it survive different rooms: see
 * `tick` for the reasoning.
 */

/** Silence that ends a turn. Tuned to a sentence-boundary pause, not a breath. */
const SPEECH_END_SILENCE_MS = 1000;

/**
 * Energy gate for "someone is talking", as a multiple of the measured noise
 * floor. 3x sits above steady room tone and HVAC hum but below a real voice.
 */
const SPEECH_FLOOR_MULTIPLE = 2;

/**
 * Never let the gate fall below this. Protects against a dead-mic reading of
 * pure zeros, where the adaptive floor has nothing to track and every sample
 * would look infinitely loud.
 */
const MIN_ABSOLUTE_RMS = 0.0015;

/** Start low so quiet speech is not learned as background before the first turn. */
const INITIAL_NOISE_FLOOR_RMS = 0.00075;

/** Ceiling on the estimated floor, so a burst of shouting can't desensitise
 *  the gate for the rest of the session. */
const MAX_FLOOR_RMS = 0.00175;

/** A frame is only classified once we've seen enough history to trust it.
 *  2s of audio — long enough to characterise the room, short enough that the
 *  first speaker isn't gated out. */
const FLOOR_TRACKING_FRAMES = 25;

/**
 * Release is slower than attack. Attack decides when a turn *starts* and must
 * be fast so speech isn't clipped; release decides when a turn *ends* and is
 * deliberately lazy so a natural inter-word gap doesn't end the utterance.
 */
const ATTACK = 0.55;
const RELEASE = 0.12;

export type UtteranceEvent =
  /** The room went quiet for long enough: commit the buffer now. */
  | { kind: "end" }
  /** Long monologue: commit regardless of whether anyone paused. */
  | { kind: "max" };

export class UtteranceEndpoint {
  private noiseFloor = INITIAL_NOISE_FLOOR_RMS;
  private framesSeen = 0;
  /** Whether this instant is loud enough to count as speech. Drives the UI. */
  private speaking = false;
  /**
   * Whether an utterance is *open* — speech has started but its closing
   * pause hasn't arrived yet.
   *
   * This has to be separate from `speaking`. `speaking` goes false on the very
   * first silent frame, but the turn isn't over for another 700ms, so using it
   * to gate the boundary check means the check can never pass: by the time the
   * silence has run long enough, `speaking` is long gone.
   */
  private inTurn = false;
  private level = 0;
  private silentMs = 0;
  private msPerFrame = 0;

  /** Set by the owner; call `reset` when the analysis phase starts. */
  onBoundary: ((event: UtteranceEvent) => void) | null = null;

  /** Feed one audio frame. Returns whether speech is currently detected. */
  push(samples: Float32Array, sampleRate: number): boolean {
    if (this.msPerFrame === 0 && sampleRate > 0) {
      this.msPerFrame = (samples.length / sampleRate) * 1000;
    }
    if (samples.length === 0 || sampleRate <= 0) return this.speaking;

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
    const rms = Math.sqrt(sumSquares / samples.length);

    const gate = Math.max(this.noiseFloor * SPEECH_FLOOR_MULTIPLE, MIN_ABSOLUTE_RMS);
    this.speaking = rms > gate;

    // Classify against the existing floor before learning from this frame.
    // Otherwise the first voice frame after a quiet start can be mistaken for
    // room tone, raising the gate above that speaker and preventing the turn
    // from ever opening.
    if (!this.speaking) this.updateFloor(rms);

    // Smooth toward the new state: fast to open, slow to close.
    this.level = this.speaking
      ? Math.max(rms, this.level + (rms - this.level) * ATTACK)
      : this.level * RELEASE;

    if (this.speaking) {
      this.inTurn = true;
      this.silentMs = 0;
    } else {
      this.silentMs += this.msPerFrame || 0;
      // The room has been quiet long enough to close an open turn. Gating on
      // `inTurn` is what stops this firing every 0.7s in a silent room.
      if (this.inTurn && this.silentMs >= SPEECH_END_SILENCE_MS) {
        this.inTurn = false;
        this.speaking = false;
        this.level = 0;
        this.onBoundary?.({ kind: "end" });
      }
    }

    return this.speaking;
  }

  /** Smoothed 0..1 level, for the "is anyone talking" indicator. */
  get meter(): number {
    return Math.min(1, this.level * 6);
  }

  /**
   * Close any turn in progress. Deliberately keeps `noiseFloor` and
   * `framesSeen`: relearning the floor between turns would let a loud
   * interjection from the other person redefine "background" and slowly raise
   * the gate until quiet speech stopped registering.
   */
  reset(): void {
    this.speaking = false;
    this.inTurn = false;
    this.level = 0;
    this.silentMs = 0;
    this.msPerFrame = 0;
  }

  /**
   * Track the quiet background so the gate adapts to the room.
   *
   * The floor is the running *maximum* of recent frames, not a plain average:
   * a mean would be dragged down by silence and up by speech, so it would sit
   * somewhere useless. Taking the max over a short window instead estimates
   * "the loudest thing that isn't speech" — the peak of the room tone.
   *
   * Tracking stops permanently once a turn has opened. The floor captured
   * before anyone started talking is the honest one, and letting it climb
   * mid-conversation would desensitise the gate turn by turn.
   */
  private updateFloor(rms: number): void {
    if (this.inTurn) return;
    if (this.silentMs < 250) return; // during the tail of a turn, not room tone

    this.framesSeen++;
    if (this.framesSeen <= FLOOR_TRACKING_FRAMES) {
      this.noiseFloor = Math.max(this.noiseFloor, Math.min(rms, MAX_FLOOR_RMS));
    }
  }
}
