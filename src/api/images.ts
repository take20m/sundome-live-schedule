import type { Context } from 'hono'
import { todayInJst } from '../lib/db'
import { isDeniedHost } from '../lib/ticket-url'
import type { Bindings } from '../types'

/**
 * ツアービジュアル(og:image)の取得ジョブ用 API。
 *   GET  /api/images/pending  tour_url があり画像未取得の今後の公演(?all=1 で過去・既取得も含む全件)
 *   POST /api/images          { images: [{ event_id, image_url, tour_url?, manual? }] } で画像(と手動時はツアーURL)を更新
 *
 * manual: true は「人が選んだ値」の印。og:image が全ツアー共通のサイト(LDH LIVE SCHEDULE など)では
 * 自動取得がロゴ画像しか拾えないため、人がツアービジュアルを直接入れる。印の付いた行は
 * REFETCH_ALL の取り直し対象から外れ、tour_url は ingest の収集結果でも上書きされない。
 *
 * ingest とは別口にしている理由: ingest は lotteries の欠落を「見落とし」として数えるため、
 * 画像だけを送りたいジョブが ingest を叩くと抽選を消してしまう。
 */
function unauthorized(c: Context<{ Bindings: Bindings }>): Response | null {
  const token = c.env.INGEST_TOKEN
  if (!token) return c.json({ error: 'INGEST_TOKEN is not configured' }, 500)
  if (c.req.header('authorization') !== `Bearer ${token}`) return c.json({ error: 'unauthorized' }, 401)
  return null
}

export type PendingImage = { event_id: string; artist: string; title: string; tour_url: string }

export async function handlePendingImages(c: Context<{ Bindings: Bindings }>): Promise<Response> {
  const denied = unauthorized(c)
  if (denied) return denied
  // all=1: 取り直し用。過去公演と既取得分も含めて tour_url のある全公演(手動で入れた画像は除く)
  const all = c.req.query('all') === '1'
  const stmt = all
    ? c.env.DB.prepare(
        `SELECT id AS event_id, artist, title, tour_url FROM events
           WHERE tour_url IS NOT NULL AND image_manual = 0
           ORDER BY date ASC`,
      )
    : c.env.DB
        .prepare(
          `SELECT id AS event_id, artist, title, tour_url FROM events
           WHERE date >= ? AND tour_url IS NOT NULL AND image_url IS NULL
           ORDER BY date ASC`,
        )
        .bind(todayInJst())
  const { results } = await stmt.all<PendingImage>()
  return c.json({ events: results })
}

const EVENT_ID_RE = /^ev-\d{4}-\d{2}-\d{2}$/
const MAX_URL_LENGTH = 2048

function isAcceptableImageUrl(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > MAX_URL_LENGTH) return false
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  return !isDeniedHost(v)
}

export async function handleSetImages(c: Context<{ Bindings: Bindings }>): Promise<Response> {
  const denied = unauthorized(c)
  if (denied) return denied
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON' }, 400)
  }
  const images = (body as { images?: unknown })?.images
  if (!Array.isArray(images)) return c.json({ error: 'body must be {"images": [...]}' }, 400)

  const skipped: string[] = []
  let updated = 0
  const nowIso = new Date().toISOString()
  for (const [i, raw] of images.entries()) {
    const item = raw as Record<string, unknown>
    if (typeof item.event_id !== 'string' || !EVENT_ID_RE.test(item.event_id)) {
      skipped.push(`images[${i}]: event_id が不正`)
      continue
    }
    if (!isAcceptableImageUrl(item.image_url)) {
      skipped.push(`images[${i}] (${item.event_id}): image_url が不正または拒否ホスト`)
      continue
    }
    const manual = item.manual === true
    // tour_url は手動投入のときだけ受け付ける(自動ジョブは tour_url を持っている側なので送ってこない)
    const tourUrl = manual && isAcceptableImageUrl(item.tour_url) ? item.tour_url : null
    const res = tourUrl
      ? await c.env.DB.prepare(
          'UPDATE events SET image_url = ?, image_manual = 1, tour_url = ?, tour_manual = 1, updated_at = ? WHERE id = ?',
        )
          .bind(item.image_url, tourUrl, nowIso, item.event_id)
          .run()
      : await c.env.DB.prepare('UPDATE events SET image_url = ?, image_manual = ?, updated_at = ? WHERE id = ?')
          .bind(item.image_url, manual ? 1 : 0, nowIso, item.event_id)
          .run()
    if (res.meta.changes === 0) {
      skipped.push(`images[${i}] (${item.event_id}): 公演が存在しない`)
      continue
    }
    updated++
  }
  return c.json({ updated, skipped })
}
