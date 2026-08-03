import type { EventRow, LotteryRow } from '../types'

export type EventWithLotteries = EventRow & { lotteries: LotteryRow[] }

export type ChangeRow = {
  id: number
  item_id: string
  item_type: 'event' | 'lottery'
  change_kind: 'added' | 'updated'
  summary: string
  created_at: string
}

/** fromDate (YYYY-MM-DD) 以降の公演を、紐づく抽選と合わせて開催日順に返す */
export async function listEvents(db: D1Database, fromDate: string): Promise<EventWithLotteries[]> {
  const { results: events } = await db
    .prepare('SELECT * FROM events WHERE date >= ? ORDER BY date ASC')
    .bind(fromDate)
    .all<EventRow>()
  if (events.length === 0) return []

  const { results: lotteries } = await db
    .prepare(
      `SELECT l.* FROM lotteries l
       JOIN events e ON e.id = l.event_id
       WHERE e.date >= ?
       ORDER BY l.starts_at ASC`,
    )
    .bind(fromDate)
    .all<LotteryRow>()

  const byEvent = new Map<string, LotteryRow[]>()
  for (const l of lotteries) {
    const list = byEvent.get(l.event_id) ?? []
    list.push(l)
    byEvent.set(l.event_id, list)
  }
  return events.map((e) => ({ ...e, lotteries: byEvent.get(e.id) ?? [] }))
}

/** 公演詳細ページ用: 過去公演もIDで引ける */
export async function getEventWithLotteries(
  db: D1Database,
  id: string,
): Promise<EventWithLotteries | null> {
  const event = await db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first<EventRow>()
  if (!event) return null
  const { results: lotteries } = await db
    .prepare('SELECT * FROM lotteries WHERE event_id = ? ORDER BY starts_at ASC')
    .bind(id)
    .all<LotteryRow>()
  return { ...event, lotteries }
}

export async function listAllEventIds(db: D1Database): Promise<{ id: string; date: string }[]> {
  const { results } = await db
    .prepare('SELECT id, date FROM events ORDER BY date ASC')
    .all<{ id: string; date: string }>()
  return results
}

export async function listRecentChanges(db: D1Database, limit = 50): Promise<ChangeRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM changes ORDER BY created_at DESC, id DESC LIMIT ?')
    .bind(limit)
    .all<ChangeRow>()
  return results
}

/** JSTでの今日の日付 (YYYY-MM-DD) */
export function todayInJst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
