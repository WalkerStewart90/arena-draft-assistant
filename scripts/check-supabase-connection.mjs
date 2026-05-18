import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env.local')

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

const fileEnv = loadEnvFile(envPath)
const url = process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY ?? fileEnv.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('FAIL: Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}
if (url.includes('/rest/v1')) {
  console.error('FAIL: VITE_SUPABASE_URL must not include /rest/v1')
  process.exit(1)
}

console.log('Env OK: project host', new URL(url).host)
console.log('Key prefix:', key.slice(0, 16) + '...')

const supabase = createClient(url, key)
const { data, error } = await supabase
  .from('card_aggregates')
  .select('set_code, card_name, gih_wr_percent')
  .limit(5)

if (error) {
  console.error('FAIL:', error.message)
  process.exit(1)
}

console.log('OK: Supabase REST API reachable with anon/publishable key.')
console.log('Rows returned:', data?.length ?? 0)
if (data?.length) {
  for (const row of data) {
    console.log(`  - [${row.set_code}] ${row.card_name} (${row.gih_wr_percent}%)`)
  }
} else {
  console.log('(No rows in card_aggregates — connection works; add data in Table Editor.)')
}
