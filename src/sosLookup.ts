import type { SosCardStat } from './data/sosGiwr.generated'
import { SOS_CARD_STATS } from './data/sosGiwr.generated'

export function normalizeSosKey(name: string): string {
  return name.trim().toLowerCase()
}

/** Bundled CSV / generated stats only (e.g. typeahead catalog). */
export function getSosStat(name: string) {
  const key = normalizeSosKey(name)
  return SOS_CARD_STATS[key] ?? null
}

export function getSosStatFromMap(map: Record<string, SosCardStat>, name: string): SosCardStat | null {
  const key = normalizeSosKey(name)
  return map[key] ?? null
}

export function isKnownSosCard(name: string): boolean {
  return normalizeSosKey(name) in SOS_CARD_STATS
}
