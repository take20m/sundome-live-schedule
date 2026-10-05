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
    // ベルは開いて少ししたら赤い点を出し、3 秒ごとに揺れる(登録済みと /subscribe を開いた後はやめる)
    const top0 = await (await SELF.fetch('https://example.com/')).text()
    expect(top0).toContain('<span class="sub-dot" hidden></span>')
    expect(top0).toContain("bell.classList.add('ringing');")
    expect(top0).toContain('.sub-ic.ringing .ic { transform-origin: 50% 12%; animation: bell-ring 3s ease-in-out infinite; }')
    expect(top0).toContain('@keyframes dot-ripple')
    // 本文のフォントは端末のものを使い、Google Fonts は読まない(読み込み待ちで描画が止まるため)
    expect(top0).not.toContain('fonts.googleapis.com')
    expect(top0).toContain('<link rel="preload" as="image" href="/img/sundome-fukui-21x9.webp" media="(min-width: 481px)" fetchpriority="high">')
    // ページ間のアニメーション(View Transition)と、PC のホイールの慣性(どのページにも入る共通ヘッダーのスクリプト)
    expect(top0).toContain('@view-transition { navigation: auto; }')
    expect(top0).toContain('.appbar { view-transition-name: appbar; }')
    expect(top0).toContain("window.addEventListener('pagereveal'")
    expect(top0).toContain("matchMedia('(hover: hover) and (pointer: fine)')")
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
    // ファーストビューに中身を出すため、見出しは読み上げ用だけにし、リード文は置かない
    expect(html).toContain('<h1 class="title visually-hidden">新着情報を受け取る</h1>')
    expect(html).not.toContain('受け取る方法です')
    expect(html).not.toContain('feedly.com')
    expect(html).not.toContain('/feed subscribe')
    // iPhone / Android / PC の手順を用意し、スクリプトが端末に合うものだけを残す
    // PC とホーム画面から開いているときは欄ごと出さない(スクリプトが判定)。手順は iPhone と Android だけ
    for (const os of ['ios', 'android']) expect(html).toContain(`<div class="os-guide" data-os="${os}">`)
    expect(html).not.toContain('data-os="desktop"')
    expect(html).toContain("if (standalone || os === 'desktop') root.hidden = true;")
    expect(html).toContain('<div class="demo" data-demo="ios">')
    expect(html).toContain('<div class="demo" data-demo="android">')
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
