import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema, seedSample } from './helpers'

beforeAll(async () => {
  await applySchema(env.DB)
})

describe('routing skeleton', () => {
  it('GET / はデータが空でも200を返す', async () => {
    const res = await SELF.fetch('https://example.com/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('今後の公演情報はまだありません')
  })

  it('POST /api/ingest は認証必須', async () => {
    const res = await SELF.fetch('https://example.com/api/ingest', { method: 'POST' })
    expect(res.status).toBe(401)
  })
})

describe('detail page', () => {
  // D1 はファイル内で共有されるため seed は1回だけ
  const now = new Date()
  beforeAll(async () => {
    await seedSample(env.DB, now)
  })

  it('「← 公演一覧」は一覧のその公演カードの位置(/#ev-...)に戻る', async () => {
    const eventDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const res = await SELF.fetch(`https://example.com/e/ev-${eventDate}`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toMatch(new RegExp(`<a class="btn-text" href="/#ev-${eventDate}">.*公演一覧</a>`))
  })

  it('「コンサート情報」は tour_url へ。無ければ source_url(会場ページ)で代用', async () => {
    const day = 24 * 60 * 60 * 1000
    const withTour = new Date(now.getTime() + 30 * day).toISOString().slice(0, 10)
    const html1 = await (await SELF.fetch(`https://example.com/e/ev-${withTour}`)).text()
    expect(html1).toContain('href="https://example.com/artist/live/hello2026" rel="noopener" target="_blank">コンサート情報')

    const noTour = new Date(now.getTime() + 45 * day).toISOString().slice(0, 10)
    await env.DB.prepare(
      `INSERT INTO events (id, title, artist, date, source_url, confidence, updated_at)
       VALUES (?, 'VENUE ONLY', '会場のみ', ?, 'https://sundome.sankan.jp/eventinfo/venue-only/', 'official', ?)`,
    )
      .bind(`ev-${noTour}`, noTour, now.toISOString())
      .run()
    const html2 = await (await SELF.fetch(`https://example.com/e/ev-${noTour}`)).text()
    expect(html2).toContain('href="https://sundome.sankan.jp/eventinfo/venue-only/" rel="noopener" target="_blank">コンサート情報')
  })
})
