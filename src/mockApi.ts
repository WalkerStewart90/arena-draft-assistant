import type { ChatResponse, DraftContext, RecommendationResponse } from './types'
import { getMergedSosCardStats } from './lib/sosStatsSource'
import { getSosStatFromMap } from './sosLookup'
import { formatSosStatSummary, sosRecommendationScore } from './sosScoring'

const CARD_STRENGTH: Record<string, number> = {
  "The Last Ronin": 94,
  "Shredder's Technique": 88,
  'Mona Lisa, Science Geek': 86,
  'Michelangelo, Game Master': 84,
  'Path to Exile': 91,
  'Doubling Season': 83,
}

function cardScore(cardName: string, context: DraftContext): number {
  const base = CARD_STRENGTH[cardName] ?? 65
  const earlyPickBonus = context.packNumber === 1 && context.pickNumber <= 3 ? 4 : 0
  const rankModifier = context.rank === 'diamond' || context.rank === 'mythic' ? 2 : 0
  return base + earlyPickBonus + rankModifier
}

function confidenceFromSampleSize(n: number): number {
  if (n <= 0) {
    return 0.5
  }
  const scaled = Math.min(1, Math.log10(n + 10) / 4.5)
  return Number(Math.min(0.94, Math.max(0.55, scaled)).toFixed(2))
}

function cleanCardCandidate(value: string): string {
  return value
    .trim()
    .replace(/^[\s"'`]+|[\s"'`?.!,:;]+$/g, '')
    .replace(/\s+/g, ' ')
}

function extractComparedCards(questionText: string): string[] {
  const question = questionText.trim()
  const patterns = [
    /\bis\s+(.+?)\s+better than\s+(.+?)(?:\s+here)?\??$/i,
    /\bcompare\s+(.+?)\s+(?:vs|versus)\s+(.+?)\??$/i,
    /\b(.+?)\s+(?:vs|versus|or)\s+(.+?)\??$/i,
  ]

  for (const pattern of patterns) {
    const match = question.match(pattern)
    if (!match) {
      continue
    }
    return [cleanCardCandidate(match[1]), cleanCardCandidate(match[2])].filter(Boolean)
  }

  return []
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function getTmtRecommendation(context: DraftContext): Promise<RecommendationResponse> {
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

async function getSosRecommendation(context: DraftContext): Promise<RecommendationResponse> {
  const sosMap = await getMergedSosCardStats()
  const scored = context.availableCards
    .map((card) => {
      const stat = getSosStatFromMap(sosMap, card)
      const score = stat ? sosRecommendationScore(stat) : -1
      return stat ? { card, stat, score } : { card, stat: null, score: -1 }
    })
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  const topPick = top?.card ?? 'No valid cards provided'
  const topStat = top?.stat ?? null
  const alternatives = scored.slice(1, 3).map((row) => ({
    card: row.card,
    score: Number((row.score / 100).toFixed(4)),
  }))

  const sampleSize = topStat?.pickCount ?? topStat?.nGih ?? 0
  const winRateTopPick = topStat
    ? Number(
        (
          (topStat.gihWrPercent != null ? topStat.gihWrPercent / 100 : top.score / 100) || 0
        ).toFixed(4)
      )
    : 0

  return {
    topPick,
    alternatives,
    confidence: confidenceFromSampleSize(sampleSize),
    reasons: [
      `${topPick} ranks highest from SOS Premier Draft pick data (earlier average pick + volume).`,
      topStat?.gihWrPercent != null
        ? `Beta GIH WR reference: ${topStat.gihWrPercent.toFixed(1)}% (n=${(topStat.nGih ?? 0).toLocaleString()}).`
        : 'Ranking uses full public Premier Draft pick logs, not pack/pick context yet.',
    ],
    evidence: {
      sampleSize,
      winRateTopPick,
    },
  }
}

export async function getRecommendation(context: DraftContext): Promise<RecommendationResponse> {
  await delay(400)
  if (context.productSet === 'sos') {
    return getSosRecommendation(context)
  }
  return getTmtRecommendation(context)
}

async function askTmtAssistant(
  question: string,
  context: DraftContext,
  recommendation: RecommendationResponse | null
): Promise<ChatResponse> {
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

async function askSosAssistant(
  question: string,
  context: DraftContext,
  recommendation: RecommendationResponse | null
): Promise<ChatResponse> {
  const sosMap = await getMergedSosCardStats()
  const compared = extractComparedCards(question)
  if (compared.length === 2) {
    const [a, b] = compared
    const statA = getSosStatFromMap(sosMap, a)
    const statB = getSosStatFromMap(sosMap, b)
    if (statA && statB) {
      const scoreA = sosRecommendationScore(statA)
      const scoreB = sosRecommendationScore(statB)
      const better = scoreA >= scoreB ? statA : statB
      const worse = scoreA >= scoreB ? statB : statA
      return {
        answer: [
          `Preferred: ${formatSosStatSummary(better)}`,
          `vs ${formatSosStatSummary(worse)}.`,
        ].join(' '),
        citations: ['SOS Premier Draft public pick logs', 'Optional beta GIH WR overlay'],
        followUps: [
          'Add both to “Available cards” and run Get Recommendation for a ranked list.',
          'Ask about another pair using “A vs B”.',
        ],
      }
    }
  }

  const topPick = recommendation?.topPick ?? context.availableCards[0]
  const stat = topPick ? getSosStatFromMap(sosMap, topPick) : null
  if (stat) {
    return {
      answer: [
        formatSosStatSummary(stat),
        `Your question: "${question}" — try "Is [Card A] better than [Card B]?" for a direct comparison.`,
      ].join(' '),
      citations: ['SOS Premier Draft public pick logs'],
      followUps: ['Compare two cards by name ("X vs Y").', 'List candidates under Available cards and click Get Recommendation.'],
    }
  }

  return {
    answer:
      'SOS mode uses Premier Draft pick data. Name two cards ("Card A vs Card B"), or list cards under Available cards and use Get Recommendation.',
    citations: ['SOS Premier Draft public pick logs'],
    followUps: ['Try: "Is Practiced Offense better than Together as One?"', 'Fill Available cards from your current pack.'],
  }
}

export async function askDraftAssistant(
  question: string,
  context: DraftContext,
  recommendation: RecommendationResponse | null
): Promise<ChatResponse> {
  await delay(450)
  if (context.productSet === 'sos') {
    return askSosAssistant(question, context, recommendation)
  }
  return askTmtAssistant(question, context, recommendation)
}
