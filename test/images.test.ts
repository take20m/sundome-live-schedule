import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { extractOgImage } from '../collector/og-image.mjs'
import { applySchema } from './helpers'

describe('extractOgImage', () => {
  const base = 'https://example.com/live/tour2027/'
  it('og:image を絶対 URL で返す。相対パス・実体参照も解決する', () => {
    expect(extractOgImage('<meta property="og:image" content="https://cdn.example.com/a.jpg">', base)).toBe('https://cdn.example.com/a.jpg')
    expect(extractOgImage("<meta content='/img/kv.png' property='og:image'>", base)).toBe('https://example.com/img/kv.png')
    expect(extractOgImage('<meta property="og:image" content="https://cdn.example.com/a.jpg?w=1200&amp;h=630">', base)).toBe('https://cdn.example.com/a.jpg?w=1200&h=630')
  })
  it('og:image が無ければ twitter:image に落ち、どちらも無ければ null', () => {
    expect(extractOgImage('<meta name="twitter:image" content="https://cdn.example.com/t.jpg">', base)).toBe('https://cdn.example.com/t.jpg')
    expect(extractOgImage('<html><head><title>x</title></head></html>', base)).toBe(null)
    expect(extractOgImage('<meta property="og:image" content="">', base)).toBe(null)
    expect(extractOgImage('<meta property="og:image" content="javascript:alert(1)">', base)).toBe(null)
  })
})

describe('images API と表示', () => {
  const day = 24 * 60 * 60 * 1000
  const now = new Date()
  const future = (n: number) => new Date(now.getTime() + n * day).toISOString().slice(0, 10)
  const withTour = future(30)
  const noTour = future(31) // 別アーティスト
  const past = new Date(now.getTime() - 10 * day).toISOString().slice(0, 10)
  const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' }

  beforeAll(async () => {
    await applySchema(env.DB)
    const ins = env.DB.prepare(
      `INSERT INTO events (id, title, artist, date, tour_url, confidence, updated_at) VALUES (?, ?, ?, ?, ?, 'official', ?)`,
    )
    await ins.bind(`ev-${withTour}`, 'IMAGE TOUR', '画像バンド', withTour, 'https://example.com/live/', now.toISOString()).run()
    await ins.bind(`ev-${noTour}`, 'NO TOUR URL', '未収集バンド', noTour, null, now.toISOString()).run()
    await ins.bind(`ev-${past}`, 'PAST TOUR', '過去バンド', past, 'https://example.com/past/', now.toISOString()).run()
  })

  it('認証なしは 401', async () => {
    expect((await SELF.fetch('https://example.com/api/images/pending')).status).toBe(401)
    expect((await SELF.fetch('https://example.com/api/images', { method: 'POST', body: '{}' })).status).toBe(401)
  })

  it('pending は tour_url あり・画像なし・今後の公演だけ', async () => {
    const res = await SELF.fetch('https://example.com/api/images/pending', { headers })
    const body = (await res.json()) as { events: { event_id: string; tour_url: string }[] }
    expect(body.events.map((e) => e.event_id)).toEqual([`ev-${withTour}`])
  })

  it('POST で image_url が保存され、不正 URL・拒否ホスト・存在しない公演は skipped', async () => {
    const res = await SELF.fetch('https://example.com/api/images', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        images: [
          { event_id: `ev-${withTour}`, image_url: 'https://cdn.example.com/kv.jpg' },
          { event_id: `ev-${noTour}`, image_url: 'javascript:alert(1)' },
          { event_id: `ev-${noTour}`, image_url: 'https://ticketjam.jp/img/x.jpg' },
          { event_id: 'ev-1999-01-01', image_url: 'https://cdn.example.com/none.jpg' },
          { event_id: 'xxx', image_url: 'https://cdn.example.com/none.jpg' },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { updated: number; skipped: string[] }
    expect(body.updated).toBe(1)
    expect(body.skipped.length).toBe(4)
    const row = await env.DB.prepare('SELECT image_url FROM events WHERE id = ?').bind(`ev-${withTour}`).first<{ image_url: string | null }>()
    expect(row?.image_url).toBe('https://cdn.example.com/kv.jpg')
    // 保存済みは pending から消える。all=1 なら過去・既取得も含めて tour_url のある全件
    const pending = (await (await SELF.fetch('https://example.com/api/images/pending', { headers })).json()) as { events: unknown[] }
    expect(pending.events.length).toBe(0)
    const all = (await (await SELF.fetch('https://example.com/api/images/pending?all=1', { headers })).json()) as { events: { event_id: string }[] }
    expect(all.events.map((e) => e.event_id).sort()).toEqual([`ev-${past}`, `ev-${withTour}`].sort())
  })

  it('画像がある公演だけカード上部にメディアが出て、JSON-LD にも image が載る', async () => {
    const html = await (await SELF.fetch('https://example.com/')).text()
    const cardOf = (id: string) => html.slice(html.indexOf(`id="${id}"`), html.indexOf('</article>', html.indexOf(`id="${id}"`)))
    const withImage = cardOf(`ev-${withTour}`)
    // 一覧の画像は詳細へのリンク
    expect(withImage).toContain(`<a class="card-media" href="/e/ev-${withTour}"><img src="https://cdn.example.com/kv.jpg"`)
    expect(withImage).toContain(`onerror="this.closest('.card-media').remove()"`)
    expect(withImage).toContain('loading="lazy"')
    expect(cardOf(`ev-${noTour}`)).not.toContain('card-media')
    expect(html).toContain('"image":["https://cdn.example.com/kv.jpg"]')

    // 詳細の画像は出典(ツアーページ)へのリンク
    const detail = await (await SELF.fetch(`https://example.com/e/ev-${withTour}`)).text()
    expect(detail).toContain('<a class="card-media" href="https://example.com/live/" rel="noopener" target="_blank"><img src="https://cdn.example.com/kv.jpg"')
    // 共有カード(OG)にもツアー画像。画像の無い公演は会場写真
    expect(detail).toContain('<meta property="og:image" content="https://cdn.example.com/kv.jpg">')
    const noImg = await (await SELF.fetch(`https://example.com/e/ev-${noTour}`)).text()
    expect(noImg).toContain('<meta property="og:image" content="https://example.com/img/og-default.jpg">')
  })
})
