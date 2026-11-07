#!/usr/bin/env node
// 本文に「サンドーム福井」を含む最近のニュースの見出しを Google ニュースの RSS 検索で集め、
// 1段目の収集の指示に添える節(collector/out/news.md)を書き出す。
// 多都市ツアーの発表は会場名が本文の日程表の 1 行にしか出ず、ふつうの検索では見つからないが、
// Google ニュースは本文まで検索する。LLM は使わない。1晩に検索語の数だけリクエストする。
// 失敗しても空の節を書いて終わる(best effort。収集は見出しなしで従来どおり動く)
// 使い方: node collector/news.mjs [days]
import { mkdirSync, writeFileSync } from 'node:fs'
import { parseNewsRss, renderNewsHints } from './news-feed.mjs'

const days = Number(process.argv[2] ?? 30)
const QUERIES = ['"サンドーム福井"', '"サンドーム福井" ツアー', '"サンドーム福井" 公演', '"サンドーム福井" ライブ']
const LIMIT = 40
const outFile = 'collector/out/news.md'

const items = []
for (const q of QUERIES) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=ja&gl=JP&ceid=JP:ja`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) {
      console.error(`news: ${q} がエラー: ${res.status}`)
      continue
    }
    const found = parseNewsRss(await res.text())
    console.log(`news: ${q} → ${found.length} 件`)
    items.push(...found)
  } catch (e) {
    console.error(`news: ${q} が失敗: ${e.message}`)
  }
}

const section = renderNewsHints(items, { days, limit: LIMIT })
mkdirSync('collector/out', { recursive: true })
writeFileSync(outFile, section)
console.log(section ? `news: ${outFile} に見出しを書き出した` : 'news: 見出しなし')
