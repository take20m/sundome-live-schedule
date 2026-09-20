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
    expect(findGuideDoc('access')?.meta.short).toContain('アクセス')
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
    expect(html).toContain('<h1 class="title">あいみょん</h1>')
    expect(html).toContain('福井で観るときのポイント') // content/artists/あいみょん.md の見出し
    expect(html).toContain('<body class="article">')
    expect(html).toContain('今後の公演')
    expect(html).toContain('過去の公演')
    expect(html).toContain('AIMYON TOUR 2027')
    expect(html).toContain('AIMYON TOUR 2025')
    expect(html).toContain('<meta property="og:image" content="https://cdn.example.com/aimyon.png">')
    expect(html).toContain(`<link rel="canonical" href="https://example.com/a/${encodeURIComponent('あいみょん')}">`)
  })

  it('解説なしでも公演があればページになるが、検索には載せない(noindex)', async () => {
    const ok = await SELF.fetch(`https://example.com/a/${encodeURIComponent('解説なし')}`)
    expect(ok.status).toBe(200)
    const html = await ok.text()
    expect(html).toContain('NO DOC TOUR')
    expect(html).toContain('<meta name="robots" content="noindex,follow">')
    expect((await SELF.fetch(`https://example.com/a/${encodeURIComponent('誰でもない')}`)).status).toBe(404)
    // 解説のあるページは載せる
    const withDoc = await (await SELF.fetch(`https://example.com/a/${encodeURIComponent('あいみょん')}`)).text()
    expect(withDoc).not.toContain('noindex')
  })

  it('ガイドページが描画され、トップと sitemap からリンクされる', async () => {
    const res = await SELF.fetch('https://example.com/guide/access')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<h1 class="title">サンドーム福井への行き方と、帰りで困らないための準備</h1>')
    expect(html).toContain('更新 <b>2026-09-20</b>')
    expect((await SELF.fetch('https://example.com/guide/nope')).status).toBe(404)
    const top = await (await SELF.fetch('https://example.com/')).text()
    expect(top).toContain('href="/guide/access"')
    expect(top).toContain('href="/guide/tickets"')
    const sitemap = await (await SELF.fetch('https://example.com/sitemap.xml')).text()
    expect(sitemap).toContain('/guide/access</loc>')
    expect(sitemap).toContain(`/a/${encodeURIComponent('あいみょん')}</loc>`)
    // 解説のないアーティストは sitemap に載せない
    expect(sitemap).not.toContain(`/a/${encodeURIComponent('解説なし')}</loc>`)
  })

  it('詳細ページのアーティスト名はアーティストページへリンクする', async () => {
    const html = await (await SELF.fetch(`https://example.com/e/ev-${f}`)).text()
    expect(html).toContain(`<a href="/a/${encodeURIComponent('あいみょん')}">あいみょん</a>`)
  })
})

describe('記事の独自記法', () => {
  it('囲み 3 種・数字・一覧・失敗・判断・出典・表の強調・地図が描画される', () => {
    const md = [
      '## 行き方',
      '',
      '> [!TIP] 便利',
      '> 本文です',
      '',
      '> [!FIELD] 現地',
      '> メモ',
      '',
      '> [!WARN] 重要',
      '> 注意',
      '',
      '```numbers\n約1,400台|無料駐車場\n```',
      '```facts\nロッカー|30箱\n```',
      '```sources\n会場公式|https://sundome.sankan.jp/|出典\n怪しい|javascript:x|捨てる\n```',
      '```map\n35.93,136.18|サンドーム福井|venue\n```',
      '',
      '| 手段 | 向く人 |',
      '| - | - |',
      '| 徒歩 [基本] | 初めて |',
      '| 車 | 家族 |',
      '',
    ].join('\n')
    const { html, hasMap } = renderDoc(md)
    expect(html).toContain('<h2 id="行き方">行き方</h2>')
    expect(html).toContain('<aside class="callout callout-tip"><p class="callout-title">便利</p>')
    expect(html).toContain('<aside class="callout callout-field"><p class="callout-title">現地</p>')
    expect(html).toContain('<aside class="callout callout-warn"><p class="callout-title">重要</p>')
    expect(html).toContain('<span class="n">約1,400台</span><span class="l">無料駐車場</span>')
    expect(html).toContain('<dl class="facts"><dt>ロッカー</dt><dd>30箱</dd></dl>')
    expect(html).toContain('<a href="https://sundome.sankan.jp/" rel="noopener" target="_blank">会場公式</a> — 出典')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<tr class="pick">')
    expect(html).toContain('<span class="pick-tag">基本</span>')
    expect(html).toContain('class="map" data-points=')
    expect(hasMap).toBe(true)
    // 旧記法も壊れない(NOTE→重要、STORY→現地メモ)
    expect(renderDoc('> [!NOTE] x\n> y').html).toContain('callout-warn')
    expect(renderDoc('> [!STORY] x\n> y').html).toContain('callout-field')
    expect(renderDoc('> ふつうの引用').html).toContain('<blockquote>')
  })

  it('アクセスガイドは記事の器で描画される: 結論・確認元・写真・地図・出典', async () => {
    const html = await (await SELF.fetch('https://example.com/guide/access')).text()
    expect(html).toContain('<body class="article">')
    expect(html).toContain('Noto+Serif+JP')
    expect(html).toContain('<span class="kicker">会場ガイド</span>')
    expect(html).toContain('<h1 class="title">サンドーム福井への行き方と、帰りで困らないための準備</h1>')
    expect(html).toContain('<p class="lead">')
    expect(html).toContain('確認元 <b>会場公式サイト・FAQ、ハピラインふくい、編集者の来場(2026年8月)</b>')
    // 実際に行って確かめたことは現地メモ枠で公開情報と区別する
    expect(html).toContain('<aside class="callout callout-field"><p class="callout-title">現地メモ(2026年8月・編集者)</p>')
    expect(html).toContain('<section class="verdict"><h2>まず結論</h2><ol><li><strong>初めてなら鯖江駅から徒歩約20分</strong>')
    expect(html).toContain('<figure class="hero">')
    expect(html).toContain('leaflet.min.js')
    expect(html).toContain('<tr class="pick">')
    expect(html).toContain('<ul class="sources">')
    expect(html).toContain('<p class="foot-check">最終確認 2026-09-20')
    // 地図のないページには Leaflet を読み込まない
    const tickets = await (await SELF.fetch('https://example.com/guide/tickets')).text()
    expect(tickets).not.toContain('leaflet.min.js')
    expect(tickets).toContain('<h2 id="まずは公式サイトから探す">まずは公式サイトから探す</h2>')
    expect(tickets).toContain('<aside class="callout callout-warn">')
  })
})
