#!/usr/bin/env node
// 過去にサンドーム福井で公演した出演者を毎晩数組ずつ見回り、次の公演が発表されていないかを
// 出演者の公式サイトの日程から探して ingest する。
// 会場名の検索では、多都市の日程表の 1 行にしか会場が出ない発表(ミュージカルの全国公演など)を拾えないため。
// 使い方: INGEST_URL=... INGEST_TOKEN=... node collector/watch.mjs [perNight]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'

const ingestUrl = process.env.INGEST_URL
const ingestToken = process.env.INGEST_TOKEN
const perNight = Number(process.argv[2] ?? 4)

if (!ingestUrl || !ingestToken) {
  console.error('watch: INGEST_URL / INGEST_TOKEN が必要')
  process.exit(1)
}

const res = await fetch(new URL('/api/regulars', ingestUrl), {
  headers: { authorization: `Bearer ${ingestToken}` },
})
if (!res.ok) {
  console.error(`watch: /api/regulars がエラー: ${res.status}`)
  process.exit(1)
}
const { artists } = await res.json()
if (artists.length === 0) {
  console.log('watch: 見回る出演者なし。スキップ')
  process.exit(0)
}

// 日付で順番に当てる(状態を持たずに、全員を数日で一巡する)
const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
const day = Math.floor(jstNow.getTime() / (24 * 60 * 60 * 1000))
const count = Math.min(perNight, artists.length)
const start = (day * count) % artists.length
const targets = Array.from({ length: count }, (_, i) => artists[(start + i) % artists.length])

const today = jstNow.toISOString().slice(0, 10)
const outFile = 'collector/out/watch.json'
const prompt = readFileSync('collector/watch-prompt.md', 'utf8')
  .replaceAll('{{TODAY}}', today)
  .replaceAll('{{YEAR}}', String(jstNow.getUTCFullYear() + 1))
  .replaceAll(
    '{{ARTIST_LINES}}',
    targets
      .map((a) => `- ${a.artist}(前回 ${a.last_date}、公式サイト: ${a.artist_url ?? '不明'})`)
      .join('\n'),
  )
  .replaceAll('{{OUT_FILE}}', outFile)

console.log(`watch: ${artists.length} 組中 ${count} 組を見回る: ${targets.map((a) => a.artist).join(' / ')}`)
mkdirSync('collector/out', { recursive: true })
try {
  execFileSync(
    'claude',
    [
      '-p', prompt,
      '--model', process.env.CLAUDE_MODEL ?? 'claude-opus-5-5',
      '--allowedTools', 'WebSearch,WebFetch,Edit(collector/out/**)',
      '--permission-mode', 'acceptEdits',
      '--max-turns', '40',
      '--output-format', 'text',
    ],
    { stdio: 'inherit', timeout: 10 * 60 * 1000 },
  )
  if (!existsSync(outFile)) {
    console.error('watch: 出力ファイルなし。スキップ')
    process.exit(0)
  }
  if (JSON.parse(readFileSync(outFile, 'utf8')).events?.length === 0) {
    console.log('watch: 新しい公演なし')
    process.exit(0)
  }
  // 検証+ingest は既存の validate.mjs に委譲
  execFileSync('node', ['collector/validate.mjs', outFile], { stdio: 'inherit', env: process.env })
} catch (e) {
  console.error(`watch: 失敗: ${e.message}(続行)`)
}
// 見回りは best-effort: 失敗しても本収集は成功扱いにする
process.exit(0)
