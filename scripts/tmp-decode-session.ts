/**
 * Temporary diagnostic: decode one persisted session log for the
 * `text.indexOf is not a function` investigation. Decodes every zstd
 * frame (the file is a concatenation of header + event batches).
 * Not part of the repo.
 */
import { readFileSync } from 'node:fs'
import { decompressZstdFrame, scanZstdFrames } from '../packages/session/session-persistence-jsonl/src/zstd.ts'

const file = process.argv[2]
if (file === undefined) throw new Error('usage: tmp-decode-session.ts <file.zstd>')
const bytes = readFileSync(file)
const { frames } = scanZstdFrames(bytes, 1_000_000)
const chunks: string[] = []
for (const { start, end } of frames) {
  const plain = await decompressZstdFrame(bytes.subarray(start, end))
  chunks.push(Buffer.from(plain).toString('utf8'))
}
console.log(`frames: ${frames.length}`)
console.log(chunks.join(''))
