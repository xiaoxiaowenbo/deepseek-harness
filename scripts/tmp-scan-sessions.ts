/**
 * Temporary diagnostic: scan recent session logs for a failure text. Not part of the repo.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { decompressZstdFrame, scanZstdFrames } from '../packages/session/session-persistence-jsonl/src/zstd.ts'

const root = process.argv[2]
const needle = process.argv[3] ?? 'indexOf'
let hits = 0
for (const dir of readdirSync(root)) {
  const sessionDir = join(root, dir)
  if (!isDirectory(sessionDir)) continue
  for (const name of readdirSync(sessionDir).filter(n => n.endsWith('.zstd') || n.endsWith('.jsonl'))) {
    const bytes = readFileSync(join(sessionDir, name))
    let plain = ''
    if (name.endsWith('.zstd')) {
      const { frames } = scanZstdFrames(bytes, 1_000_000)
      for (const { start, end } of frames) {
        plain += Buffer.from(await decompressZstdFrame(bytes.subarray(start, end))).toString('utf8')
      }
    } else {
      plain = bytes.toString('utf8')
    }
    if (!plain.includes(needle)) continue
    hits += 1
    console.log(`=== ${dir}/${name} (hits: ${count(plain, needle)}) ===`)
    for (const line of plain.split('\n')) {
      if (line.includes(needle)) console.log(line.slice(0, 1200))
    }
  }
}
console.log(`total sessions with needle: ${hits}`)

function count(haystack: string, needle: string): number {
  let n = 0
  let at = haystack.indexOf(needle)
  while (at >= 0) { n += 1; at = haystack.indexOf(needle, at + 1) }
  return n
}

function isDirectory(path: string): boolean {
  try {
    return readdirSync(path).length >= 0
  } catch {
    return false
  }
}
