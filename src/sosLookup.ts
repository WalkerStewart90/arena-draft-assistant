import { SOS_CARD_STATS } from './data/sosGiwr.generated'
import { SOS_PREMIER_PICK_STATS } from './data/sosPremierPickStats.generated'
import type { SosCardStat } from './sosCardStat'

export function normalizeSosKey(name: string): string {
  return name.trim().toLowerCase()
}

/** Bundled Premier pick aggregates + optional beta GIH overlay. */
export function buildBundledSosMap(): Record<string, SosCardStat> {
  const merged: Record<string, SosCardStat> = {}

  for (const [key, row] of Object.entries(SOS_PREMIER_PICK_STATS)) {
    merged[key] = {
      displayName: row.displayName,
      pickCount: row.pickCount,
      avgPickNumber: row.avgPickNumber,
      avgPackNumber: row.avgPackNumber,
      pickRate: row.pickRate,
    }
  }

  for (const [key, row] of Object.entries(SOS_CARD_STATS)) {
    const prev = merged[key]
    merged[key] = {
      displayName: prev?.displayName ?? row.displayName,
      pickCount: prev?.pickCount,
      avgPickNumber: prev?.avgPickNumber,
      avgPackNumber: prev?.avgPackNumber,
      pickRate: prev?.pickRate,
      gihWrPercent: row.gihWrPercent,
      nGih: row.nGih,
    }
  }

  return merged
}

const BUNDLED_SOS_MAP = buildBundledSosMap()

export function getSosStat(name: string): SosCardStat | null {
  const key = normalizeSosKey(name)
  return BUNDLED_SOS_MAP[key] ?? null
}

export function getSosStatFromMap(map: Record<string, SosCardStat>, name: string): SosCardStat | null {
  const key = normalizeSosKey(name)
  return map[key] ?? null
}

export function isKnownSosCard(name: string): boolean {
  return normalizeSosKey(name) in BUNDLED_SOS_MAP
}
