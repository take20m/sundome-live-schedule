import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema, seedSample } from './helpers'

beforeAll(async () => {
  await applySchema(env.DB)
  await seedSample(env.DB)
})

describe('新着情報を受け取る', () => {
  it('ヘッダーの入口は /subscribe。RSS の XML へ直接は飛ばさない(開くとファイルが保存されるため)', async () => {
    for (const path of ['/', '/about', '/guide/access']) {
      const html = await (await SELF.fetch(`https://example.com${path}`)).text()
      const header = html.slice(html.indexOf('<header class="appbar">'), html.indexOf('</header>'))
      expect(header, path).toContain('<a class="iconbtn sub-ic" href="/subscribe" aria-label="新着情報を受け取る" title="新着情報を受け取る">')
      expect(header, path).not.toContain('feed.xml')
      // フッターには置かない(入口はヘッダーのベルとトースト)
      expect(html, path).toContain('<footer class="site-f">\n<a href="/about">このサイトについて</a>')
    }
    // ベルは開いて少ししたら揺れ、赤い点を出し、20 秒おきに揺れる(登録済みと /subscribe を開いた後はやめる)
    const top0 = await (await SELF.fetch('https://example.com/')).text()
    expect(top0).toContain('<span class="sub-dot" hidden></span>')
    expect(top0).toContain('setInterval(ring, 20000);')
    expect(top0).toContain('@keyframes bell-ring')
    // RSS リーダー向けの自動検出は残す
    const top = await (await SELF.fetch('https://example.com/')).text()
    expect(top).toContain('<link rel="alternate" type="application/rss+xml" title="更新情報" href="/feed.xml">')
  })

  it('/subscribe は RSS の URL とコピー、端末ごとのホーム画面に追加の手順を出す', async () => {
    const res = await SELF.fetch('https://example.com/subscribe')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<input id="feed-url" type="text" readonly value="https://example.com/feed.xml"')
    expect(html).toContain('id="copy-feed"')
    expect(html).not.toContain('feedly.com')
    expect(html).not.toContain('/feed subscribe')
    // iPhone / Android / PC の手順を用意し、スクリプトが端末に合うものだけを残す
    for (const os of ['ios', 'android', 'desktop']) expect(html).toContain(`<div class="os-guide" data-os="${os}">`)
    expect(html).toContain('<div class="demo" data-demo="ios">')
    expect(html).toContain('<div class="demo" data-demo="android">')
    expect(html).toContain('<img src="/img/subscribe-qr.svg"')
    expect(html).toContain('id="install-btn" hidden')
    expect(html).toContain("navigator.serviceWorker.register('/sw.js')")
    // 通知と SNS は仕組みができるまで出さない
    expect(html).not.toContain('通知を受け取る')
  })

  it('どのページもホーム画面に追加するための manifest を指す。sitemap に /subscribe を載せる', async () => {
    const html = await (await SELF.fetch('https://example.com/subscribe')).text()
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">')
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="サンドーム福井">')
    const sitemap = await (await SELF.fetch('https://example.com/sitemap.xml')).text()
    expect(sitemap).toContain('<loc>https://example.com/subscribe</loc>')
  })
})
