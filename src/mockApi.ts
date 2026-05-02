import type { ChatResponse, DraftContext, RecommendationResponse } from './types'

const CARD_STRENGTH: Record<string, number> = {
  "The Last Ronin": 94,
  "Shredder's Technique": 88,
  "Mona Lisa, Science Geek": 86,
  "Michelangelo, Game Master": 84,
  'Path to Exile': 91,
  'Doubling Season': 83,
}

function cardScore(cardName: string, context: DraftContext): number {
  const base = CARD_STRENGTH[cardName] ?? 65
  const earlyPickBonus = context.packNumber === 1 && context.pickNumber <= 3 ? 4 : 0
  const rankModifier = context.rank === 'diamond' || context.rank === 'mythic' ? 2 : 0
  return base + earlyPickBonus + rankModifier
}

export async function getRecommendation(
  context: DraftContext
): Promise<RecommendationResponse> {
  await new Promise((resolve) => setTimeout(resolve, 500))

  const scored = context.availableCards
    .map((card) => ({ card, score: cardScore(card, context) }))
    .sort((a, b) => b.score - a.score)

  const topPick = scored[0]?.card ?? 'No valid cards provided'
  const topScore = scored[0]?.score ?? 0
  const alternatives = scored.slice(1, 3).map((item) => ({
    card: item.card,
    score: Number((item.score / 100).toFixed(2)),
  }))

  return {
    topPick,
    alternatives,
    confidence: Number(Math.min(0.96, topScore / 100).toFixed(2)),
    reasons: [
      `${topPick} has the strongest baseline performance in this pack slot.`,
      'Your pool and rank context suggest this pick keeps the highest expected value.',
    ],
    evidence: {
      sampleSize: 12000 + context.pickNumber * 35,
      winRateTopPick: Number((0.52 + topScore / 500).toFixed(3)),
    },
  }
}

export async function askDraftAssistant(
  question: string,
  context: DraftContext,
  recommendation: RecommendationResponse | null
): Promise<ChatResponse> {
  await new Promise((resolve) => setTimeout(resolve, 600))

  const fallbackPick = context.availableCards[0] ?? 'No card selected'
  const topPick = recommendation?.topPick ?? fallbackPick
  const confidence = recommendation?.confidence ?? 0.5

  return {
    answer: [
      `Based on your current context, I would lean toward ${topPick}.`,
      `Confidence is ${(confidence * 100).toFixed(0)}% using this Phase 1 mock scoring model.`,
      `Question asked: "${question}"`,
    ].join(' '),
    citations: ['card_winrate_by_pickslot (mock)', 'card_pair_synergy (mock)'],
    followUps: [
      'Do you want the safest pick or highest upside pick?',
      'Should we evaluate a color pivot this pack?',
    ],
  }
}
