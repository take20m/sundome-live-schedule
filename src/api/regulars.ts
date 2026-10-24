import type { Context } from 'hono'
import { todayInJst } from '../lib/db'
import type { Bindings } from '../types'

export type Regular = {
  artist: string
  last_date: string
  artist_url: string | null
}

/** 表記ゆれ(全角/半角・空白・大文字小文字・「from EXILE TRIBE」の有無)を吸収した比較キー */
function artistKey(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/fromexiletribe$/, '')
}

/** 公式サイトの URL の比較キー(名義の表記が違っても同じ公式サイトなら同じ出演者) */
function siteKey(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

/**
 * 過去にサンドーム福井で公演したが、次の公演をまだ把握していない出演者を返す(見回りジョブが使う)。
 * 会場名で検索しても、多都市の日程表の 1 行にしか会場が出ない発表(ミュージカルの全国公演など)は見つからない。
 * 同じ会場に繰り返し来る出演者は、出演者の公式サイトから日程を当たれば会場の発表より先に分かる。
 * 並びは固定(見回りジョブが日付で順番に当てていくため)
 */
export async function handleRegulars(c: Context<{ Bindings: Bindings }>): Promise<Response> {
  const token = c.env.INGEST_TOKEN
  if (!token) return c.json({ error: 'INGEST_TOKEN is not configured' }, 500)
  if (c.req.header('authorization') !== `Bearer ${token}`) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const { results } = await c.env.DB.prepare('SELECT artist, date, artist_url FROM events ORDER BY date DESC')
    .all<{ artist: string; date: string; artist_url: string | null }>()
  const today = todayInJst()
  // 名義と公式サイトのどちらかが一致すれば同じ出演者として束ねる(「Fujii Kaze」と「藤井 風」など)
  const groupOf = new Map<string, string>()
  const groups = new Map<string, Regular & { upcoming: boolean }>()
  for (const r of results) {
    const nameKey = `name:${artistKey(r.artist)}`
    const urlKey = r.artist_url ? `site:${siteKey(r.artist_url)}` : null
    const id = groupOf.get(nameKey) ?? (urlKey ? groupOf.get(urlKey) : undefined) ?? nameKey
    groupOf.set(nameKey, id)
    if (urlKey) groupOf.set(urlKey, id)
    const g = groups.get(id)
    if (!g) {
      // 日付の新しい順に読むので、最初の行がいちばん最近の公演(名義もその表記を使う)
      groups.set(id, { artist: r.artist, last_date: r.date, artist_url: r.artist_url, upcoming: r.date >= today })
      continue
    }
    if (r.date >= today) g.upcoming = true
    if (!g.artist_url && r.artist_url) g.artist_url = r.artist_url
  }
  const artists = [...groups.entries()]
    .filter(([, g]) => !g.upcoming)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { artist, last_date, artist_url }]) => ({ artist, last_date, artist_url }))
  return c.json({ artists })
}
