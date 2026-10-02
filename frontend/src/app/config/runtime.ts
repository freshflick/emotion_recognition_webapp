export interface RuntimeConfig {
  backendOrigin?: string;
  controlOrigin?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
}

declare global {
  interface Window {
    __EMOTION_CONFIG__?: RuntimeConfig;
  }
}

const runtime = typeof window !== "undefined" ? window.__EMOTION_CONFIG__ : undefined;
const buildTime = import.meta.env.DEV
  ? {
      backendOrigin: import.meta.env.VITE_BACKEND_ORIGIN ?? "",
      controlOrigin: import.meta.env.VITE_CONTROL_ORIGIN ?? "",
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
      supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    }
  : {};

// The Worker always serves config.js. Its presence is authoritative, even if
// a variable is temporarily missing; never fall back to a developer's local
// .env values in a deployed Worker.
const config = runtime ?? buildTime;

export const BACKEND_ORIGIN = (
  config.backendOrigin ?? ""
).replace(/\/$/, "");

export const CONTROL_ORIGIN = (
  config.controlOrigin ?? BACKEND_ORIGIN
).replace(/\/$/, "");

export const SUPABASE_URL = config.supabaseUrl ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  config.supabasePublishableKey ?? "";
