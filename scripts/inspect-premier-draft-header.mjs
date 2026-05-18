import fs from 'fs'

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

const path = process.argv[2]
if (!path) {
  console.error('Usage: node inspect-premier-draft-header.mjs <csv-path>')
  process.exit(1)
}

const fd = fs.openSync(path, 'r')
const buf = Buffer.alloc(512 * 1024)
const n = fs.readSync(fd, buf, 0, buf.length, 0)
fs.closeSync(fd)
const text = buf.slice(0, n).toString('utf8')
const nl = text.indexOf('\n')
const header = text.slice(0, nl).replace(/\r$/, '')
const cols = parseCsvLine(header)

console.log('column count:', cols.length)
const meta = cols.filter((c) => !c.startsWith('pack_card_') && !c.startsWith('pool_'))
console.log('\nMeta / pick columns:')
for (const c of meta) {
  console.log(' ', c)
}
