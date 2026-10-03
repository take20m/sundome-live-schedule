import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema, onSaleLotteryNames, seedSample } from './helpers'

beforeAll(async () => {
  await applySchema(env.DB)
  await seedSample(env.DB)
})

describe('一覧ページ', () => {
  it('アーティスト名と受付中バッジが表示され、ツアー名は一覧に出さず詳細に出す', async () => {
    const res = await SELF.fetch('https://example.com/')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('SAMPLE ARTIST')
    expect(html).not.toContain('<p class="card-sub">')
    const id = html.match(/id="(ev-\d{4}-\d{2}-\d{2})"/)![1]
    const detail = await (await SELF.fetch(`https://example.com/e/${id}`)).text()
    expect(detail).toContain('<p class="card-sub">SAMPLE ARTIST LIVE TOUR 2026 &quot;HELLO&quot;</p>')
    expect(html).toContain('受付中')
    expect(html).toContain('オフィシャル先行(抽選)')
  })
})

describe('サイト名の構造化データ', () => {
  it('どのページでも WebSite の url はトップ。公演ページや アーティストページの URL にしない', async () => {
    const top = await (await SELF.fetch('https://example.com/')).text()
    const id = top.match(/id="(ev-\d{4}-\d{2}-\d{2})"/)![1]
    for (const path of ['/', `/e/${id}`, `/a/${encodeURIComponent('SAMPLE ARTIST')}`]) {
      const html = await (await SELF.fetch(`https://example.com${path}`)).text()
      const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]
      const site = JSON.parse(json)['@graph'].find((n: { '@type': string }) => n['@type'] === 'WebSite')
      expect(site, path).toMatchObject({
        '@id': 'https://example.com/#website',
        name: 'サンドーム福井ライブ情報',
        url: 'https://example.com/',
      })
    }
  })
})

describe('締切セクションとカウントダウン', () => {
  it('受付中の抽選が販売中セクションにカウントダウン付きで出る', async () => {
    const res = await SELF.fetch('https://example.com/')
    const html = await res.text()
    expect(html).toContain('販売中のチケット')
    expect(html).toMatch(/data-ends="[^"]+"/)
    expect(html).toMatch(/あと\d+日|あと\d+時間/)
  })

  it('終了未定の販売中(先着)もセクションに載る。売り切れは載らない', async () => {
    const day = 24 * 60 * 60 * 1000
    const now = new Date()
    const date = new Date(now.getTime() + 40 * day).toISOString().slice(0, 10)
    await env.DB.prepare(
      `INSERT INTO events (id, title, artist, date, confidence, updated_at) VALUES (?, 'ENDLESS TOUR', 'エンドレス', ?, 'official', ?)`,
    )
      .bind(`ev-${date}`, date, now.toISOString())
      .run()
    await env.DB.prepare(
      `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, confidence, sold_out, updated_at)
       VALUES (?, ?, '一般発売(先着)', ?, NULL, 'official', 0, ?),
              (?, ?, '売切済の販売', ?, NULL, 'official', 1, ?)`,
    )
      .bind(
        `lot-ev-${date}-00000001`, `ev-${date}`, new Date(now.getTime() - 5 * day).toISOString(), now.toISOString(),
        `lot-ev-${date}-00000002`, `ev-${date}`, new Date(now.getTime() - 5 * day).toISOString(), now.toISOString(),
      )
      .run()
    const html = await (await SELF.fetch('https://example.com/')).text()
    const section = html.split('販売中のチケット')[1].split('今後の公演')[0]
    const onSale = await onSaleLotteryNames(SELF, html)
    expect(onSale).toContain('一般発売(先着)')
    expect(onSale).not.toContain('売切済の販売')
    // 行はアーティスト名と公演日だけ。締切の日時・受付名は出さない(右端の残り日数と詳細ページにある)
    expect(section).toContain('エンドレス')
    expect(section).toContain('締切未定')
    expect(section).not.toContain('〆')
    expect(section).not.toContain('一般発売(先着)')
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
      "SELECT starts_at, ends_at FROM lotteries WHERE name = 'オフィシャル先行(抽選)' LIMIT 1",
    ).first<{ starts_at: string; ends_at: string }>()
    await env.DB.prepare(
      `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, confidence, updated_at)
       VALUES (?, ?, 'オフィシャル先行(抽選)', ?, ?, 'inferred', ?)`,
    )
      .bind(`lot-ev-${date2}-deadbeef`, `ev-${date2}`, seeded!.starts_at, seeded!.ends_at, nowIso)
      .run()

    const html = await (await SELF.fetch('https://example.com/')).text()
    // 締切セクション内の受付中カウントダウンは1件だけ(公演カード側は2枚ある)
    expect(html.match(/data-ends=/g)?.length).toBe(1)
    // カードに公演日が曜日付きで出る(2公演日がまとまる)
    const section = html.split('販売中のチケット')[1].split('今後の公演')[0]
    expect(section).toMatch(/<span class="sale-s">\d{4}\/\d+\/\d+\([日月火水木金土]\)・\d+\/\d+\([日月火水木金土]\)<\/span>/)
    // 画像の無い公演は、画像の位置に公演日を大きく出す
    expect(section).toMatch(/<span class="sale-date">\d+\/\d+・\d+\/\d+<\/span>/)
  })

  it('同一アーティスト・同一締切の複数受付は1行にまとまる', async () => {
    const seeded = await env.DB.prepare(
      "SELECT event_id, starts_at, ends_at FROM lotteries WHERE name = 'オフィシャル先行(抽選)' LIMIT 1",
    ).first<{ event_id: string; starts_at: string; ends_at: string }>()
    await env.DB.prepare(
      `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, confidence, updated_at)
       VALUES (?, ?, 'オフィシャル先行(ステージサイド席)', ?, ?, 'inferred', ?)`,
    )
      .bind(`lot-${seeded!.event_id}-cafebabe`, seeded!.event_id, seeded!.starts_at, seeded!.ends_at, new Date().toISOString())
      .run()
    const html = await (await SELF.fetch('https://example.com/')).text()
    expect(html.match(/data-ends=/g)?.length).toBe(1)
    expect(html).not.toContain('他1件') // 受付名を出さないので件数も出さない
  })

  it('今日開催の公演には「本日」マーカーが付く', async () => {
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await env.DB.prepare(
      `INSERT INTO events (id, title, artist, date, confidence, updated_at) VALUES (?, 'TODAY LIVE', '今日のアーティスト', ?, 'official', ?)`,
    )
      .bind(`ev-${today}`, today, new Date().toISOString())
      .run()
    const html = await (await SELF.fetch('https://example.com/')).text()
    expect(html).toMatch(/class="(?:tile-soon today|soon today)">本日</)
    expect(html).toContain('is-today')
  })
})

describe('RSS', () => {
  it('受付の通知は誰でも申し込めるものだけ。会員限定の受付の通知は、記録済みでもフィードに出さない', async () => {
    const now = new Date().toISOString()
    const ev = await env.DB.prepare('SELECT id FROM events ORDER BY date LIMIT 1').first<{ id: string }>()
    const lotIns = env.DB.prepare(
      `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, confidence, updated_at) VALUES (?, ?, ?, ?, ?, 'official', ?)`,
    )
    await lotIns.bind('lot-rss-fc', ev!.id, 'FCプレミアム会員先行', now, now, now).run()
    await lotIns.bind('lot-rss-open', ev!.id, 'プレイガイド一般先行', now, now, now).run()
    const chIns = env.DB.prepare(
      `INSERT INTO changes (item_id, item_type, change_kind, summary, created_at) VALUES (?, 'lottery', 'added', ?, ?)`,
    )
    await chIns.bind('lot-rss-fc', '受付開始: RSSテスト FCプレミアム会員先行', now).run()
    await chIns.bind('lot-rss-open', '受付開始: RSSテスト プレイガイド一般先行', now).run()
    // 受付の行が残っていない通知(ID が後から変わった)は、サマリの受付名で判定する
    await chIns.bind('lot-rss-gone', '抽選情報: RSSテスト「OFFICIAL FAN CLUB「会報」全会員先行」受付 9/24 12:00〜9/30 05:00', now).run()
    await chIns.bind('lot-rss-gone2', '抽選情報: RSSテスト「一般発売(先着)」受付 10/1 10:00〜不明', now).run()
    const xml = await (await SELF.fetch('https://example.com/feed.xml')).text()
    expect(xml).toContain('プレイガイド一般先行')
    expect(xml).not.toContain('FCプレミアム会員先行')
    expect(xml).not.toContain('全会員先行')
    expect(xml).toContain('一般発売(先着)')
  })
})

describe('RSS のまとめ', () => {
  it('同じ夜・同じアーティスト・同じ受付期間の受付は 1 件にまとめ、guid は最初の通知のもの', async () => {
    const at = '2026-10-02T15:00:00.000Z'
    const ins = env.DB.prepare(
      `INSERT INTO changes (item_id, item_type, change_kind, summary, created_at) VALUES (?, 'lottery', 'added', ?, ?)`,
    )
    const p = '10/2 18:00〜10/12 23:59'
    const first = await ins.bind('lot-ev-2027-04-24-aaaaaaa1', `抽選情報: まとめバンド「最終プレオーダー」受付 ${p}`, at).run()
    await ins.bind('lot-ev-2027-04-24-aaaaaaa2', `抽選情報: まとめバンド「親子最終プレオーダー」受付 ${p}`, at).run()
    await ins.bind('lot-ev-2027-04-24-aaaaaaa3', `抽選情報: まとめバンド「車椅子最終プレオーダー」受付 ${p}`, at).run()
    // 期間が違う受付は別の通知のまま
    await ins.bind('lot-ev-2027-04-24-aaaaaaa4', '抽選情報: まとめバンド「一般発売」受付 11/1 10:00〜不明', at).run()
    const xml = await (await SELF.fetch('https://example.com/feed.xml')).text()
    expect(xml).toContain(`<title>抽選情報: まとめバンド「最終プレオーダー」ほか2件 受付 ${p}</title>`)
    expect(xml).not.toContain('親子最終プレオーダー')
    expect(xml).toContain(`<guid isPermaLink="false">change-${first.meta.last_row_id}</guid>`)
    expect(xml).toContain('まとめバンド「一般発売」受付 11/1 10:00〜不明')
  })
})

describe('SEO', () => {
  it('JSON-LD・OGP・canonical が入っている', async () => {
    const res = await SELF.fetch('https://example.com/')
    const html = await res.text()
    expect(html).toContain('application/ld+json')
    expect(html).toContain('"@type":"MusicEvent"')
    expect(html).toContain('"organizer":{"@type":"MusicGroup","name":"SAMPLE ARTIST","url":"https://example.com/artist"}')
    expect(html).toContain('property="og:title"')
    expect(html).toContain('<meta property="og:image" content="https://example.com/img/og-default.jpg">')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
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

  it('HTML は Cache-Control: no-cache で、アイコンは従来どおり長めにキャッシュ', async () => {
    for (const path of ['/', '/past', '/guide/access']) {
      const res = await SELF.fetch(`https://example.com${path}`)
      expect(res.headers.get('cache-control')).toBe('no-cache')
    }
    expect((await SELF.fetch('https://example.com/icon.svg')).headers.get('cache-control')).toBe('public, max-age=86400')
  })

  it('ヘッダーは下へスクロールすると隠れ、上へ戻すと出る(全ページ共通のスクリプト)', async () => {
    for (const path of ['/', '/past', '/guide/access']) {
      const html = await (await SELF.fetch(`https://example.com${path}`)).text()
      expect(html).toContain('<header class="appbar">')
      expect(html).toContain("h.classList.add('is-hidden')")
    }
  })

  it('アイコンは新しい URL(/icon.svg)と PNG を指し、旧 /favicon.svg も同じ画像を返す', async () => {
    const html = await (await SELF.fetch('https://example.com/')).text()
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/icon.svg">')
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">')
    expect(html).not.toContain('href="/favicon.svg"')
    const icon = await SELF.fetch('https://example.com/icon.svg')
    expect(icon.headers.get('content-type')).toBe('image/svg+xml')
    const old = await SELF.fetch('https://example.com/favicon.svg')
    expect(await old.text()).toBe(await icon.text())
  })

  it('開催済みの公演ページは noindex で、sitemap にも載らない', async () => {
    const past = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await env.DB.prepare(
      `INSERT INTO events (id, title, artist, date, confidence, updated_at) VALUES (?, 'PAST TOUR', '過去バンド', ?, 'inferred', ?)`,
    )
      .bind(`ev-${past}`, past, new Date().toISOString())
      .run()
    const html = await (await SELF.fetch(`https://example.com/e/ev-${past}`)).text()
    expect(html).toContain('<meta name="robots" content="noindex,follow">')
    const xml = await (await SELF.fetch('https://example.com/sitemap.xml')).text()
    expect(xml).not.toContain(`/e/ev-${past}</loc>`)
    // 今後の公演はこれまでどおり sitemap に載り、noindex も付かない
    const m = xml.match(/\/e\/(ev-\d{4}-\d{2}-\d{2})<\/loc>/)
    expect(m).not.toBeNull()
    const upcoming = await (await SELF.fetch(`https://example.com/e/${m![1]}`)).text()
    expect(upcoming).not.toContain('noindex')
  })
})

describe('アーティスト公式サイトリンク', () => {
  it('一覧にはリンクを出さず、詳細に公式サイト・コンサート情報を出す', async () => {
    const html = await (await SELF.fetch('https://example.com/')).text()
    // 一覧はスッキリ(外部リンクは出さない)。JSON-LDには載る
    expect(html).not.toContain('公式サイト')
    expect(html).not.toContain('>コンサート情報<')
    expect(html).toContain('"sameAs":"https://example.com/artist"')

    const detail = await (
      await SELF.fetch(
        `https://example.com/e/${(await env.DB.prepare("SELECT id FROM events WHERE artist = 'SAMPLE ARTIST' LIMIT 1").first<{ id: string }>())!.id}`,
      )
    ).text()
    expect(detail).toContain('SAMPLE ARTIST 公式サイト')
    expect(detail).toContain('コンサート情報')
  })
})

describe('公演詳細ページ', () => {
  it('公演情報と抽選が表示され、JSON-LDを含む', async () => {
    const { results } = await env.DB.prepare(
      "SELECT id FROM events WHERE artist = 'SAMPLE ARTIST' LIMIT 1",
    ).all<{ id: string }>()
    const res = await SELF.fetch(`https://example.com/e/${results[0].id}`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('SAMPLE ARTIST LIVE TOUR 2026')
    expect(html).toContain('オフィシャル先行(抽選)')
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

// 「受付中」のリンクを踏んだのに申し込めないページだった、という体験を防ぐ回帰テスト。
// 実データでは会場検索ページ・FCのニュース記事・まとめサイトが申込先として収集されていた
describe('申込リンク', () => {
  const day = 24 * 60 * 60 * 1000
  const eventDate = new Date(Date.now() + 50 * day).toISOString().slice(0, 10)
  const LOTTERIES = [
    { name: '受付中かつ購入ページ', from: -1, to: 3, url: 'https://eplus.jp/linktest/open-ok/' },
    {
      name: '受付中だが会場検索ページ',
      from: -1,
      to: 3,
      url: 'https://t.pia.jp/pia/venue/venue.do?venueCd=SDFK',
    },
    { name: '終了かつ購入ページ', from: -10, to: -5, url: 'https://eplus.jp/linktest/closed-ng/' },
    { name: '受付前かつ購入ページ', from: 5, to: 10, url: 'https://eplus.jp/linktest/upcoming-ng/' },
    { name: 'FC会員先行(受付前)', from: 6, to: 8, url: 'https://eplus.jp/linktest/upcoming-fc/' },
  ]

  beforeAll(async () => {
    const now = new Date()
    const nowIso = now.toISOString()
    await env.DB.prepare(
      `INSERT INTO events (id, title, artist, date, confidence, updated_at)
       VALUES (?, 'LINK TEST TOUR', 'リンク検証', ?, 'official', ?)`,
    )
      .bind(`ev-${eventDate}`, eventDate, nowIso)
      .run()
    for (const [i, l] of LOTTERIES.entries()) {
      await env.DB.prepare(
        `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, url, confidence, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'official', ?)`,
      )
        .bind(
          `lot-ev-${eventDate}-link${i}`,
          `ev-${eventDate}`,
          l.name,
          new Date(now.getTime() + l.from * day).toISOString(),
          new Date(now.getTime() + l.to * day).toISOString(),
          l.url,
          nowIso,
        )
        .run()
    }
  })

  it('受付中かつ購入ページのときだけリンクになる', async () => {
    const html = await (await SELF.fetch(`https://example.com/e/ev-${eventDate}`)).text()
    expect(html).toContain('href="https://eplus.jp/linktest/open-ok/"')
  })

  it('受付中でも購入ページでなければリンクにしない(受付名は表示する)', async () => {
    const html = await (await SELF.fetch(`https://example.com/e/ev-${eventDate}`)).text()
    expect(html).toContain('受付中だが会場検索ページ')
    expect(html).not.toContain('venue.do')
  })

  it('終了・受付前は購入ページでもリンクにしない', async () => {
    const html = await (await SELF.fetch(`https://example.com/e/ev-${eventDate}`)).text()
    expect(html).toContain('終了かつ購入ページ')
    expect(html).toContain('受付前かつ購入ページ')
    expect(html).not.toContain('linktest/closed-ng')
    expect(html).not.toContain('linktest/upcoming-ng')
  })

  it('一覧ページでも同じ判定が効く', async () => {
    const html = await (await SELF.fetch('https://example.com/')).text()
    expect(html).toContain('href="https://eplus.jp/linktest/open-ok/"')
    expect(html).not.toContain('venue.do')
    expect(html).not.toContain('linktest/closed-ng')
    expect(html).not.toContain('linktest/upcoming-ng')
  })

  it('販売中欄の行は詳細ページのその受付(#lot-...)へ飛び、詳細の行には同じ id がある', async () => {
    const top = await (await SELF.fetch('https://example.com/')).text()
    const section = top.split('販売中のチケット')[1].split('今後の公演')[0]
    const m = section.match(new RegExp(`href="/e/ev-${eventDate}#(lot-[a-z0-9]+)"`))
    expect(m).not.toBeNull()
    const detail = await (await SELF.fetch(`https://example.com/e/ev-${eventDate}`)).text()
    expect(detail).toContain(`<li class="lot lot-open" id="${m![1]}">`)
    // 一覧のカードの受付行には id を付けない(同じ受付が複数のカードに出うる)
    const card = top.slice(top.indexOf(`id="ev-${eventDate}"`), top.indexOf('</article>', top.indexOf(`id="ev-${eventDate}"`)))
    expect(card).not.toContain(`id="${m![1]}"`)
    // 一覧のカードの受付には期間を出さず、詳細には出す
    expect(card).not.toContain('class="lot-period"')
    expect(detail).toContain('class="lot-period"')
  })

  it('一覧のカードには今クリックして申し込める受付だけを出し、詳細では全部出す', async () => {
    const card = (html: string) => html.slice(html.indexOf(`id="ev-${eventDate}"`), html.indexOf('</article>', html.indexOf(`id="ev-${eventDate}"`)))
    const list = card(await (await SELF.fetch('https://example.com/')).text())
    expect(list).toContain('受付中かつ購入ページ')
    expect(list).not.toContain('受付中だが会場検索ページ') // 受付中でも申込ページが無い
    expect(list).not.toContain('受付前かつ購入ページ')
    expect(list).not.toContain('終了かつ購入ページ')
    expect(list).not.toContain('受付を終えた') // 終わった受付の件数リンクも出さない
    const detail = await (await SELF.fetch(`https://example.com/e/ev-${eventDate}`)).text()
    for (const name of ['受付中かつ購入ページ', '受付中だが会場検索ページ', '受付前かつ購入ページ', '終了かつ購入ページ']) {
      expect(detail).toContain(name)
    }
  })

  it('受付前は販売中欄に出さず、一覧のカードで「受付前 開始日時〜」だけ予告する(一般申込み可能なものだけ)', async () => {
    const top = await (await SELF.fetch('https://example.com/')).text()
    const onSale = await onSaleLotteryNames(SELF, top)
    expect(onSale).toContain('受付中かつ購入ページ')
    expect(onSale).not.toContain('受付前かつ購入ページ')
    const card = top.slice(top.indexOf(`id="ev-${eventDate}"`), top.indexOf('</article>', top.indexOf(`id="ev-${eventDate}"`)))
    // FC 先行は予告しないので、受付前の行は一般の 1 本だけ。受付名は出さない
    const rows = [...card.matchAll(/<li class="lot lot-upcoming">(.*?)<\/li>/g)].map((m) => m[1])
    expect(rows).toEqual([
      expect.stringMatching(/^<span class="chip chip-upcoming">受付前<\/span><span class="lot-name">\d+\/\d+ \d{2}:\d{2}〜<\/span>$/),
    ])
    expect(card).not.toContain('FC会員先行(受付前)')
  })

  it('販売中欄のカードの画像は 16:10 に切る。切り出し位置と余白色は公演カードと同じ値を使い、正方形用の拡大は使わない', async () => {
    const saleMedia = async () => {
      const top = await (await SELF.fetch('https://example.com/')).text()
      const section = top.split('販売中のチケット')[1].split('今後の公演')[0]
      const i = section.indexOf(`href="/e/ev-${eventDate}#`)
      return section.slice(section.indexOf('<span class="sale-media"', i), section.indexOf('<span class="sale-body">', i))
    }
    const setImage = (fit: string, bg: string | null) =>
      env.DB.prepare(`UPDATE events SET image_url = 'https://example.org/tour.jpg', image_focus = '30% 40%', image_fit = ?, image_bg = ?, image_zoom = 1.8 WHERE id = ?`)
        .bind(fit, bg, `ev-${eventDate}`)
        .run()
    await setImage('cover', null)
    const cover = await saleMedia()
    expect(cover).toContain('<img src="https://example.org/tour.jpg"')
    expect(cover).toContain('style="object-position: 30% 40%; transform-origin: 30% 40%"')
    // 拡大率はそのまま掛けず、画像の縦横比が分かってからスクリプトが 16:10 用に換算する
    expect(cover).toContain('data-zoom="1.8"')
    expect(cover).not.toContain('scale(')
    // 画像が読み込めなかったときに切り替える日付は隠しておく
    expect(cover).toContain('<span class="sale-date" hidden>')
    await setImage('contain', '#191919')
    const contain = await saleMedia()
    expect(contain).toContain('<span class="sale-media" style="background: #191919">')
    expect(contain).toContain('style="object-fit: contain; object-position: 30% 40%"')
    expect(contain).not.toContain('data-zoom') // 縮めて収める画像には拡大を使わない
    await env.DB.prepare('UPDATE events SET image_url = NULL, image_focus = NULL, image_fit = NULL, image_bg = NULL, image_zoom = NULL WHERE id = ?')
      .bind(`ev-${eventDate}`)
      .run()
  })

  // JSON-LD の Offer.url は検索結果のチケット導線に使われるので画面と同じ基準で出す
  it('JSON-LDのOfferにも購入ページのURLだけ載る', async () => {
    const html = await (await SELF.fetch(`https://example.com/e/ev-${eventDate}`)).text()
    expect(html).toContain('"url":"https://eplus.jp/linktest/open-ok/"')
    // 受付名と受付状態は載る(情報としては有用なので消さない)
    expect(html).toContain('"name":"受付中だが会場検索ページ"')
    expect(html).toContain('"availability":"https://schema.org/InStock"')
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
