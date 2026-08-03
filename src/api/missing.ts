import type { Context } from 'hono'
import { todayInJst } from '../lib/db'
import type { Bindings } from '../types'

export type MissingEvent = {
  event_id: string
  artist: string
  title: string
  date: string
  missing_lotteries: string[] // 期間未確認の抽選名(空配列=抽選自体が未収集)
}

/**
 * 期間情報が欠けている今後の公演を返す(狙い撃ち補強ジョブが使う)。
 * 対象: 抽選が1件もない公演、または期間なしの抽選を持つ公演。
 */
export async function handleMissing(c: Context<{ Bindings: Bindings }>): Promise<Response> {
  const token = c.env.INGEST_TOKEN
  if (!token) return c.json({ error: 'INGEST_TOKEN is not configured' }, 500)
  if (c.req.header('authorization') !== `Bearer ${token}`) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const { results } = await c.env.DB.prepare(
    `SELECT e.id AS event_id, e.artist, e.title, e.date, l.name AS lottery_name
     FROM events e
     LEFT JOIN lotteries l ON l.event_id = e.id
     WHERE e.date >= ?
     ORDER BY e.date ASC`,
  )
    .bind(todayInJst())
    .all<{ event_id: string; artist: string; title: string; date: string; lottery_name: string | null }>()

  // 期間なし抽選の抽出には別クエリを避け、抽選の有無と期間有無を一括で判定する
  const { results: periodless } = await c.env.DB.prepare(
    `SELECT event_id, name FROM lotteries WHERE starts_at IS NULL AND ends_at IS NULL`,
  ).all<{ event_id: string; name: string }>()
  const periodlessByEvent = new Map<string, string[]>()
  for (const r of periodless) {
    const list = periodlessByEvent.get(r.event_id) ?? []
    list.push(r.name)
    periodlessByEvent.set(r.event_id, list)
  }

  const seen = new Map<string, MissingEvent>()
  for (const r of results) {
    if (seen.has(r.event_id)) continue
    const hasAnyLottery = r.lottery_name !== null
    const missingNames = periodlessByEvent.get(r.event_id) ?? []
    if (!hasAnyLottery || missingNames.length > 0) {
      seen.set(r.event_id, {
        event_id: r.event_id,
        artist: r.artist,
        title: r.title,
        date: r.date,
        missing_lotteries: missingNames,
      })
    }
  }

  return c.json({ events: [...seen.values()] })
}
