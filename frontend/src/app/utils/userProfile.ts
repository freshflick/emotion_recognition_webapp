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

// Motivational quotes
//
// This list is now only a fallback — getSessionQuote() below fetches a real
// quote from getQuote() (backend's /api/quote, which itself proxies a free
// public quotes API) and only falls back to picking from here if that
// request fails, so the dashboard never ends up with no quote at all.
const MOTIVATIONAL_QUOTES = [
  {
    text: "Your emotions are the slaves to your thoughts, and you are the slave to your emotions.",
    author: "Elizabeth Gilbert",
  },
  {
    text: "The best way to capture moments is to pay attention. This is how we cultivate mindfulness.",
    author: "Jon Kabat-Zinn",
  },
  {
    text: "Feelings are just visitors. Let them come and go.",
    author: "Mooji",
  },
  {
    text: "Emotion can be the enemy, if you give into your emotion, you lose yourself.",
    author: "Mike Tyson",
  },
  {
    text: "Understanding your emotions is the key to understanding yourself.",
    author: "Unknown",
  },
  {
    text: "One of the most courageous decisions you'll ever make is to finally let go of what is hurting your heart and soul.",
    author: "Brigitte Nicole",
  },
  {
    text: "The emotion that can break your heart is sometimes the very one that heals it.",
    author: "Nicholas Sparks",
  },
  {
    text: "Mastering others is strength. Mastering yourself is true power.",
    author: "Lao Tzu",
  },
  {
    text: "Your mind is a powerful thing. When you fill it with positive thoughts, your life will start to change.",
    author: "Unknown",
  },
  {
    text: "Be gentle with yourself. You're doing the best you can.",
    author: "Unknown",
  },
];

const QUOTE_STORAGE_KEY = "emotionmonitor_session_quote";

// One quote per day — matches the backend's own per-calendar-day cache, so
// this is purely to avoid an extra network round-trip on every page load
// within the same day, not a second source of "freshness".
const QUOTE_CACHE_MS = 24 * 60 * 60 * 1000;

export async function getSessionQuote(): Promise<{ text: string; author: string }> {
  const stored = localStorage.getItem(QUOTE_STORAGE_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored);
      if (Date.now() - data.timestamp < QUOTE_CACHE_MS) {
        return data.quote;
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
    quote = await getQuote();
  } catch {
    // Backend unreachable or the upstream quotes API is down — the backend
    // already tries its own fallback list first, so reaching here means
    // both that and the request itself failed. Fall back locally rather
    // than leaving the dashboard with nothing.
    quote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
  }

  localStorage.setItem(
      QUOTE_STORAGE_KEY,
      JSON.stringify({ quote, timestamp: Date.now() })
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
