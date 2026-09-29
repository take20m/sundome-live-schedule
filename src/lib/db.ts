import { isRestrictedLottery } from './audience'
import type { EventRow, LotteryRow } from '../types'
import type { EventGroup } from './group'
import { groupConsecutive } from './group'

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

/** beforeDate (YYYY-MM-DD) より前の公演を、紐づく抽選と合わせて新しい順に返す(過去の公演ページ用) */
export async function listPastEvents(db: D1Database, beforeDate: string): Promise<EventWithLotteries[]> {
  const { results: events } = await db
    .prepare('SELECT * FROM events WHERE date < ? ORDER BY date DESC')
    .bind(beforeDate)
    .all<EventRow>()
  if (events.length === 0) return []
  const { results: lotteries } = await db
    .prepare(
      `SELECT l.* FROM lotteries l
       JOIN events e ON e.id = l.event_id
       WHERE e.date < ?
       ORDER BY l.starts_at ASC`,
    )
    .bind(beforeDate)
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
/** アーティスト名(表記ゆれ吸収)が一致する公演を全期間・日付昇順で返す(アーティストページ用) */
export async function listEventsByArtist(db: D1Database, artist: string): Promise<EventWithLotteries[]> {
  const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
  const key = norm(artist)
  const { results: all } = await db.prepare('SELECT * FROM events ORDER BY date ASC').all<EventRow>()
  const events = all.filter((e) => norm(e.artist) === key)
  if (events.length === 0) return []
  const ids = events.map((e) => e.id)
  const { results: lotteries } = await db
    .prepare(`SELECT * FROM lotteries WHERE event_id IN (${ids.map(() => '?').join(',')}) ORDER BY starts_at ASC`)
    .bind(...ids)
    .all<LotteryRow>()
  const byEvent = new Map<string, LotteryRow[]>()
  for (const l of lotteries) {
    const list = byEvent.get(l.event_id) ?? []
    list.push(l)
    byEvent.set(l.event_id, list)
  }
  return events.map((e) => ({ ...e, lotteries: byEvent.get(e.id) ?? [] }))
}

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

/** 詳細ページ用: その公演と、同一アーティスト・同一タイトルで日付が連続する公演のまとまり */
export type EventRun = { focus: EventWithLotteries; group: EventGroup }

export async function getEventRun(db: D1Database, id: string): Promise<EventRun | null> {
  const focus = await getEventWithLotteries(db, id)
  if (!focus) return null
  const { results: siblings } = await db
    .prepare('SELECT * FROM events WHERE artist = ? ORDER BY date ASC')
    .bind(focus.artist)
    .all<EventRow>()
  const ids = siblings.map((s) => s.id)
  const { results: lotteries } = await db
    .prepare(
      `SELECT * FROM lotteries WHERE event_id IN (${ids.map(() => '?').join(',')}) ORDER BY starts_at ASC`,
    )
    .bind(...ids)
    .all<LotteryRow>()
  const byEvent = new Map<string, LotteryRow[]>()
  for (const l of lotteries) {
    const list = byEvent.get(l.event_id) ?? []
    list.push(l)
    byEvent.set(l.event_id, list)
  }
  const withLots = siblings.map((e) => ({ ...e, lotteries: byEvent.get(e.id) ?? [] }))
  const group = groupConsecutive(withLots).find((g) => g.events.some((e) => e.id === id))
  return { focus, group: group ?? { events: [focus], first: focus, last: focus } }
}

/** sitemap 用。連日を 1 本に束ねるので artist と title も要る(groupRuns の判定に使う) */
export async function listAllEventIds(
  db: D1Database,
): Promise<{ id: string; date: string; artist: string; title: string }[]> {
  const { results } = await db
    .prepare('SELECT id, date, artist, title FROM events ORDER BY date ASC')
    .all<{ id: string; date: string; artist: string; title: string }>()
  return results
}

/**
 * RSS に流す変更。受付の通知は誰でも申し込めるものだけにする(会員限定・CD 封入などは流さない)。
 * ingest でも記録しないようにしたが、それ以前に記録された分もここで落とす
 */
export async function listRecentChanges(db: D1Database, limit = 50): Promise<ChangeRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.*, l.name AS lottery_name FROM changes c
       LEFT JOIN lotteries l ON c.item_type = 'lottery' AND l.id = c.item_id
       ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
    )
    .bind(limit * 2)
    .all<ChangeRow & { lottery_name: string | null }>()
  // 受付の ID が後から変わって元の行が無い通知もある。そのときはサマリ
  // (「抽選情報: アーティスト「受付名」受付 期間」、ingest の lotterySummary の書式)から受付名を取り出す
  const nameOf = (r: ChangeRow & { lottery_name: string | null }) =>
    r.lottery_name ?? r.summary.match(/^抽選(?:情報|更新): .*?「(.*)」受付 /)?.[1] ?? null
  return results
    .filter((r) => {
      if (r.item_type !== 'lottery') return true
      const name = nameOf(r)
      return name === null || !isRestrictedLottery(name)
    })
    .slice(0, limit)
    .map(({ lottery_name: _, ...r }) => r)
}

/** JSTでの今日の日付 (YYYY-MM-DD) */
export function todayInJst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
