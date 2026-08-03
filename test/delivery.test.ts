import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema, seedSample } from './helpers'

beforeAll(async () => {
  await applySchema(env.DB)
  await seedSample(env.DB)
})

describe('一覧ページ', () => {
  it('公演タイトルと受付中バッジが表示される', async () => {
    const res = await SELF.fetch('https://example.com/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('SAMPLE ARTIST LIVE TOUR 2026 &quot;HELLO&quot;')
    expect(html).toContain('受付中')
    expect(html).toContain('FC先行(抽選)')
  })
})

describe('締切セクションとカウントダウン', () => {
  it('受付中の抽選が締切セクションにカウントダウン付きで出る', async () => {
    const res = await SELF.fetch('https://example.com/')
    const html = await res.text()
    expect(html).toContain('締切が近い受付')
    expect(html).toMatch(/data-ends="[^"]+"/)
    expect(html).toMatch(/あと\d+日|あと\d+時間/)
  })

  it('同一ツアーの複数公演日に紐づく同じ受付は1回だけ表示される', async () => {
    // seedSample と同じアーティスト・受付名・期間の「翌日公演」を追加
    const day = 24 * 60 * 60 * 1000
    const now = new Date()
    const date2 = new Date(now.getTime() + 31 * day).toISOString().slice(0, 10)
    const nowIso = now.toISOString()
    await env.DB.prepare(
      `INSERT INTO events (id, title, artist, date, confidence, updated_at) VALUES (?, ?, ?, ?, 'official', ?)`,
    )
      .bind(`ev-${date2}`, 'SAMPLE ARTIST LIVE TOUR 2026 "HELLO"', 'SAMPLE ARTIST', date2, nowIso)
      .run()
    // 実運用同様「同一の申込」を再現するため、seed済み抽選と同じ期間文字列を使う
    const seeded = await env.DB.prepare(
      "SELECT starts_at, ends_at FROM lotteries WHERE name = 'FC先行(抽選)' LIMIT 1",
    ).first<{ starts_at: string; ends_at: string }>()
    await env.DB.prepare(
      `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, confidence, updated_at)
       VALUES (?, ?, 'FC先行(抽選)', ?, ?, 'inferred', ?)`,
    )
      .bind(`lot-ev-${date2}-deadbeef`, `ev-${date2}`, seeded!.starts_at, seeded!.ends_at, nowIso)
      .run()

    const html = await (await SELF.fetch('https://example.com/')).text()
    // 締切セクション内の受付中カウントダウンは1件だけ(公演カード側は2枚ある)
    expect(html.match(/data-ends=/g)?.length).toBe(1)
  })
})

describe('SEO', () => {
  it('JSON-LD・OGP・canonical が入っている', async () => {
    const res = await SELF.fetch('https://example.com/')
    const html = await res.text()
    expect(html).toContain('application/ld+json')
    expect(html).toContain('"@type":"MusicEvent"')
    expect(html).toContain('property="og:title"')
    expect(html).toContain('rel="canonical"')
  })

  it('sitemap.xml と robots.txt が配信される(詳細ページ含む)', async () => {
    const sitemap = await SELF.fetch('https://example.com/sitemap.xml')
    expect(sitemap.status).toBe(200)
    const xml = await sitemap.text()
    expect(xml).toContain('<urlset')
    expect(xml).toContain('/about</loc>')
    expect(xml).toMatch(/\/e\/ev-\d{4}-\d{2}-\d{2}<\/loc>/)
    const robots = await SELF.fetch('https://example.com/robots.txt')
    expect(robots.status).toBe(200)
    expect(await robots.text()).toContain('Sitemap: https://example.com/sitemap.xml')
  })
})

describe('公演詳細ページ', () => {
  it('公演情報と抽選が表示され、JSON-LDを含む', async () => {
    const { results } = await env.DB.prepare('SELECT id FROM events LIMIT 1').all<{ id: string }>()
    const res = await SELF.fetch(`https://example.com/e/${results[0].id}`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('SAMPLE ARTIST LIVE TOUR 2026')
    expect(html).toContain('FC先行(抽選)')
    expect(html).toContain('"@type":"MusicEvent"')
  })

  it('存在しないIDと不正なIDは404', async () => {
    expect((await SELF.fetch('https://example.com/e/ev-1999-01-01')).status).toBe(404)
    expect((await SELF.fetch('https://example.com/e/xxx')).status).toBe(404)
  })
})

describe('aboutページ', () => {
  it('プライバシーポリシーが表示され、一覧からリンクされている', async () => {
    const res = await SELF.fetch('https://example.com/about')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('プライバシーポリシー')
    const top = await (await SELF.fetch('https://example.com/')).text()
    expect(top).toContain('href="/about"')
  })
})

describe('RSSフィード', () => {
  it('更新項目を配信する', async () => {
    const res = await SELF.fetch('https://example.com/feed.xml')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/rss+xml')
    const xml = await res.text()
    expect(xml).toContain('<rss version="2.0">')
    expect(xml).toContain('新規公演: SAMPLE ARTIST LIVE TOUR 2026')
    // 通知リンクは該当公演の詳細ページ・item ごとに一意
    expect(xml).toMatch(/<link>https:\/\/example\.com\/e\/ev-\d{4}-\d{2}-\d{2}\?c=\d+<\/link>/)
  })
})
