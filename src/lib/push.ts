import webpush from 'web-push'
import { outbound } from './outbound'

/**
 * プッシュ通知(docs/web-push.md)。暗号化と VAPID の署名は web-push の generateRequestDetails に任せ、
 * 送信は Worker の fetch で行う(Node の https は使わない。テストでは outbound.fetch を差し替える)
 */

export const PUSH_SUBJECT = 'mailto:contact@take20m.dev'
/** Workers 無料プランは 1 回の処理で外への通信が 50 件まで。メールの送信と合わせて収まるよう通知は 40 件まで */
export const PUSH_DAILY_LIMIT = 40
/** 404/410 以外の失敗がこの回数続いた宛先は消す */
const MAX_FAILS = 5

export type PushKeys = { endpoint: string; keys: { p256dh: string; auth: string } }
export type PushPayload = { title: string; body: string; url: string }

export const pushEnabled = (env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }) =>
  Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)

/** 各社のプッシュサービスの宛先だけを受け付ける(いたずらで任意の URL を溜め込まれないように) */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^web\.push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/]
const B64U = /^[A-Za-z0-9_-]+$/

export function parseSubscription(raw: unknown): PushKeys | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof r.endpoint !== 'string' || r.endpoint.length > 1000) return null
  let url: URL
  try {
    url = new URL(r.endpoint)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((h) => h.test(url.hostname))) return null
  const p256dh = r.keys?.p256dh, auth = r.keys?.auth
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null
  if (!B64U.test(p256dh) || !B64U.test(auth) || p256dh.length > 200 || auth.length > 50) return null
  return { endpoint: r.endpoint, keys: { p256dh, auth } }
}

export async function savePushSubscription(db: D1Database, s: PushKeys, now: Date): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, fail_count = 0`,
    )
    .bind(s.endpoint, s.keys.p256dh, s.keys.auth, now.toISOString())
    .run()
}

export async function deletePushSubscription(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run()
}

export async function countPushSubscriptions(db: D1Database): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first<{ n: number }>()
  return r?.n ?? 0
}

export type PushResult = { sent: number; removed: number; failed: number; skipped: number }

/** 登録されている全端末に同じ通知を送る(上限を超えた分はその日は送らない) */
export async function sendPushToAll(
  env: { DB: D1Database; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string },
  payload: PushPayload,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0, skipped: 0 }
  if (!pushEnabled(env)) return result
  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions ORDER BY id').all<{
    id: number
    endpoint: string
    p256dh: string
    auth: string
  }>()
  const targets = results.slice(0, PUSH_DAILY_LIMIT)
  result.skipped = results.length - targets.length
  if (result.skipped > 0) console.error(`push: ${results.length} subscriptions exceed the limit ${PUSH_DAILY_LIMIT}; ${result.skipped} skipped`)
  const body = JSON.stringify(payload)
  for (const s of targets) {
    const d = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
      vapidDetails: { subject: PUSH_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! },
      TTL: 12 * 60 * 60,
    })
    let status = 0
    try {
      const res = await outbound.fetch(d.endpoint, {
        method: d.method,
        headers: d.headers as Record<string, string>,
        body: d.body as unknown as BodyInit,
      })
      status = res.status
    } catch (err) {
      console.error('push: send failed', err)
    }
    if (status >= 200 && status < 300) {
      result.sent++
      await env.DB.prepare('UPDATE push_subscriptions SET fail_count = 0 WHERE id = ?').bind(s.id).run()
    } else if (status === 404 || status === 410) {
      // 端末側で通知を止めた・アプリを消したなど。もう届かないので消す
      result.removed++
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run()
    } else {
      result.failed++
      await env.DB.prepare(
        'UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = ?',
      ).bind(s.id).run()
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ? AND fail_count >= ?').bind(s.id, MAX_FAILS).run()
    }
  }
  return result
}
