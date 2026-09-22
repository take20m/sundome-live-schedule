/**
 * 連日公演を表示上 1 枚に束ねる。
 *
 * データは 1 日 = 1 行(events.id = ev-<日付>)のまま変えない。同一アーティスト・同一タイトルで
 * 日付が連続している行だけを表示層でグループ化し、日ごとに重複している抽選(両日共通の先行など)
 * を 1 行に統合する。離れた日付の同ツアー公演は束ねない(一覧の日付順を崩さないため)。
 */
import type { LotteryRow } from '../types'
import type { EventWithLotteries } from './db'

export type EventGroup = {
  /** 日付昇順・連続 */
  events: EventWithLotteries[]
  first: EventWithLotteries
  last: EventWithLotteries
}

/** グループ内で統合した抽選。dates はその受付が紐づく公演日(グループの一部だけなら表示で注記する) */
export type MergedLottery = LotteryRow & { dates: string[] }

/** 表記ゆれ(全角/半角・空白・大文字小文字)を吸収した比較キー */
function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

/** YYYY-MM-DD の翌日 */
export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** グループ化に必要な最小の形。sitemap は抽選まで読まないのでこの 3 つだけで束ねられる */
export type Groupable = { date: string; artist: string; title: string }

/**
 * 日付順に並べ、同一アーティスト・同一タイトルで日付が連続する行を 1 本のランにまとめる。
 * canonical(初日) と sitemap が同じ規則で束ねる必要があるので、束ね方はここ 1 か所に置く
 */
export function groupRuns<T extends Groupable>(rows: T[]): T[][] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const runs: T[][] = []
  for (const e of sorted) {
    const run = runs[runs.length - 1]
    const last = run?.[run.length - 1]
    if (last && norm(last.artist) === norm(e.artist) && norm(last.title) === norm(e.title) && nextDay(last.date) === e.date) {
      run.push(e)
    } else {
      runs.push([e])
    }
  }
  return runs
}

/** 日付順に並べ、同一アーティスト・同一タイトルで日付が連続する公演を 1 グループにする */
export function groupConsecutive(events: EventWithLotteries[]): EventGroup[] {
  return groupRuns(events).map((es) => ({ events: es, first: es[0], last: es[es.length - 1] }))
}

/**
 * 名前・期間・売り切れ状態が同じ抽選を 1 行に統合する。
 * 並びは最初に現れた順(初日の抽選順 → 2日目だけの抽選)。URL は最初に見つかった非 null を使う
 */
export function mergeLotteries(group: EventGroup): MergedLottery[] {
  const out: MergedLottery[] = []
  const index = new Map<string, MergedLottery>()
  for (const e of group.events) {
    for (const l of e.lotteries) {
      const key = [norm(l.name), l.starts_at ?? '', l.ends_at ?? '', l.sold_out].join('|')
      const m = index.get(key)
      if (m) {
        if (!m.dates.includes(e.date)) m.dates.push(e.date)
        if (!m.url && l.url) m.url = l.url
      } else {
        const merged: MergedLottery = { ...l, dates: [e.date] }
        index.set(key, merged)
        out.push(merged)
      }
    }
  }
  return out
}
