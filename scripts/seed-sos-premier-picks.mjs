/**
 * Upsert SOS Premier pick aggregates into card_aggregates (service role — local only).
 *
 *   set SUPABASE_URL=https://xxx.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
 *   node scripts/seed-sos-premier-picks.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const jsonPath = path.join(root, 'data', 'sosPremierPickStats.json')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }
  const env = {}
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

const fileEnv = loadEnvFile(path.join(root, '.env.local'))
const url = (process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL)?.trim()
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY)?.trim()

if (!url || !serviceKey) {
  console.error('Missing credentials. Add to .env.local (not committed):')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=sb_secret_...')
  console.error('  (SUPABASE_URL optional if VITE_SUPABASE_URL is set)')
  console.error('Or run SQL in dashboard: supabase/seed_sos_premier_full.sql')
  process.exit(1)
}

if (!fs.existsSync(jsonPath)) {
  console.error('Missing data/sosPremierPickStats.json — run aggregate:sos-premier first.')
  process.exit(1)
}

const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const cards = payload.cards ?? []
const supabase = createClient(url, serviceKey)

const batchSize = 200
let upserted = 0

for (let i = 0; i < cards.length; i += batchSize) {
  const slice = cards.slice(i, i + batchSize).map((row) => ({
    set_code: 'SOS',
    card_name: row.displayName,
    pick_count: row.pickCount,
    avg_pick_number: row.avgPickNumber,
    data_source: 'premier_draft',
  }))

  const { error } = await supabase.from('card_aggregates').upsert(slice, {
    onConflict: 'set_code,card_name',
  })

  if (error) {
    console.error('Upsert failed:', error.message)
    if (error.code === '42501') {
      console.error('Run in Supabase SQL Editor: supabase/migrations/003_card_aggregates_service_role_grants.sql')
    } else {
      console.error('If columns are missing, run supabase/migrations/002_card_aggregates_pick_columns.sql')
    }
    process.exit(1)
  }
  upserted += slice.length
  console.log('Upserted', upserted, '/', cards.length)
}

console.log('Done.')
