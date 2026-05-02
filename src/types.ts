export type Rank = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'mythic'

export interface DraftContext {
  packNumber: number
  pickNumber: number
  rank: Rank
  availableCards: string[]
  poolCards: string[]
}

export interface AlternativePick {
  card: string
  score: number
}

export interface RecommendationResponse {
  topPick: string
  alternatives: AlternativePick[]
  confidence: number
  reasons: string[]
  evidence: {
    sampleSize: number
    winRateTopPick: number
  }
}

export interface ChatResponse {
  answer: string
  citations: string[]
  followUps: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}
