/**
 * Stream 17lands Premier Draft public CSV and aggregate per-card pick stats.
 * Only parses the leading meta columns (stops before pack_card_*).
 *
 * Usage:
 *   node scripts/aggregate-sos-premier-picks.mjs "C:/path/to/file.csv"
 *   LIMIT=50000 node scripts/aggregate-sos-premier-picks.mjs ...
 */
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const PACK_CARD_MARKER = ',pack_card_'

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      q = !q
      continue
    }
    if (ch === ',' && !q) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function prefixLine(line) {
  const idx = line.indexOf(PACK_CARD_MARKER)
  return idx >= 0 ? line.slice(0, idx) : line
}

const inputPath = process.argv[2]
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Usage: node scripts/aggregate-sos-premier-picks.mjs <premier-draft.csv>')
  process.exit(1)
}

const limitRows = process.env.LIMIT ? Number.parseInt(process.env.LIMIT, 10) : Infinity
const outJson = path.join(root, 'data', 'sosPremierPickStats.json')

/** @type {Map<string, { displayName: string; pickCount: number; pickNumberSum: number; packNumberSum: number }>} */
const byCard = new Map()
let totalPicks = 0
let rows = 0
let header = null
let col = {}

const rl = readline.createInterface({
  input: fs.createReadStream(inputPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
})

console.log('Reading', inputPath)
if (Number.isFinite(limitRows)) {
  console.log('LIMIT rows:', limitRows)
}

for await (const rawLine of rl) {
  const line = prefixLine(rawLine)
  if (!header) {
    header = parseCsvLine(line)
    col = {
      pick: header.indexOf('pick'),
      pack: header.indexOf('pack_number'),
      pickNum: header.indexOf('pick_number'),
      expansion: header.indexOf('expansion'),
    }
    if (col.pick < 0) {
      console.error('Missing pick column')
      process.exit(1)
    }
    continue
  }

  rows++
  if (rows > limitRows) break

  const fields = parseCsvLine(line)
  const name = fields[col.pick]?.trim()
  if (!name) continue

  const packNum = col.pack >= 0 ? Number.parseInt(fields[col.pack] ?? '', 10) : 0
  const pickNum = col.pickNum >= 0 ? Number.parseInt(fields[col.pickNum] ?? '', 10) : 0

  totalPicks++
  const key = name.toLowerCase()
  const prev = byCard.get(key)
  if (prev) {
    prev.pickCount++
    if (Number.isFinite(pickNum)) prev.pickNumberSum += pickNum
    if (Number.isFinite(packNum)) prev.packNumberSum += packNum
  } else {
    byCard.set(key, {
      displayName: name,
      pickCount: 1,
      pickNumberSum: Number.isFinite(pickNum) ? pickNum : 0,
      packNumberSum: Number.isFinite(packNum) ? packNum : 0,
    })
  }

  if (rows % 500000 === 0) {
    console.log('  rows', rows.toLocaleString(), 'unique cards', byCard.size.toLocaleString())
  }
}

const cards = [...byCard.values()]
  .map((row) => ({
    displayName: row.displayName,
    pickCount: row.pickCount,
    avgPickNumber: row.pickCount ? Number((row.pickNumberSum / row.pickCount).toFixed(3)) : 0,
    avgPackNumber: row.pickCount ? Number((row.packNumberSum / row.pickCount).toFixed(3)) : 0,
    pickRate: totalPicks ? Number(((row.pickCount / totalPicks) * 100).toFixed(4)) : 0,
  }))
  .sort((a, b) => b.pickCount - a.pickCount)

const payload = {
  generatedAt: new Date().toISOString(),
  sourceFile: path.basename(inputPath),
  rowsProcessed: rows,
  totalPicks,
  uniqueCards: cards.length,
  cards,
}

fs.mkdirSync(path.dirname(outJson), { recursive: true })
fs.writeFileSync(outJson, JSON.stringify(payload), 'utf8')
console.log('Wrote', path.relative(root, outJson))
console.log('Rows:', rows.toLocaleString(), 'Picks:', totalPicks.toLocaleString(), 'Cards:', cards.length)
