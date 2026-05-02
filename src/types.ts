export type Rank = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'mythic'

/** TMT = Teenage Mutant Ninja Turtles draft dataset; SOS = Spark of the Spark-style aggregate stats (Beta). */
export type ProductSetId = 'tmt' | 'sos'

export interface DraftContext {
  productSet: ProductSetId
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
