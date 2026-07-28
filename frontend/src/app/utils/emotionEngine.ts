// Mock emotion data generator
export type Emotion = "happy" | "sad" | "angry" | "neutral" | "fearful" | "surprised";

export interface EmotionData {
  timestamp: number;
  audio: { [key in Emotion]: number };
  text: { [key in Emotion]: number };
  fused: { [key in Emotion]: number };
  dominantEmotion: Emotion;
  confidence: number;
  transcript?: string;
}

export interface Session {
  id: string;
  timestamp: number;
  duration: number;
  type: "live" | "upload";
  emotionData: EmotionData[];
  summary: {
    dominantEmotion: Emotion;
    averageConfidence: number;
    emotionDistribution: { [key in Emotion]: number };
  };
}

const EMOTIONS: Emotion[] = ["happy", "sad", "angry", "neutral", "fearful", "surprised"];

// Generate random emotion probabilities that sum to 1
export function generateEmotionScores(): { [key in Emotion]: number } {
  const scores: Partial<{ [key in Emotion]: number }> = {};
  let remaining = 1;
  
  EMOTIONS.forEach((emotion, index) => {
    if (index === EMOTIONS.length - 1) {
      scores[emotion] = remaining;
    } else {
      const value = Math.random() * remaining;
      scores[emotion] = value;
      remaining -= value;
    }
  });
  
  return scores as { [key in Emotion]: number };
}

// Generate mock emotion data with slight variations
export function generateMockEmotionData(timestamp: number, transcript?: string): EmotionData {
  const audioScores = generateEmotionScores();
  const textScores = generateEmotionScores();
  
  // Attention-based fusion with slight bias toward audio
  const fusedScores: Partial<{ [key in Emotion]: number }> = {};
  const audioWeight = 0.6;
  const textWeight = 0.4;
  
  EMOTIONS.forEach(emotion => {
    fusedScores[emotion] = 
      audioScores[emotion] * audioWeight + 
      textScores[emotion] * textWeight;
  });

  // Find dominant emotion
  const dominantEmotion = EMOTIONS.reduce((a, b) => 
    (fusedScores[a] || 0) > (fusedScores[b] || 0) ? a : b
  );

  return {
    timestamp,
    audio: audioScores,
    text: textScores,
    fused: fusedScores as { [key in Emotion]: number },
    dominantEmotion,
    confidence: fusedScores[dominantEmotion] || 0,
    transcript,
  };
}

// Generate mock transcript
const SAMPLE_PHRASES = [
  "I'm really excited about this project",
  "This is quite frustrating to deal with",
  "Let me explain the situation",
  "I completely understand your concern",
  "That's an interesting point",
  "I'm not sure about that approach",
  "This looks promising",
  "We need to address this immediately",
  "Thank you for your patience",
  "I'm happy to help with this",
];

export function generateMockTranscript(): string {
  return SAMPLE_PHRASES[Math.floor(Math.random() * SAMPLE_PHRASES.length)];
}

// Store sessions in memory
let sessions: Session[] = [];

export function addSession(session: Session) {
  sessions.unshift(session);
  if (sessions.length > 50) {
    sessions = sessions.slice(0, 50);
  }
}

export function getSessions(): Session[] {
  return sessions;
}

export function getSessionById(id: string): Session | undefined {
  return sessions.find(s => s.id === id);
}

// Calculate session summary
export function calculateSessionSummary(emotionData: EmotionData[]) {
  const emotionCounts: { [key in Emotion]: number } = {
    happy: 0,
    sad: 0,
    angry: 0,
    neutral: 0,
    fearful: 0,
    surprised: 0,
  };

  let totalConfidence = 0;

  emotionData.forEach(data => {
    emotionCounts[data.dominantEmotion]++;
    totalConfidence += data.confidence;
  });

  const dominantEmotion = EMOTIONS.reduce((a, b) =>
    emotionCounts[a] > emotionCounts[b] ? a : b
  );

  const total = emotionData.length;
  const emotionDistribution: Partial<{ [key in Emotion]: number }> = {};
  EMOTIONS.forEach(emotion => {
    emotionDistribution[emotion] = total > 0 ? emotionCounts[emotion] / total : 0;
  });

  return {
    dominantEmotion,
    averageConfidence: total > 0 ? totalConfidence / total : 0,
    emotionDistribution: emotionDistribution as { [key in Emotion]: number },
  };
}
