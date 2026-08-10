import { describe, expect, it } from 'vitest'
import { hostOf, isPurchasePage } from '../src/lib/ticket-url'

// テストケースの URL はすべて本番 D1 に実在した値。
// 「受付中なのに申し込めないページに飛ばされる」の回帰テスト
describe('isPurchasePage', () => {
  it('プレイガイドの公演固有ページは購入ページとみなす', () => {
    expect(isPurchasePage('https://eplus.jp/fujiikaze2026/add-fukui/')).toBe(true)
    expect(isPurchasePage('https://e-ticketbook.com/fanta26-sunflower/2512-tb/')).toBe(true)
    expect(isPurchasePage('https://ticket.tickebo.jp/sn/mc2026sp_of')).toBe(true)
    expect(isPurchasePage('https://sp.livepocket.jp/mrchildren_saturdayinthepark2026/')).toBe(true)
  })

  it('ぴあは公演ページを許可し、会場検索ページは弾く', () => {
    expect(isPurchasePage('https://w.pia.jp/t/vaundy-japanarena2728/')).toBe(true)
    expect(isPurchasePage('https://pia.jp/v/treasure26of/')).toBe(true)
    // サンドーム福井の会場一覧。「公式リセール」の申込先として収集されていた
    expect(
      isPurchasePage('https://t.pia.jp/pia/venue/venue.do?prefectureCd=18&cityCd=209&venueCd=SDFK'),
    ).toBe(false)
  })

  it('まとめサイト・転売サイト・個人ブログは弾く', () => {
    expect(isPurchasePage('https://ticketjam.jp/magazine/music/japan-rock/131991')).toBe(false)
    expect(isPurchasePage('https://ticket-festa.com/music/jpop/18901')).toBe(false)
    expect(
      isPurchasePage('https://jayjayblog.com/mr-children-arena-tour2026-ticket-details/'),
    ).toBe(false)
  })

  it('アーティスト公式・FCサイトは弾く(申込ページを特定できない)', () => {
    expect(isPurchasePage('https://sakanaction.jp/feature/tour2027_ticket')).toBe(false)
    expect(isPurchasePage('https://gene.exfamily.jp/s/ldh04/news/detail/250999')).toBe(false)
    expect(isPurchasePage('https://ygex.jp/treasure/news/detail.php?id=1135178')).toBe(false)
    expect(isPurchasePage('https://lignea.co.jp/sakanaction/')).toBe(false)
    expect(isPurchasePage('https://m.ex-m.jp/live_ticket')).toBe(false)
    expect(isPurchasePage('https://www.mrchildren.jp/fam/')).toBe(false)
    expect(isPurchasePage('https://www.exiletribecard.jp/ticket/')).toBe(false)
  })

  it('許可ホストでもトップページは弾く(公演を特定できない)', () => {
    expect(isPurchasePage('https://e-ticketbook.com/')).toBe(false)
    expect(isPurchasePage('https://eplus.jp/')).toBe(false)
    expect(isPurchasePage('https://eplus.jp')).toBe(false)
  })

  it('許可ホストでも記事系パスは弾く', () => {
    expect(isPurchasePage('https://eplus.jp/news/12345')).toBe(false)
    expect(isPurchasePage('https://eplus.jp/blog/hello/')).toBe(false)
    expect(isPurchasePage('https://eplus.jp/articles/hello/')).toBe(false)
  })

  it('ホスト表記のゆらぎを吸収する', () => {
    expect(isPurchasePage('HTTPS://WWW.EPLUS.JP/foo/bar/')).toBe(true)
    expect(isPurchasePage('http://eplus.jp/foo/bar/')).toBe(true)
  })

  it('URLとして不正なもの・http(s)以外は弾く', () => {
    expect(isPurchasePage(null)).toBe(false)
    expect(isPurchasePage(undefined)).toBe(false)
    expect(isPurchasePage('')).toBe(false)
    expect(isPurchasePage('not a url')).toBe(false)
    // 収集データ由来の href に javascript: が入る余地を残さない
    expect(isPurchasePage('javascript:alert(1)')).toBe(false)
    expect(isPurchasePage('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('似ているだけの別ドメインを許可しない', () => {
    expect(isPurchasePage('https://eplus.jp.evil.example/foo/')).toBe(false)
    expect(isPurchasePage('https://noteplus.jp/foo/')).toBe(false)
  })
})

describe('hostOf', () => {
  it('www を除いた小文字のホストを返す', () => {
    expect(hostOf('https://www.aimyong.net/feature/tour2027')).toBe('aimyong.net')
    expect(hostOf('HTTPS://T.PIA.JP/pia/venue/venue.do')).toBe('t.pia.jp')
  })

  it('判定できないものは null', () => {
    expect(hostOf(null)).toBe(null)
    expect(hostOf('javascript:alert(1)')).toBe(null)
    expect(hostOf('not a url')).toBe(null)
  })
})
