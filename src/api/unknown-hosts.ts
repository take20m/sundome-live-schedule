import type { Context } from 'hono'
import { todayInJst } from '../lib/db'
import { lotteryStatus } from '../lib/status'
import { hostOf, isPurchasePage } from '../lib/ticket-url'
import type { Bindings, LotteryRow } from '../types'

export type UnknownHost = {
  host: string
  count: number
  samples: string[]
  lotteries: string[] // 「アーティスト / 受付名」
}

const MAX_SAMPLES = 3

/**
 * 購入ページと判定できなかった URL のホストを出現回数つきで返す(運用レポート)。
 * 新しいチケット販売サイトに人間が気づくための導線で、
 * collect ワークフローが毎日ジョブサマリに出す。ホワイトリストの自動更新はしない。
 *
 * 対象は今後の公演の、まだ終了していない抽選のみ。
 * 終了済みまで含めると過去のノイズで埋まって新顔が埋没する。
 */
export async function handleUnknownHosts(c: Context<{ Bindings: Bindings }>): Promise<Response> {
  const token = c.env.INGEST_TOKEN
  if (!token) return c.json({ error: 'INGEST_TOKEN is not configured' }, 500)
  if (c.req.header('authorization') !== `Bearer ${token}`) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const { results } = await c.env.DB.prepare(
    `SELECT l.*, e.artist FROM lotteries l
     JOIN events e ON e.id = l.event_id
     WHERE e.date >= ? AND l.url IS NOT NULL
     ORDER BY e.date ASC`,
  )
    .bind(todayInJst())
    .all<LotteryRow & { artist: string }>()

  const now = new Date()
  const byHost = new Map<string, UnknownHost>()
  for (const l of results) {
    const status = lotteryStatus(l, now)
    if (status === 'closed' || status === 'soldout') continue
    if (isPurchasePage(l.url)) continue
    const host = hostOf(l.url)
    if (!host || !l.url) continue

    const entry = byHost.get(host) ?? { host, count: 0, samples: [], lotteries: [] }
    entry.count++
    if (entry.samples.length < MAX_SAMPLES && !entry.samples.includes(l.url)) {
      entry.samples.push(l.url)
    }
    const label = `${l.artist} / ${l.name}`
    if (!entry.lotteries.includes(label)) entry.lotteries.push(label)
    byHost.set(host, entry)
  }

  const hosts = [...byHost.values()].sort(
    (a, b) => b.count - a.count || a.host.localeCompare(b.host),
  )
  return c.json({ hosts })
}
