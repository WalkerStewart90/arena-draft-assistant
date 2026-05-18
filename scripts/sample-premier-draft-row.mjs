import fs from 'fs'
import readline from 'readline'

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
const rl = readline.createInterface({ input: fs.createReadStream(path, { encoding: 'utf8' }) })
let header = null
let rowNum = 0
for await (const line of rl) {
  if (!header) {
    header = parseCsvLine(line)
    const idx = (name) => header.indexOf(name)
    console.log('indices', {
      pick: idx('pick'),
      pick_2: idx('pick_2'),
      pack_number: idx('pack_number'),
      pick_number: idx('pick_number'),
      rank: idx('rank'),
      pick_maindeck_rate: idx('pick_maindeck_rate'),
    })
    continue
  }
  rowNum++
  const cols = parseCsvLine(line)
  const get = (name) => cols[header.indexOf(name)] ?? ''
  console.log('sample row', rowNum, {
    expansion: get('expansion'),
    rank: get('rank'),
    pack_number: get('pack_number'),
    pick_number: get('pick_number'),
    pick: get('pick'),
    pick_2: get('pick_2'),
    pick_maindeck_rate: get('pick_maindeck_rate'),
  })
  if (rowNum >= 3) break
}
