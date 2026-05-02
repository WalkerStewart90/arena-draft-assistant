import type { SosCardStat } from '../data/sosGiwr.generated'
import { SOS_CARD_STATS } from '../data/sosGiwr.generated'
import { normalizeSosKey } from '../sosLookup'
import { getSupabaseBrowserClient } from './supabaseClient'

type CardAggregateRow = {
  set_code: string
  card_name: string
  gih_wr_percent: number | string | null
  n_gih: number | string | null
}

function copyBundled(): Record<string, SosCardStat> {
  return { ...SOS_CARD_STATS }
}

function rowToStat(row: CardAggregateRow): SosCardStat {
  const gih =
    row.gih_wr_percent === null || row.gih_wr_percent === undefined
      ? 0
      : Number(row.gih_wr_percent)
  const n =
    row.n_gih === null || row.n_gih === undefined ? 0 : Math.max(0, Math.floor(Number(row.n_gih)))
  const display = row.card_name.trim()
  return { displayName: display || row.card_name, gihWrPercent: gih, nGih: n }
}

async function loadMergedOnce(): Promise<Record<string, SosCardStat>> {
  const bundled = copyBundled()
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    return bundled
  }

  const { data, error } = await supabase
    .from('card_aggregates')
    .select('set_code, card_name, gih_wr_percent, n_gih')

  if (error || !data) {
    return bundled
  }

  const merged: Record<string, SosCardStat> = { ...bundled }
  for (const raw of data as CardAggregateRow[]) {
    const key = normalizeSosKey(raw.card_name)
    if (!key) {
      continue
    }
    merged[key] = rowToStat(raw)
  }
  return merged
}

let cache: Record<string, SosCardStat> | null = null
let inflight: Promise<Record<string, SosCardStat>> | null = null

/** Merged SOS map: bundled data plus Supabase `card_aggregates` (DB wins on same normalized card name). Cached per session. */
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
