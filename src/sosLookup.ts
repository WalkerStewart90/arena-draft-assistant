import { SOS_CARD_STATS } from './data/sosGiwr.generated'

export function normalizeSosKey(name: string): string {
  return name.trim().toLowerCase()
}

export function getSosStat(name: string) {
  const key = normalizeSosKey(name)
  return SOS_CARD_STATS[key] ?? null
}

export function isKnownSosCard(name: string): boolean {
  return normalizeSosKey(name) in SOS_CARD_STATS
}
