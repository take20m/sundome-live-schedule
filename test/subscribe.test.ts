import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema, seedSample } from './helpers'

beforeAll(async () => {
  await applySchema(env.DB)
  await seedSample(env.DB)
})

describe('更新を受け取る', () => {
  it('ヘッダーとフッターの入口は /subscribe。RSS の XML へ直接は飛ばさない(開くとファイルが保存されるため)', async () => {
    for (const path of ['/', '/about', '/guide/access']) {
      const html = await (await SELF.fetch(`https://example.com${path}`)).text()
      const header = html.slice(html.indexOf('<header class="appbar">'), html.indexOf('</header>'))
      expect(header, path).toContain('<a class="follow" href="/subscribe">')
      expect(header, path).not.toContain('feed.xml')
      expect(html, path).toContain('<footer class="site-f">\n<a href="/subscribe">更新を受け取る</a>')
    }
    // RSS リーダー向けの自動検出は残す
    const top = await (await SELF.fetch('https://example.com/')).text()
    expect(top).toContain('<link rel="alternate" type="application/rss+xml" title="更新情報" href="/feed.xml">')
  })

  it('/subscribe は RSS の URL・コピー・Feedly、ホーム画面に追加の案内を出す', async () => {
    const res = await SELF.fetch('https://example.com/subscribe')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<input id="feed-url" type="text" readonly value="https://example.com/feed.xml"')
    expect(html).toContain('id="copy-feed"')
    expect(html).toContain('href="https://feedly.com/i/subscription/feed%2Fhttps%3A%2F%2Fexample.com%2Ffeed.xml"')
    expect(html).toContain('<code>/feed subscribe https://example.com/feed.xml</code>')
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
