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
  : undefined;

export const BACKEND_ORIGIN = (
  runtime?.backendOrigin ?? buildTime?.backendOrigin ?? ""
).replace(/\/$/, "");

export const CONTROL_ORIGIN = (
  runtime?.controlOrigin ?? buildTime?.controlOrigin ?? BACKEND_ORIGIN
).replace(/\/$/, "");

export const SUPABASE_URL = runtime?.supabaseUrl ?? buildTime?.supabaseUrl ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  runtime?.supabasePublishableKey ?? buildTime?.supabasePublishableKey ?? "";
