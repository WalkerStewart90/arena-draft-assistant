import type { ChatResponse, DraftContext, RecommendationResponse } from './types'
import { getMergedSosCardStats } from './lib/sosStatsSource'
import { getSosStatFromMap } from './sosLookup'

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
      return stat
        ? { card, gihWrPercent: stat.gihWrPercent, nGih: stat.nGih }
        : { card, gihWrPercent: -1, nGih: 0 }
    })
    .filter((row) => row.gihWrPercent >= 0)
    .sort((a, b) => b.gihWrPercent - a.gihWrPercent)

  const top = scored[0]
  const topPick = top?.card ?? 'No valid cards provided'
  const topStat = top ? getSosStatFromMap(sosMap, top.card) : null
  const alternatives = scored.slice(1, 3).map((row) => ({
    card: row.card,
    score: Number((row.gihWrPercent / 100).toFixed(4)),
  }))

  const n = topStat?.nGih ?? 0
  const gihDecimal = topStat ? topStat.gihWrPercent / 100 : 0

  return {
    topPick,
    alternatives,
    confidence: confidenceFromSampleSize(n),
    reasons: [
      `${topPick} has the highest Games-In-Hand win rate (GIH WR) among cards you listed, based on early-season aggregates.`,
      'Pack, pick, and rank are not used in Beta — comparison is GIH WR only.',
    ],
    evidence: {
      sampleSize: n,
      winRateTopPick: Number(gihDecimal.toFixed(4)),
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
      const better = statA.gihWrPercent >= statB.gihWrPercent ? statA : statB
      const worse = statA.gihWrPercent >= statB.gihWrPercent ? statB : statA
      const gap = Math.abs(statA.gihWrPercent - statB.gihWrPercent)
      return {
        answer: [
          `By GIH WR: ${better.displayName} (${better.gihWrPercent.toFixed(1)}%, n=${better.nGih.toLocaleString()})`,
          `vs ${worse.displayName} (${worse.gihWrPercent.toFixed(1)}%, n=${worse.nGih.toLocaleString()}).`,
          `Gap ≈ ${gap.toFixed(1)} percentage points (Beta — early-season aggregates).`,
        ].join(' '),
        citations: ['SOS aggregate CSV → GIH WR', 'Games in hand sample (# GIH)'],
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
        `GIH WR focus (Beta): ${stat.displayName} is at ${stat.gihWrPercent.toFixed(1)}% GIH WR with ${stat.nGih.toLocaleString()} games-in-hand sample.`,
        `Your question: "${question}" — try "Is [Card A] better than [Card B]?" for a direct GIH WR comparison.`,
      ].join(' '),
      citations: ['SOS aggregate CSV → GIH WR'],
      followUps: ['Compare two cards by name ("X vs Y").', 'List candidates under Available cards and click Get Recommendation.'],
    }
  }

  return {
    answer:
      'Beta mode answers quick GIH WR questions. Name two cards in a compare ("Card A vs Card B"), or list cards under Available cards and use Get Recommendation.',
    citations: ['SOS aggregate CSV → GIH WR'],
    followUps: ['Try: "Is Practiced Offense better than Together as One?"', 'Fill Available cards (one per line) from your current pack.'],
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
