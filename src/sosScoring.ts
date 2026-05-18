import type { SosCardStat } from './sosCardStat'

/** Higher score = stronger recommendation. */
export function sosRecommendationScore(stat: SosCardStat): number {
  if ((stat.pickCount ?? 0) > 0 && stat.avgPickNumber != null) {
    const earlyPickBonus = Math.max(0, 14 - stat.avgPickNumber) * 6
    const volumeBonus = Math.min(12, Math.log10((stat.pickCount ?? 1) + 1) * 4)
    return earlyPickBonus + volumeBonus
  }
  if (stat.gihWrPercent != null && stat.gihWrPercent >= 0) {
    return stat.gihWrPercent
  }
  return -1
}

export function formatSosStatSummary(stat: SosCardStat): string {
  if ((stat.pickCount ?? 0) > 0 && stat.avgPickNumber != null) {
    return `${stat.displayName}: avg pick #${stat.avgPickNumber.toFixed(2)} (${(stat.pickCount ?? 0).toLocaleString()} picks logged, ${stat.pickRate?.toFixed(3) ?? '?'}% of pool)`
  }
  if (stat.gihWrPercent != null) {
    return `${stat.displayName}: ${stat.gihWrPercent.toFixed(1)}% GIH WR (n=${(stat.nGih ?? 0).toLocaleString()})`
  }
  return stat.displayName
}
