import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { findArtistDoc, findGuideDoc, parseDoc, renderMarkdown } from '../src/lib/content'
import { applySchema } from './helpers'

describe('content: Markdown と frontmatter', () => {
  it('frontmatter を key: value で読み、本文を分ける', () => {
    const d = parseDoc('---\ntitle: T\nupdated: 2026-09-20\n---\n\n## 見出し\n\n本文')
    expect(d.meta).toEqual({ title: 'T', updated: '2026-09-20' })
    expect(d.body.trim()).toBe('## 見出し\n\n本文')
    expect(parseDoc('frontmatter なし').meta).toEqual({})
  })
  it('Markdown を HTML にし、生 HTML は無効化する', () => {
    const html = renderMarkdown('## 見出し\n\n本文 **強調** [リンク](/guide/access)\n\n<script>alert(1)</script>')
    expect(html).toContain('<h2>見出し</h2>')
    expect(html).toContain('<strong>強調</strong>')
    expect(html).toContain('<a href="/guide/access">リンク</a>')
    expect(html).not.toContain('<script>')
  })
  it('content/ の文書が読める(表記ゆれ吸収)', () => {
    expect(findArtistDoc('あいみょん')?.meta.artist).toBe('あいみょん')
    expect(findArtistDoc('　あいみょん ')?.meta.artist).toBe('あいみょん')
    expect(findArtistDoc('存在しない')).toBe(null)
    expect(findGuideDoc('access')?.meta.title).toContain('アクセス')
    expect(findGuideDoc('nope')).toBe(null)
  })
})

describe('アーティストページとガイド', () => {
  const day = 24 * 60 * 60 * 1000
  const now = new Date()
  const f = new Date(now.getTime() + 30 * day).toISOString().slice(0, 10)
  const p = new Date(now.getTime() - 200 * day).toISOString().slice(0, 10)
  beforeAll(async () => {
    await applySchema(env.DB)
    const ins = env.DB.prepare(`INSERT INTO events (id, title, artist, date, image_url, confidence, updated_at) VALUES (?, ?, ?, ?, ?, 'official', ?)`)
    await ins.bind(`ev-${f}`, 'AIMYON TOUR 2027', 'あいみょん', f, 'https://cdn.example.com/aimyon.png', now.toISOString()).run()
    await ins.bind(`ev-${p}`, 'AIMYON TOUR 2025', 'あいみょん', p, null, now.toISOString()).run()
    await ins.bind(`ev-${new Date(now.getTime() + 40 * day).toISOString().slice(0, 10)}`, 'NO DOC TOUR', '解説なし', new Date(now.getTime() + 40 * day).toISOString().slice(0, 10), null, now.toISOString()).run()
  })

  it('解説ありのアーティスト: 解説 + 今後 + 過去。OG 画像は公演の画像', async () => {
    const res = await SELF.fetch(`https://example.com/a/${encodeURIComponent('あいみょん')}`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<h1>あいみょん</h1>')
    expect(html).toContain('下書き準備中')
    expect(html).toContain('今後の公演')
    expect(html).toContain('過去の公演')
    expect(html).toContain('AIMYON TOUR 2027')
    expect(html).toContain('AIMYON TOUR 2025')
    expect(html).toContain('<meta property="og:image" content="https://cdn.example.com/aimyon.png">')
    expect(html).toContain(`<link rel="canonical" href="https://example.com/a/${encodeURIComponent('あいみょん')}">`)
  })

  it('解説なしでも公演があればページになる。公演も解説も無ければ 404', async () => {
    const ok = await SELF.fetch(`https://example.com/a/${encodeURIComponent('解説なし')}`)
    expect(ok.status).toBe(200)
    expect(await ok.text()).toContain('NO DOC TOUR')
    expect((await SELF.fetch(`https://example.com/a/${encodeURIComponent('誰でもない')}`)).status).toBe(404)
  })

  it('ガイドページが描画され、トップと sitemap からリンクされる', async () => {
    const res = await SELF.fetch('https://example.com/guide/access')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<h1>サンドーム福井 アクセス・会場ガイド</h1>')
    expect(html).toContain('最終更新 2026-09-20')
    expect((await SELF.fetch('https://example.com/guide/nope')).status).toBe(404)
    const top = await (await SELF.fetch('https://example.com/')).text()
    expect(top).toContain('href="/guide/access"')
    expect(top).toContain('href="/guide/tickets"')
    const sitemap = await (await SELF.fetch('https://example.com/sitemap.xml')).text()
    expect(sitemap).toContain('/guide/access</loc>')
    expect(sitemap).toContain(`/a/${encodeURIComponent('あいみょん')}</loc>`)
  })

  it('詳細ページのアーティスト名はアーティストページへリンクする', async () => {
    const html = await (await SELF.fetch(`https://example.com/e/ev-${f}`)).text()
    expect(html).toContain(`<a href="/a/${encodeURIComponent('あいみょん')}">あいみょん</a>`)
  })
})
