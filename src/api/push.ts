import type { Context } from 'hono'
import { deletePushSubscription, parseSubscription, pushEnabled, savePushSubscription } from '../lib/push'
import type { Bindings } from '../types'

/** プッシュ通知の登録・解除(docs/web-push.md)。鍵が無いときは 404 */
type C = Context<{ Bindings: Bindings }>

async function readJson(c: C): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

export async function handlePushSubscribe(c: C): Promise<Response> {
  if (!pushEnabled(c.env)) return c.notFound()
  const sub = parseSubscription(await readJson(c))
  if (!sub) return c.json({ error: 'invalid subscription' }, 400)
  await savePushSubscription(c.env.DB, sub, new Date())
  return c.json({ ok: true })
}

export async function handlePushUnsubscribe(c: C): Promise<Response> {
  if (!pushEnabled(c.env)) return c.notFound()
  const body = (await readJson(c)) as { endpoint?: unknown } | null
  if (typeof body?.endpoint !== 'string') return c.json({ error: 'invalid endpoint' }, 400)
  await deletePushSubscription(c.env.DB, body.endpoint)
  return c.json({ ok: true })
}
