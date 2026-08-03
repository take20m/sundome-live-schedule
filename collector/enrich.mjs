#!/usr/bin/env node
// 期間情報が欠けている公演を /api/missing から取得し、
// アーティスト単位の集中 claude -p で受付期間を補強して ingest する(2段ロケットの2段目)
// 使い方: INGEST_URL=... INGEST_TOKEN=... node collector/enrich.mjs [maxArtists]
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'

const ingestUrl = process.env.INGEST_URL
const ingestToken = process.env.INGEST_TOKEN
const maxArtists = Number(process.argv[2] ?? 3)

if (!ingestUrl || !ingestToken) {
  console.error('enrich: INGEST_URL / INGEST_TOKEN が必要')
  process.exit(1)
}

const res = await fetch(new URL('/api/missing', ingestUrl), {
  headers: { authorization: `Bearer ${ingestToken}` },
})
if (!res.ok) {
  console.error(`enrich: /api/missing がエラー: ${res.status}`)
  process.exit(1)
}
const { events } = await res.json()
if (events.length === 0) {
  console.log('enrich: 期間未確認の公演なし。スキップ')
  process.exit(0)
}

// アーティスト単位にまとめ、公演日が近い順に最大 maxArtists 組
const byArtist = new Map()
for (const e of events) {
  const list = byArtist.get(e.artist) ?? []
  list.push(e)
  byArtist.set(e.artist, list)
}
const targets = [...byArtist.entries()]
  .sort((a, b) => a[1][0].date.localeCompare(b[1][0].date))
  .slice(0, maxArtists)

console.log(`enrich: 対象 ${targets.length} 組 / 欠落公演 ${events.length} 件`)
mkdirSync('collector/out', { recursive: true })
const template = readFileSync('collector/enrich-prompt.md', 'utf8')

let failures = 0
for (const [artist, artistEvents] of targets) {
  const slug = createHash('sha256').update(artist).digest('hex').slice(0, 8)
  const outFile = `collector/out/enrich-${slug}.json`
  const eventLines = artistEvents
    .map((e) => `- ${e.artist}「${e.title}」 ${e.date} @ サンドーム福井`)
    .join('\n')
  const prompt = template
    .replaceAll('{{ARTIST}}', artist)
    .replaceAll('{{EVENT_LINES}}', eventLines)
    .replaceAll('{{OUT_FILE}}', outFile)

  console.log(`\n=== enrich: ${artist} (${artistEvents.length}公演) ===`)
  try {
    execFileSync(
      'claude',
      [
        '-p', prompt,
        '--allowedTools', 'WebSearch,WebFetch,Edit(collector/out/**)',
        '--permission-mode', 'acceptEdits',
        '--max-turns', '40',
        '--output-format', 'text',
      ],
      { stdio: 'inherit', timeout: 8 * 60 * 1000 },
    )
    if (!existsSync(outFile)) {
      console.error(`enrich: ${artist} の出力ファイルなし。スキップ`)
      failures++
      continue
    }
    // 検証+ingest は既存の validate.mjs に委譲
    execFileSync('node', ['collector/validate.mjs', outFile], {
      stdio: 'inherit',
      env: process.env,
    })
  } catch (e) {
    console.error(`enrich: ${artist} で失敗: ${e.message}(続行)`)
    failures++
  }
}

console.log(`\nenrich: 完了(${targets.length - failures}/${targets.length} 成功)`)
// 補強は best-effort: 一部失敗しても本収集は成功扱いにする
process.exit(0)
