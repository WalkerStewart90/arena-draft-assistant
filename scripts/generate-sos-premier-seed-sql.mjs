/**
 * Writes supabase/seed_sos_premier_full.sql (migration + upsert) for SQL Editor.
 * Usage: node scripts/generate-sos-premier-seed-sql.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const jsonPath = path.join(root, 'data', 'sosPremierPickStats.json')
const outPath = path.join(root, 'supabase', 'seed_sos_premier_full.sql')

if (!fs.existsSync(jsonPath)) {
  console.error('Missing data/sosPremierPickStats.json')
  process.exit(1)
}

const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const cards = payload.cards ?? []

function sqlStr(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

let sql = `-- Run once in Supabase SQL Editor (Arena-Draft-Assistant)
-- Source: ${payload.sourceFile ?? 'sosPremierPickStats.json'} | rows: ${payload.rowsProcessed ?? '?'} | cards: ${cards.length}

alter table public.card_aggregates
  add column if not exists pick_count integer,
  add column if not exists avg_pick_number numeric,
  add column if not exists data_source text default 'premier_draft';

insert into public.card_aggregates (set_code, card_name, pick_count, avg_pick_number, data_source)
values
`

const valueLines = cards.map(
  (row) =>
    `  ('SOS', ${sqlStr(row.displayName)}, ${row.pickCount}, ${row.avgPickNumber}, 'premier_draft')`
)
sql += valueLines.join(',\n')
sql += `
on conflict (set_code, card_name) do update set
  pick_count = excluded.pick_count,
  avg_pick_number = excluded.avg_pick_number,
  data_source = excluded.data_source,
  updated_at = now();
`

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, sql, 'utf8')
console.log('Wrote', path.relative(root, outPath), `(${cards.length} cards)`)
