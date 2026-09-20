#!/usr/bin/env node
// tour_url があって画像未取得の公演について、ツアーページの og:image を取り出して保存する(3段目)。
// LLM は使わない。1公演1リクエスト。失敗した公演は翌晩また対象になる(best effort)。
// 使い方: INGEST_URL=... INGEST_TOKEN=... node collector/fetch-images.mjs [maxEvents]
import { extractOgImage } from './og-image.mjs'

const ingestUrl = process.env.INGEST_URL
const ingestToken = process.env.INGEST_TOKEN
const maxEvents = Number(process.argv[2] ?? 20)
const USER_AGENT = 'sundome-live-schedule/1.0 (+https://sundome.take20m.dev/about)'
const MAX_HTML_BYTES = 512 * 1024

if (!ingestUrl || !ingestToken) {
  console.error('fetch-images: INGEST_URL / INGEST_TOKEN が必要')
  process.exit(1)
}
const auth = { authorization: `Bearer ${ingestToken}` }

const pending = await fetch(new URL('/api/images/pending', ingestUrl), { headers: auth })
if (!pending.ok) {
  console.error(`fetch-images: /api/images/pending がエラー: ${pending.status}`)
  process.exit(1)
}
const { events } = await pending.json()
if (events.length === 0) {
  console.log('fetch-images: 画像未取得の公演なし。スキップ')
  process.exit(0)
}
console.log(`fetch-images: 対象 ${Math.min(events.length, maxEvents)} / ${events.length} 件`)

const images = []
for (const e of events.slice(0, maxEvents)) {
  const label = `${e.artist}「${e.title}」 ${e.event_id}`
  try {
    const res = await fetch(e.tour_url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.log(`  skip ${label}: HTTP ${res.status}`)
      continue
    }
    const html = (await res.text()).slice(0, MAX_HTML_BYTES)
    const image = extractOgImage(html, res.url || e.tour_url)
    if (!image) {
      console.log(`  skip ${label}: og:image なし`)
      continue
    }
    images.push({ event_id: e.event_id, image_url: image })
    console.log(`  ok   ${label}: ${image}`)
  } catch (err) {
    console.log(`  skip ${label}: ${err.message}`)
  }
}

if (images.length === 0) {
  console.log('fetch-images: 取得できた画像なし')
  process.exit(0)
}
const post = await fetch(new URL('/api/images', ingestUrl), {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ images }),
})
const body = await post.text()
if (!post.ok) {
  console.error(`fetch-images: /api/images がエラー: ${post.status} ${body}`)
  process.exit(1)
}
console.log(`fetch-images: 保存 ${body}`)
