#!/usr/bin/env node
// collector の出力を検証し、Worker の ingest API へ送信する
// 使い方: INGEST_URL=https://... INGEST_TOKEN=... node collector/validate.mjs collector/out/events.json
import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? 'collector/out/events.json'
const ingestUrl = process.env.INGEST_URL
const ingestToken = process.env.INGEST_TOKEN

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const URL_RE = /^https?:\/\//

function fail(msg) {
  console.error(`validate: NG - ${msg}`)
  process.exit(1)
}

let data
try {
  data = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  fail(`${file} を読めない/JSONとして不正: ${e.message}`)
}

if (!Array.isArray(data.events)) fail('events 配列がない')

const errors = []
const check = (cond, msg) => cond || errors.push(msg)

for (const [i, ev] of data.events.entries()) {
  check(typeof ev.title === 'string' && ev.title.trim(), `events[${i}].title`)
  check(typeof ev.artist === 'string' && ev.artist.trim(), `events[${i}].artist`)
  check(DATE_RE.test(ev.date ?? ''), `events[${i}].date (${ev.date})`)
  check(ev.open_time == null || TIME_RE.test(ev.open_time), `events[${i}].open_time`)
  check(ev.start_time == null || TIME_RE.test(ev.start_time), `events[${i}].start_time`)
  check(ev.source_url == null || URL_RE.test(ev.source_url), `events[${i}].source_url`)
  check(ev.artist_url == null || URL_RE.test(ev.artist_url), `events[${i}].artist_url`)
  check(['official', 'inferred'].includes(ev.confidence), `events[${i}].confidence`)
  check(Array.isArray(ev.lotteries), `events[${i}].lotteries`)
  for (const [j, l] of (ev.lotteries ?? []).entries()) {
    check(typeof l.name === 'string' && l.name.trim(), `events[${i}].lotteries[${j}].name`)
    check(l.starts_at == null || !Number.isNaN(Date.parse(l.starts_at)), `events[${i}].lotteries[${j}].starts_at`)
    check(l.ends_at == null || !Number.isNaN(Date.parse(l.ends_at)), `events[${i}].lotteries[${j}].ends_at`)
    check(l.url == null || URL_RE.test(l.url), `events[${i}].lotteries[${j}].url`)
    check(['official', 'inferred'].includes(l.confidence), `events[${i}].lotteries[${j}].confidence`)
    check(l.sold_out === undefined || typeof l.sold_out === 'boolean', `events[${i}].lotteries[${j}].sold_out`)
  }
}

if (errors.length > 0) fail(`スキーマ違反 ${errors.length} 件:\n  ${errors.join('\n  ')}`)

const lotteryCount = data.events.reduce((n, e) => n + e.lotteries.length, 0)
console.log(`validate: OK - 公演 ${data.events.length} 件 / 抽選 ${lotteryCount} 件`)

if (!ingestUrl || !ingestToken) {
  console.log('INGEST_URL / INGEST_TOKEN 未設定のため送信はスキップ(検証のみ)')
  process.exit(0)
}

const res = await fetch(new URL('/api/ingest', ingestUrl), {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${ingestToken}`,
  },
  body: JSON.stringify({ events: data.events }),
})

const body = await res.text()
if (!res.ok) fail(`ingest API がエラー: ${res.status} ${body}`)
console.log(`ingest: OK - ${body}`)
