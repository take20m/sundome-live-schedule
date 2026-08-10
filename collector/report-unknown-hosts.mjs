#!/usr/bin/env node
// 購入ページと判定できなかった URL のホストを /api/unknown-hosts から取得し、
// GitHub Actions のジョブサマリに出す(新しいチケット販売サイトに人間が気づくための導線)。
// ホワイトリストの更新はあくまで手動。ここでは報告するだけ。
// 使い方: INGEST_URL=... INGEST_TOKEN=... node collector/report-unknown-hosts.mjs
import { appendFileSync } from 'node:fs'

const ingestUrl = process.env.INGEST_URL
const ingestToken = process.env.INGEST_TOKEN

if (!ingestUrl || !ingestToken) {
  console.error('report-unknown-hosts: INGEST_URL / INGEST_TOKEN が必要')
  process.exit(1)
}

const res = await fetch(new URL('/api/unknown-hosts', ingestUrl), {
  headers: { authorization: `Bearer ${ingestToken}` },
})
if (!res.ok) {
  console.error(`report-unknown-hosts: /api/unknown-hosts がエラー: ${res.status}`)
  process.exit(1)
}
const { hosts } = await res.json()

const lines = ['## 未知のチケット販売サイト候補', '']
if (hosts.length === 0) {
  lines.push('なし(受付中・受付前の URL はすべて判定済み)')
} else {
  lines.push(
    '購入ページと判定できずリンクを出していないホスト。',
    '**本当にチケットを購入・申込できるサイトなら** `src/lib/ticket-url.ts` の',
    '`PLAYGUIDE_HOSTS` に追加する。まとめサイト・転売サイト・ニュースメディアは追加しない。',
    '',
    '| ホスト | 件数 | URLの例 | 該当する受付 |',
    '| --- | --- | --- | --- |',
  )
  for (const h of hosts) {
    const samples = h.samples.map((s) => `\`${s}\``).join('<br>')
    const lots = h.lotteries.slice(0, 3).join('<br>')
    lines.push(`| \`${h.host}\` | ${h.count} | ${samples} | ${lots} |`)
  }
}

const out = lines.join('\n')
console.log(out)

// ローカル実行時は GITHUB_STEP_SUMMARY がないので標準出力だけで終わる
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out}\n`)
}
