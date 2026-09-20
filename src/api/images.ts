import type { Context } from 'hono'
import { todayInJst } from '../lib/db'
import { isDeniedHost } from '../lib/ticket-url'
import type { Bindings } from '../types'

/**
 * ツアービジュアル(og:image)の取得ジョブ用 API。
 *   GET  /api/images/pending  tour_url があり画像未取得の今後の公演(?all=1 で過去・既取得も含む全件)
 *   POST /api/images          { images: [{ event_id, image_url }] } で image_url だけを更新
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
  // all=1: 取り直し用。過去公演と既取得分も含めて tour_url のある全公演
  const all = c.req.query('all') === '1'
  const stmt = all
    ? c.env.DB.prepare(
        `SELECT id AS event_id, artist, title, tour_url FROM events WHERE tour_url IS NOT NULL ORDER BY date ASC`,
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
    const res = await c.env.DB.prepare('UPDATE events SET image_url = ?, updated_at = ? WHERE id = ?')
      .bind(item.image_url, nowIso, item.event_id)
      .run()
    if (res.meta.changes === 0) {
      skipped.push(`images[${i}] (${item.event_id}): 公演が存在しない`)
      continue
    }
    updated++
  }
  return c.json({ updated, skipped })
}
