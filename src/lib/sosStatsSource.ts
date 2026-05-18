import type { SosCardStat } from '../sosCardStat'
import { buildBundledSosMap, normalizeSosKey } from '../sosLookup'
import { getSupabaseBrowserClient } from './supabaseClient'

type CardAggregateRow = {
  set_code: string
  card_name: string
  gih_wr_percent: number | string | null
  n_gih: number | string | null
  pick_count: number | string | null
  avg_pick_number: number | string | null
}

function copyBundled(): Record<string, SosCardStat> {
  return { ...buildBundledSosMap() }
}

function mergeRow(prev: SosCardStat | undefined, next: SosCardStat): SosCardStat {
  return {
    displayName: next.displayName || prev?.displayName || '',
    pickCount: next.pickCount ?? prev?.pickCount,
    avgPickNumber: next.avgPickNumber ?? prev?.avgPickNumber,
    avgPackNumber: next.avgPackNumber ?? prev?.avgPackNumber,
    pickRate: next.pickRate ?? prev?.pickRate,
    gihWrPercent: next.gihWrPercent ?? prev?.gihWrPercent,
    nGih: next.nGih ?? prev?.nGih,
  }
}

function rowToStat(row: CardAggregateRow): SosCardStat {
  const display = row.card_name.trim()
  const stat: SosCardStat = { displayName: display || row.card_name }

  if (row.gih_wr_percent != null) {
    stat.gihWrPercent = Number(row.gih_wr_percent)
  }
  if (row.n_gih != null) {
    stat.nGih = Math.max(0, Math.floor(Number(row.n_gih)))
  }
  if (row.pick_count != null) {
    stat.pickCount = Math.max(0, Math.floor(Number(row.pick_count)))
  }
  if (row.avg_pick_number != null) {
    stat.avgPickNumber = Number(row.avg_pick_number)
  }
  return stat
}

async function loadMergedOnce(): Promise<Record<string, SosCardStat>> {
  const merged = copyBundled()
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    return merged
  }

  let data: CardAggregateRow[] | null = null
  const withPick = await supabase
    .from('card_aggregates')
    .select('set_code, card_name, gih_wr_percent, n_gih, pick_count, avg_pick_number')

  if (!withPick.error && withPick.data) {
    data = withPick.data as CardAggregateRow[]
  } else {
    const legacy = await supabase
      .from('card_aggregates')
      .select('set_code, card_name, gih_wr_percent, n_gih')
    if (!legacy.error && legacy.data) {
      data = legacy.data as CardAggregateRow[]
    }
  }

  if (!data) {
    return merged
  }

  for (const raw of data as CardAggregateRow[]) {
    const key = normalizeSosKey(raw.card_name)
    if (!key) {
      continue
    }
    merged[key] = mergeRow(merged[key], rowToStat(raw))
  }
  return merged
}

let cache: Record<string, SosCardStat> | null = null
let inflight: Promise<Record<string, SosCardStat>> | null = null

export async function getMergedSosCardStats(): Promise<Record<string, SosCardStat>> {
  if (cache) {
    return cache
  }
  if (!inflight) {
    inflight = loadMergedOnce().then((map) => {
      cache = map
      inflight = null
      return map
    })
  }
  return inflight
}
