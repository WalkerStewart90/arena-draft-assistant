/** Unified SOS card row: Premier pick aggregates + optional beta GIH fields. */
export interface SosCardStat {
  displayName: string
  pickCount?: number
  avgPickNumber?: number
  avgPackNumber?: number
  pickRate?: number
  gihWrPercent?: number
  nGih?: number
}
