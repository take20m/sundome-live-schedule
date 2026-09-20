import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { findArtistDoc, findGuideDoc, parseDoc, renderDoc, renderMarkdown } from '../src/lib/content'
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
    expect(html).toContain('<h2 id="見出し">見出し</h2>')
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
    expect(html).toContain('福井で観るときのポイント') // content/artists/あいみょん.md の見出し
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
    expect(html).toMatch(/<h1>サンドーム福井 アクセス・会場ガイド[^<]*<\/h1>/)
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

describe('ガイドの独自記法', () => {
  it('囲み・ルートカード・地図・見出し id・表の包みが描画される', () => {
    const md = '## 行き方\n\n> [!NOTE] 注意の見出し\n> 本文です\n\n```routes\n鯖江駅|徒歩|約20分|1.7km|定番\n```\n\n```map\n35.93,136.18|サンドーム福井|venue\n35.94,136.19|鯖江駅|station\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n'
    const { html, toc, hasMap } = renderDoc(md)
    expect(html).toContain('<h2 id="行き方">行き方</h2>')
    expect(html).toContain('<aside class="callout callout-note"><p class="callout-title">注意の見出し</p>')
    expect(html).toContain('<p>本文です</p>')
    expect(html).toContain('<div class="route-name">鯖江駅</div>')
    expect(html).toContain('<span class="route-time">約20分</span>')
    expect(html).toContain('class="map" data-points=')
    expect(html).toContain('Google マップで開く')
    expect(html).toContain('<div class="table-wrap"><table>')
    expect(toc).toEqual([{ depth: 2, text: '行き方', id: '行き方' }])
    expect(hasMap).toBe(true)
    // 通常の引用と、囲みなしの本文には Leaflet を読まない
    expect(renderDoc('> ふつうの引用').html).toContain('<blockquote>')
    expect(renderDoc('本文').hasMap).toBe(false)
  })

  it('アクセスガイドの本番ページに地図・ルートカード・目次・会場写真が出る', async () => {
    const html = await (await SELF.fetch('https://example.com/guide/access')).text()
    expect(html).toContain('leaflet.min.js')
    expect(html).toContain('class="map" data-points=')
    expect(html).toContain('class="routes"')
    expect(html).toContain('<nav class="toc"')
    expect(html).toContain('<picture class="hero">')
    // 地図のないページには Leaflet を読み込まない
    const tickets = await (await SELF.fetch('https://example.com/guide/tickets')).text()
    expect(tickets).not.toContain('leaflet.min.js')
  })
})
