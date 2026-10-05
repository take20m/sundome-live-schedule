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

  it('一覧は画像を左の正方形サムネにして日付を文字で出し、詳細は上に 16:9。JSON-LD にも image が載る', async () => {
    const html = await (await SELF.fetch('https://example.com/')).text()
    const cardOf = (id: string) => html.slice(html.indexOf(`id="${id}"`), html.indexOf('</article>', html.indexOf(`id="${id}"`)))
    const withImage = cardOf(`ev-${withTour}`)
    // 一覧: サムネ + 日付の文字。日付タイルは画像が読めなかったときの控えとして隠して置く
    expect(withImage).toContain('<div class="thumb"><img src="https://cdn.example.com/kv.jpg"')
    expect(withImage).toContain('loading="lazy"')
    expect(withImage).toContain('<p class="card-date">')
    expect(withImage).toContain('<div class="tile-wrap" hidden>')
    expect(withImage).not.toContain('card-media')
    // 画像の無い公演は日付タイルのまま
    const noImage = cardOf(`ev-${noTour}`)
    expect(noImage).not.toContain('class="thumb"')
    expect(noImage).toContain('<div class="tile">')
    expect(noImage).not.toContain('card-date')
    expect(html).toContain('"image":["https://cdn.example.com/kv.jpg"]')

    // 詳細の画像は出典(ツアーページ)へのリンクで、上に 16:9。サムネは出さない
    const detail = await (await SELF.fetch(`https://example.com/e/ev-${withTour}`)).text()
    expect(detail).toContain('<a class="card-media" href="https://example.com/live/" rel="noopener" target="_blank"><img src="https://cdn.example.com/kv.jpg"')
    expect(detail).not.toContain('<div class="thumb">')
    // 共有カード(OG)にもツアー画像。画像の無い公演は会場写真
    expect(detail).toContain('<meta property="og:image" content="https://cdn.example.com/kv.jpg">')
    const noImg = await (await SELF.fetch(`https://example.com/e/ev-${noTour}`)).text()
    expect(noImg).toContain('<meta property="og:image" content="https://example.com/img/og-default.jpg">')
  })

  it('切り出し位置: 未設定の画像を返し、入れた位置がサムネに効く。不正な値は捨て、画像が変わると位置は消える', async () => {
    const pending = (await (await SELF.fetch('https://example.com/api/images/focus-pending', { headers })).json()) as {
      images: { image_url: string }[]
    }
    expect(pending.images.map((i) => i.image_url)).toContain('https://cdn.example.com/kv.jpg')
    const res = await SELF.fetch('https://example.com/api/images/focus', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        focus: [
          { image_url: 'https://cdn.example.com/kv.jpg', focus: '30% 20%' },
          { image_url: 'https://cdn.example.com/kv.jpg', focus: 'center; background:url(x)' },
          { image_url: 'https://cdn.example.com/none.jpg', focus: '50% 50%' },
        ],
      }),
    })
    const body = (await res.json()) as { updated: number; skipped: string[] }
    expect(body.updated).toBe(1)
    expect(body.skipped.length).toBe(2)
    const html = await (await SELF.fetch('https://example.com/')).text()
    expect(html).toContain('<img src="https://cdn.example.com/kv.jpg" alt="IMAGE TOUR" loading="lazy" fetchpriority="low" decoding="async" style="object-position: 30% 20%"')
    // 位置が入った画像は未設定一覧から消える(人が決めた位置を夜間処理が上書きしない)
    const after = (await (await SELF.fetch('https://example.com/api/images/focus-pending', { headers })).json()) as {
      images: { image_url: string }[]
    }
    expect(after.images.map((i) => i.image_url)).not.toContain('https://cdn.example.com/kv.jpg')
    // 認証なしは 401
    expect((await SELF.fetch('https://example.com/api/images/focus-pending')).status).toBe(401)
  })

  it('見せ方: contain は余白の色つきで全体を収め、zoom は中心を軸に拡大する。不正な値は未設定扱い', async () => {
    const post = (focus: unknown[]) =>
      SELF.fetch('https://example.com/api/images/focus', { method: 'POST', headers, body: JSON.stringify({ focus }) })
    const card = async () => {
      const html = await (await SELF.fetch('https://example.com/')).text()
      return html.slice(html.indexOf(`id="ev-${withTour}"`), html.indexOf('</article>', html.indexOf(`id="ev-${withTour}"`)))
    }
    await post([{ image_url: 'https://cdn.example.com/kv.jpg', focus: '50% 40%', fit: 'contain', bg: '#FFFFFF', zoom: 1.2 }])
    let c = await card()
    expect(c).toContain('<div class="thumb" style="background: #FFFFFF">')
    expect(c).toContain('style="object-fit: contain; object-position: 50% 40%; transform: scale(1.2); transform-origin: 50% 40%"')
    // 不正な fit / bg / zoom は捨てる(cover・余白なし・等倍)
    await post([{ image_url: 'https://cdn.example.com/kv.jpg', focus: '50% 50%', fit: 'fill', bg: 'red;x', zoom: 9 }])
    c = await card()
    expect(c).toContain('<div class="thumb"><img src="https://cdn.example.com/kv.jpg"')
    expect(c).not.toContain('object-fit: contain')
    expect(c).not.toContain('transform')
    // 後のテストで「画像が変わると見せ方が消える」を確かめるため、有効な値を入れて終える
    await post([{ image_url: 'https://cdn.example.com/kv.jpg', focus: '50% 40%', fit: 'contain', bg: '#000000', zoom: 1.5 }])
    const set = await env.DB.prepare('SELECT image_fit, image_bg, image_zoom FROM events WHERE id = ?').bind(`ev-${withTour}`).first()
    expect(set).toEqual({ image_fit: 'contain', image_bg: '#000000', image_zoom: 1.5 })
  })

  it('manual: true は人が選んだ画像とツアーページを記録し、取り直し(all=1)の対象から外れる', async () => {
    const res = await SELF.fetch('https://example.com/api/images', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        images: [
          {
            event_id: `ev-${past}`,
            image_url: 'https://cdn.example.com/poster.jpg',
            tour_url: 'https://example.com/live/hand-picked',
            manual: true,
          },
        ],
      }),
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { updated: number }).updated).toBe(1)
    const row = await env.DB.prepare(
      'SELECT image_url, image_manual, tour_url, tour_manual FROM events WHERE id = ?',
    )
      .bind(`ev-${past}`)
      .first<{ image_url: string; image_manual: number; tour_url: string; tour_manual: number }>()
    expect(row).toMatchObject({
      image_url: 'https://cdn.example.com/poster.jpg',
      image_manual: 1,
      tour_url: 'https://example.com/live/hand-picked',
      tour_manual: 1,
    })
    // 取り直しても人の選んだ画像は候補に出てこない(自動取得分の ev-withTour だけが残る)
    const all = (await (await SELF.fetch('https://example.com/api/images/pending?all=1', { headers })).json()) as {
      events: { event_id: string }[]
    }
    expect(all.events.map((e) => e.event_id)).toEqual([`ev-${withTour}`])
  })

  it('manual を付けない自動ジョブの更新は tour_url を書き換えない', async () => {
    await SELF.fetch('https://example.com/api/images', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        images: [{ event_id: `ev-${withTour}`, image_url: 'https://cdn.example.com/kv2.jpg', tour_url: 'https://evil.example.com/' }],
      }),
    })
    const row = await env.DB.prepare('SELECT image_url, image_manual, tour_url, image_focus FROM events WHERE id = ?')
      .bind(`ev-${withTour}`)
      .first<{ image_url: string; image_manual: number; tour_url: string; image_focus: string | null }>()
    // 画像が差し替わったので、前の画像に合わせた見せ方は全部消える
    expect(row?.image_focus).toBeNull()
    const framing = await env.DB.prepare('SELECT image_fit, image_bg, image_zoom FROM events WHERE id = ?')
      .bind(`ev-${withTour}`)
      .first<{ image_fit: string | null; image_bg: string | null; image_zoom: number | null }>()
    expect(framing).toEqual({ image_fit: null, image_bg: null, image_zoom: null })
    expect(row).toMatchObject({
      image_url: 'https://cdn.example.com/kv2.jpg',
      image_manual: 0,
      tour_url: 'https://example.com/live/',
    })
  })
})
