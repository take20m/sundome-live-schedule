import { createExecutionContext, env, SELF, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import webpush from 'web-push'
import worker from '../src/index'
import { runDigest } from '../src/lib/digest'
import { outbound } from '../src/lib/outbound'
import { PUSH_DAILY_LIMIT } from '../src/lib/push'
import { applySchema } from './helpers'

const vapid = webpush.generateVAPIDKeys()
const ENV = { ...env, VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey }
type Sent = { url: string; headers: Headers; body: Uint8Array }
let sent: Sent[] = []
let reply = (_url: string) => 201

const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** ブラウザが作るのと同じ形の宛先(本物の P-256 公開鍵) */
async function browserSubscription(endpoint: string) {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  return { endpoint, keys: { p256dh: b64u(raw), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } }
}
async function call(path: string, init?: RequestInit, e: object = ENV): Promise<Response> {
  const ctx = createExecutionContext()
  const res = await worker.fetch(new Request(`https://example.com${path}`, init), e as never, ctx)
  await waitOnExecutionContext(ctx)
  return res
}
const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const count = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first<{ n: number }>())!.n

beforeAll(async () => {
  await applySchema(env.DB)
})
beforeEach(() => {
  sent = []
  reply = () => 201
  outbound.fetch = async (input, init) => {
    const url = String(input)
    sent.push({ url, headers: new Headers(init?.headers), body: new Uint8Array(await new Response(init?.body).arrayBuffer()) })
    return new Response(null, { status: reply(url) })
  }
})

describe('プッシュ通知: 鍵がないとき', () => {
  it('欄も API も出さない', async () => {
    expect(await (await SELF.fetch('https://example.com/subscribe')).text()).not.toContain('id="push"')
    expect((await SELF.fetch('https://example.com/api/push/subscribe', json({}))).status).toBe(404)
    expect(await (await SELF.fetch('https://example.com/about')).text()).not.toContain('プッシュ通知で預かる情報')
  })
})

describe('プッシュ通知: 登録と解除', () => {
  it('鍵があれば /subscribe のいちばん上に欄、プライバシーポリシーに追記', async () => {
    const page = await (await call('/subscribe')).text()
    expect(page.indexOf('<section class="sub-block" id="push" hidden>')).toBeLessThan(page.indexOf('id="install"'))
    expect(page).toContain(JSON.stringify(vapid.publicKey))
    expect(page).toContain('window.sundomePush')
    const about = await (await call('/about')).text()
    expect(about).toContain('プッシュ通知で預かる情報')
  })

  it('各社のプッシュサービスの宛先だけを受け付け、同じ宛先は 1 件にまとめ、解除で消す', async () => {
    const sub = await browserSubscription('https://fcm.googleapis.com/fcm/send/device-1')
    expect((await call('/api/push/subscribe', json(sub))).status).toBe(200)
    expect((await call('/api/push/subscribe', json(sub))).status).toBe(200)
    expect(await count()).toBe(1)
    for (const endpoint of ['https://evil.example.com/push', 'http://fcm.googleapis.com/fcm/send/x', 'javascript:alert(1)']) {
      expect((await call('/api/push/subscribe', json({ ...sub, endpoint }))).status, endpoint).toBe(400)
    }
    expect((await call('/api/push/subscribe', json({ endpoint: sub.endpoint, keys: { p256dh: '<script>', auth: 'x' } }))).status).toBe(400)
    expect((await call('/api/push/unsubscribe', json({ endpoint: sub.endpoint }))).status).toBe(200)
    expect(await count()).toBe(0)
  })
})

describe('プッシュ通知: 毎日のまとめ', () => {
  const addChange = (itemId: string, summary: string) =>
    env.DB.prepare("INSERT INTO changes (item_id, item_type, change_kind, summary, created_at) VALUES (?, 'event', 'added', ?, ?)")
      .bind(itemId, summary, new Date().toISOString())
      .run()
  const save = async (endpoint: string) => {
    const s = await browserSubscription(endpoint)
    await env.DB.prepare('INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)')
      .bind(s.endpoint, s.keys.p256dh, s.keys.auth, new Date().toISOString())
      .run()
  }

  it('メールの鍵が無くても、通知だけで新着を送る。中身は暗号化され、VAPID で署名される', async () => {
    await runDigest(ENV, 'https://sundome.take20m.dev/', new Date()) // 初回は位置を決めるだけ
    await save('https://fcm.googleapis.com/fcm/send/a')
    await save('https://web.push.apple.com/b')
    await addChange('ev-2027-03-01', '新規公演: Vaundy「TOUR」(2027-03-01)')
    const r = await runDigest(ENV, 'https://sundome.take20m.dev/', new Date())
    expect(r).toMatchObject({ status: 'sent', subscribers: 0, items: 1, push: { sent: 2, removed: 0, failed: 0, skipped: 0 } })
    expect(sent.map((s) => s.url)).toEqual(['https://fcm.googleapis.com/fcm/send/a', 'https://web.push.apple.com/b'])
    for (const s of sent) {
      expect(s.headers.get('Content-Encoding')).toBe('aes128gcm')
      expect(s.headers.get('TTL')).toBe(String(12 * 60 * 60))
      expect(s.headers.get('Authorization')).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapid.publicKey}$`))
      // 中身は暗号化されていて、平文の公演名は読めない
      expect(new TextDecoder().decode(s.body)).not.toContain('Vaundy')
    }
  })

  it('届かなくなった宛先(410)は消し、ほかの失敗は回数を数えて 5 回続いたら消す', async () => {
    await env.DB.prepare('DELETE FROM push_subscriptions').run()
    await save('https://fcm.googleapis.com/fcm/send/gone')
    await save('https://fcm.googleapis.com/fcm/send/flaky')
    reply = (url) => (url.endsWith('/gone') ? 410 : 500)
    for (let i = 0; i < 5; i++) {
      await addChange(`ev-2027-04-0${i + 1}`, `新規公演: 誰か「T${i}」(2027-04-0${i + 1})`)
      await runDigest(ENV, 'https://sundome.take20m.dev/', new Date())
      if (i === 0) {
        const left = await env.DB.prepare('SELECT endpoint, fail_count FROM push_subscriptions').all()
        expect(left.results).toEqual([{ endpoint: 'https://fcm.googleapis.com/fcm/send/flaky', fail_count: 1 }])
      }
    }
    expect(await count()).toBe(0)
  })

  it(`無料プランの通信の上限に収まるよう、1 日 ${PUSH_DAILY_LIMIT} 件までにする`, async () => {
    for (let i = 0; i <= PUSH_DAILY_LIMIT; i++) await save(`https://fcm.googleapis.com/fcm/send/many-${i}`)
    await addChange('ev-2027-05-01', '新規公演: 多い「T」(2027-05-01)')
    const r = await runDigest(ENV, 'https://sundome.take20m.dev/', new Date())
    expect(r).toMatchObject({ status: 'sent', push: { sent: PUSH_DAILY_LIMIT, skipped: 1 } })
    expect(sent).toHaveLength(PUSH_DAILY_LIMIT)
  })
})

describe('プッシュ通知: 運用用のテスト通知', () => {
  it('トークンが要る', async () => {
    expect((await call('/api/push/test', { method: 'POST' })).status).toBe(401)
    const ok = await call('/api/push/test', { method: 'POST', headers: { Authorization: 'Bearer test-token' } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toHaveProperty('sent')
  })
})

describe('プッシュ通知: ホーム画面から開いたときのトースト', () => {
  it('メール購読と通知の両方が動いているとき、トップに通知の共通処理と切り替えを置く', async () => {
    const both = { ...ENV, RESEND_API_KEY: 're_test', TURNSTILE_SECRET: 'ts', TURNSTILE_SITE_KEY: 'site' }
    const top = await (await call('/', undefined, both)).text()
    expect(top.indexOf('window.sundomePush')).toBeLessThan(top.indexOf('id="sub-toast"'))
    expect(top).toContain('sundomePush.standalone()')
    expect(top).toContain('"通知を受け取る"')
  })
})
