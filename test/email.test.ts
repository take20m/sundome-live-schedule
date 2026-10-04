import { createExecutionContext, env, SELF, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { DAILY_SEND_LIMIT, runDigest } from '../src/lib/digest'
import { outbound } from '../src/lib/outbound'
import { applySchema } from './helpers'

// キーがそろった環境(本物の Resend・Turnstile へは送らず、outbound.fetch を差し替えて記録する)
const ENV = { ...env, RESEND_API_KEY: 're_test', TURNSTILE_SECRET: 'ts_secret', TURNSTILE_SITE_KEY: 'site_key' }
type Sent = { url: string; headers: Headers; body: string }
let sent: Sent[] = []
let turnstileOk = true

beforeAll(async () => {
  await applySchema(env.DB)
})
beforeEach(() => {
  sent = []
  turnstileOk = true
  outbound.fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('turnstile')) return Response.json({ success: turnstileOk })
    sent.push({ url, headers: new Headers(init?.headers), body: String(init?.body) })
    return Response.json({ data: [] })
  }
})

async function call(path: string, init?: RequestInit, e: object = ENV): Promise<Response> {
  const ctx = createExecutionContext()
  const res = await worker.fetch(new Request(`https://example.com${path}`, init), e as never, ctx)
  await waitOnExecutionContext(ctx)
  return res
}
const form = (fields: Record<string, string>) => ({
  method: 'POST',
  body: new URLSearchParams(fields),
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
})
const confirmUrlOf = (s: Sent) => JSON.parse(s.body).text.match(/https:\/\/example\.com\/subscribe\/confirm\?t=[\w-]+/)[0]
const statusOf = (email: string) =>
  env.DB.prepare('SELECT status FROM subscribers WHERE email = ?').bind(email).first<{ status: string }>()

describe('メール購読: キーがないとき', () => {
  it('メールの欄を出さず、登録 API も 404。プライバシーポリシーにメールの節を出さない', async () => {
    const page = await (await SELF.fetch('https://example.com/subscribe')).text()
    expect(page).not.toContain('id="mail"')
    expect(page).not.toContain('turnstile')
    expect((await SELF.fetch('https://example.com/api/subscribe', form({ email: 'a@example.com' }))).status).toBe(404)
    const about = await (await SELF.fetch('https://example.com/about')).text()
    expect(about).not.toContain('メール購読で預かる情報')
  })
})

describe('メール購読: 登録・確認・停止', () => {
  it('キーがあればフォームと同意の一文、プライバシーポリシーにメールの節を出す', async () => {
    const page = await (await call('/subscribe')).text()
    expect(page).toContain('<form class="sub-form" method="post" action="/api/subscribe">')
    expect(page).toContain('data-sitekey="site_key"')
    // ボット確認の枠は、確認が必要なときだけ出す
    expect(page).toContain('data-appearance="interaction-only"')
    expect(page).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js')
    expect(page).toContain('プライバシーポリシー</a>(メールアドレスの扱い)に同意したものとします')
    const about = await (await call('/about')).text()
    expect(about).toContain('メール購読で預かる情報')
    expect(about).toContain('Resend, Inc.、米国')
  })

  it('登録すると確認メールが届き、リンクを開くと購読中になる', async () => {
    const res = await call('/api/subscribe', form({ email: ' Fan@Example.com ', 'cf-turnstile-response': 'tok' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/subscribe/sent')
    expect(sent).toHaveLength(1)
    const mail = JSON.parse(sent[0].body)
    expect(sent[0].url).toBe('https://api.resend.com/emails')
    expect(mail.to).toEqual(['fan@example.com'])
    expect(mail.from).toBe('サンドーム福井ライブ情報 <news@sundome.take20m.dev>')
    expect(mail.reply_to).toBe('contact@take20m.dev')
    expect(await statusOf('fan@example.com')).toEqual({ status: 'pending' })
    // トークンそのものは保存しない
    const token = new URL(confirmUrlOf(sent[0])).searchParams.get('t')!
    const raw = await env.DB.prepare('SELECT * FROM subscribers WHERE email = ?').bind('fan@example.com').first<Record<string, string>>()
    expect(Object.values(raw!)).not.toContain(token)
    const ok = await call(new URL(confirmUrlOf(sent[0])).pathname + '?t=' + token)
    expect(ok.status).toBe(200)
    const okHtml = await ok.text()
    expect(okHtml).toContain('登録が完了しました')
    // このブラウザでは以後、新着情報のトーストを出さない
    expect(okHtml).toContain("s.subscribed = true; localStorage.setItem('sundome.promo', JSON.stringify(s));")
    expect(await statusOf('fan@example.com')).toEqual({ status: 'active' })
    // 同じリンクは二度使えない
    expect((await call('/subscribe/confirm?t=' + token)).status).toBe(400)
  })

  it('購読中のアドレスにもう一度登録しても、確認メールは送らず同じ画面になる', async () => {
    const res = await call('/api/subscribe', form({ email: 'fan@example.com', 'cf-turnstile-response': 'tok' }))
    expect(res.headers.get('location')).toBe('/subscribe/sent')
    expect(sent).toHaveLength(0)
  })

  it('確認待ちのまま 10 分以内にもう一度登録しても、確認メールを送り直さない', async () => {
    await call('/api/subscribe', form({ email: 'twice@example.com', 'cf-turnstile-response': 'tok' }))
    await call('/api/subscribe', form({ email: 'twice@example.com', 'cf-turnstile-response': 'tok' }))
    expect(sent).toHaveLength(1)
  })

  it('ボット判定に落ちたら送らない。形式の違うアドレスも受け付けない', async () => {
    turnstileOk = false
    const bot = await call('/api/subscribe', form({ email: 'bot@example.com', 'cf-turnstile-response': 'x' }))
    expect(bot.headers.get('location')).toBe('/subscribe?e=bot#mail')
    turnstileOk = true
    const bad = await call('/api/subscribe', form({ email: 'not-an-email', 'cf-turnstile-response': 'tok' }))
    expect(bad.headers.get('location')).toBe('/subscribe?e=email#mail')
    expect(sent).toHaveLength(0)
    expect(await (await call('/subscribe?e=email')).text()).toContain('メールアドレスの形式を確かめてください')
  })

  it('期限(48時間)を過ぎた確認リンクは使えない', async () => {
    await call('/api/subscribe', form({ email: 'late@example.com', 'cf-turnstile-response': 'tok' }))
    const token = new URL(confirmUrlOf(sent[0])).searchParams.get('t')!
    await env.DB.prepare('UPDATE subscribers SET confirm_expires_at = ? WHERE email = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), 'late@example.com')
      .run()
    expect((await call('/subscribe/confirm?t=' + token)).status).toBe(400)
    expect(await statusOf('late@example.com')).toEqual({ status: 'pending' })
  })

  it('停止リンクを開いただけでは止まらず、ボタン(POST)で止まってアドレスが消える', async () => {
    const { unsubscribe_token: t } = (await env.DB.prepare('SELECT unsubscribe_token FROM subscribers WHERE email = ?')
      .bind('fan@example.com')
      .first<{ unsubscribe_token: string }>())!
    const page = await call(`/subscribe/stop?t=${t}`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain(`<form method="post" action="/subscribe/stop?t=${t}">`)
    expect(await statusOf('fan@example.com')).toEqual({ status: 'active' })
    const done = await call(`/subscribe/stop?t=${t}`, { method: 'POST', body: 'List-Unsubscribe=One-Click' })
    expect(await done.text()).toContain('配信を停止しました')
    expect(await statusOf('fan@example.com')).toBeNull()
    expect((await call(`/subscribe/stop?t=${t}`)).status).toBe(404)
  })
})

describe('新着まとめメール', () => {
  const site = 'https://sundome.take20m.dev/'
  const addChange = (itemId: string, type: 'event' | 'lottery', kind: 'added' | 'updated', summary: string) =>
    env.DB.prepare('INSERT INTO changes (item_id, item_type, change_kind, summary, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(itemId, type, kind, summary, new Date().toISOString())
      .run()
  const addActive = (email: string) =>
    env.DB.prepare(
      "INSERT INTO subscribers (email, status, unsubscribe_token, created_at, confirmed_at) VALUES (?, 'active', ?, ?, ?)",
    )
      .bind(email, `unsub-${email}`, new Date().toISOString(), new Date().toISOString())
      .run()

  it('初回は送らず、今までの変更の後ろから始める', async () => {
    await addChange('ev-2027-01-01', 'event', 'added', '新規公演: 過去の通知「OLD」(2027-01-01)')
    const r = await runDigest(ENV, site, new Date())
    expect(r.status).toBe('initialized')
    expect(sent).toHaveLength(0)
  })

  it('新しい公演と、誰でも申し込める抽選の受付開始だけを 1 通にまとめ、購読者ごとに停止リンクを付けて送る', async () => {
    await addActive('a@example.com')
    await addActive('b@example.com')
    await addChange('ev-2027-03-01', 'event', 'added', '新規公演: Vaundy「TOUR」(2027-03-01)')
    await addChange('lot-ev-2027-03-01-aaaaaaaa', 'lottery', 'added', '抽選情報: Vaundy「プレイガイド先行」受付 10/5 12:00〜10/12 23:59')
    await addChange('lot-ev-2027-03-01-bbbbbbbb', 'lottery', 'added', '抽選情報: Vaundy「FC先行」受付 10/1 12:00〜10/3 23:59')
    await addChange('lot-ev-2027-03-01-cccccccc', 'lottery', 'updated', '抽選更新: Vaundy「一般発売」受付 11/1 10:00〜不明')
    const r = await runDigest(ENV, site, new Date('2026-10-04T03:00:00Z'))
    expect(r).toMatchObject({ status: 'sent', subscribers: 2, items: 2 })
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://api.resend.com/emails/batch')
    expect(sent[0].headers.get('Idempotency-Key')).toMatch(/^digest-2026-10-04-\d+-0$/)
    const mails = JSON.parse(sent[0].body)
    expect(mails.map((m: { to: string[] }) => m.to[0])).toEqual(['a@example.com', 'b@example.com'])
    const m = mails[0]
    expect(m.subject).toBe('新着: Vaundy の公演が決まりました ほか1件')
    expect(m.text).toContain('Vaundy「TOUR」2027/3/1')
    expect(m.text).toContain('Vaundy「プレイガイド先行」受付 10/5 12:00〜10/12 23:59')
    expect(m.text).not.toContain('FC先行') // 会員限定は送らない
    expect(m.text).not.toContain('一般発売') // 更新は送らない
    expect(m.text).toContain('https://sundome.take20m.dev/e/ev-2027-03-01')
    expect(m.headers['List-Unsubscribe']).toBe('<https://sundome.take20m.dev/subscribe/stop?t=unsub-a@example.com>')
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(mails[1].headers['List-Unsubscribe']).toContain('unsub-b@example.com')
  })

  it('次の日に新着がなければ送らない', async () => {
    const r = await runDigest(ENV, site, new Date())
    expect(r.status).toBe('no-news')
    expect(sent).toHaveLength(0)
  })

  it(`購読者が ${DAILY_SEND_LIMIT} 人を超えたら送らず、次回また同じ新着から送れるよう位置を進めない`, async () => {
    for (let i = 0; i < DAILY_SEND_LIMIT; i++) await addActive(`many${i}@example.com`)
    await addChange('ev-2027-04-01', 'event', 'added', '新規公演: 誰か「TOUR」(2027-04-01)')
    const r = await runDigest(ENV, site, new Date())
    expect(r.status).toBe('over-limit')
    expect(sent).toHaveLength(0)
    const again = await runDigest(ENV, site, new Date())
    expect(again.status).toBe('over-limit')
  })

  it('運用用の /api/digest はトークンが要る', async () => {
    expect((await call('/api/digest', { method: 'POST' })).status).toBe(401)
    const ok = await call('/api/digest', { method: 'POST', headers: { Authorization: 'Bearer test-token' } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toHaveProperty('status')
  })

  it('Resend のキーがなければ何もしない', async () => {
    expect((await runDigest({ DB: env.DB }, site, new Date())).status).toBe('disabled')
  })
})

describe('新着情報への案内(トーストと詳細のカード)', () => {
  const addEvent = (date: string) =>
    env.DB.prepare(
      "INSERT INTO events (id, title, artist, date, confidence, updated_at) VALUES (?, 'PROMO TOUR', 'プロモ', ?, 'official', ?)",
    )
      .bind(`ev-${date}`, date, new Date().toISOString())
      .run()
  const day = 24 * 60 * 60 * 1000
  const future = new Date(Date.now() + 20 * day).toISOString().slice(0, 10)
  const past = new Date(Date.now() - 20 * day).toISOString().slice(0, 10)
  beforeAll(async () => {
    await addEvent(future)
    await addEvent(past)
  })

  it('メール購読が動いているときだけ、トップと開催前の公演詳細にトーストを出す(5 秒後・7 日は出し直さない)', async () => {
    const top = await (await call('/')).text()
    expect(top).toContain('<aside class="sub-toast" id="sub-toast" aria-label="新着情報のお知らせ" hidden>')
    expect(top).toContain('HIDE = 7 * 864e5')
    expect(top).toContain('}, 5000);')
    expect(await (await call(`/e/ev-${future}`)).text()).toContain('id="sub-toast"')
    expect(await (await call(`/e/ev-${past}`)).text()).not.toContain('id="sub-toast"')
    expect(await (await call('/subscribe')).text()).not.toContain('id="sub-toast"')
    // キーがない環境では出さない
    expect(await (await SELF.fetch('https://example.com/')).text()).not.toContain('id="sub-toast"')
  })

  it('出ていないトーストは隠れていて、下のリンクの当たり判定を奪わない', async () => {
    const top = await (await call('/')).text()
    expect(top).toContain('[hidden] { display: none !important; }')
    expect(top).toContain('.sub-toast:not(.is-shown) { pointer-events: none; }')
  })

  it('開催前の公演詳細には、受付の下に案内カードを置く(開催済みには置かない)', async () => {
    expect(await (await call(`/e/ev-${future}`)).text()).toContain('<a class="sub-card" href="/subscribe">')
    expect(await (await call(`/e/ev-${past}`)).text()).not.toContain('<a class="sub-card"')
    expect(await (await SELF.fetch(`https://example.com/e/ev-${future}`)).text()).not.toContain('<a class="sub-card"')
  })

  it('プライバシーポリシーに localStorage の記録を書く', async () => {
    expect(await (await call('/about')).text()).toContain('ブラウザの中(localStorage)に記録します')
  })
})
