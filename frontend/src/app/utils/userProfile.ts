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

export function getSessionQuote(): { text: string; author: string } {
  const stored = localStorage.getItem(QUOTE_STORAGE_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored);
      // Check if it's from the same session (within last 4 hours)
      if (Date.now() - data.timestamp < 4 * 60 * 60 * 1000) {
        return data.quote;
      }
    } catch {
      // Fall through to generate new quote
    }
  }

  // Generate new quote
  const quote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
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
