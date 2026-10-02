export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  bio?: string;
  createdAt: number;
  theme: "light" | "dark" | "system";
}

const USER_STORAGE_KEY = "emotionmonitor_user";
const DEFAULT_USER: UserProfile = {
  id: "user-1",
  name: "User",
  email: "user@example.com",
  createdAt: Date.now(),
  theme: "system",
};

export function getUser(): UserProfile {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_USER;
    }
  }
  return DEFAULT_USER;
}

export function saveUser(user: UserProfile): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function updateUser(updates: Partial<UserProfile>): UserProfile {
  const user = getUser();
  const updated = { ...user, ...updates };
  saveUser(updated);
  return updated;
}

// A single generic fallback for the rare case the backend itself is
// unreachable (network down, backend crashed) — the backend already has
// its own fallback for when the upstream quotes API specifically fails,
// so this only ever shows when things are more broadly degraded.
const OFFLINE_FALLBACK_QUOTE = {
  text: "Take a moment to reflect on how you're feeling.",
  author: "Emphona",
};

function normalizeQuote(value: Partial<{ text: string; author: string }> | null | undefined) {
  return {
    text: value?.text?.trim() || OFFLINE_FALLBACK_QUOTE.text,
    author: value?.author?.trim() || OFFLINE_FALLBACK_QUOTE.author,
  };
}

const QUOTE_STORAGE_KEY = "emotionmonitor_session_quote";

// One quote per day — matches the backend's own per-calendar-day cache, so
// this is purely to avoid an extra network round-trip on every page load
// within the same day, not a second source of "freshness".
const quoteDate = () => new Date().toISOString().slice(0, 10);

export async function getSessionQuote(): Promise<{ text: string; author: string }> {
  const stored = localStorage.getItem(QUOTE_STORAGE_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored);
      if (data.date === quoteDate()) {
        return normalizeQuote(data.quote);
      }
    } catch {
      // Fall through to fetch a new quote
    }
  }

  let quote: { text: string; author: string };
  try {
    // Lazily imported to avoid a circular import between this file and
    // api/client.ts at module-load time.
    const { getQuote } = await import("../api/client");
    quote = normalizeQuote(await getQuote());
  } catch {
    // Backend unreachable or the upstream quotes API is down — the backend
    // already tries its own fallback list first, so reaching here means
    // both that and the request itself failed. Fall back locally rather
    // than leaving the dashboard with nothing.
    quote = OFFLINE_FALLBACK_QUOTE
  }

  localStorage.setItem(
      QUOTE_STORAGE_KEY,
       JSON.stringify({ quote, date: quoteDate() })
  );
  return quote;
}

export function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  
  if (hour < 12) {
    return "Good Morning";
  } else if (hour < 17) {
    return "Good Afternoon";
  } else if (hour < 22) {
    return "Good Evening";
  } else {
    return "Good Night";
  }
}
