export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/config.js") {
      const config = {
        backendOrigin: env.VITE_BACKEND_ORIGIN,
        controlOrigin: env.VITE_CONTROL_ORIGIN,
        supabaseUrl: env.VITE_SUPABASE_URL,
        supabasePublishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      };
      return new Response(`window.__EMOTION_CONFIG__=${JSON.stringify(config)};`, {
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
