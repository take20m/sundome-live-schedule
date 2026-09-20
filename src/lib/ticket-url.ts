/**
 * 抽選・先行の URL が「その公演を実際に申し込める購入ページ」かを判定する。
 *
 * 収集データには公式サイトの告知ページ、FCサイトのトップ、まとめ記事や転売サイトの記事まで
 * 混ざる。「受付中」表示のリンクを踏んだのに申し込めない、という体験を防ぐため、
 * デフォルト拒否(ホワイトリスト方式)で既知プレイガイドの公演固有ページだけを許可する。
 *
 * URLは3段階で扱う:
 *   1. PLAYGUIDE_HOSTS に該当 → 記録し、リンクにする
 *   2. どちらでもない         → 記録するがリンクにしない(公式の告知ページなど)
 *   3. DENIED_HOSTS に該当    → そもそも記録しない(ingest で捨てる)
 *
 * ## 新しいチケット販売サイトを追加する手順
 * 1. `GET /api/unknown-hosts` のレポートを見る(collect ワークフローのジョブサマリに毎日出る)
 * 2. そのホストで本当にチケットを購入・申込できるかを人間が確認する
 * 3. PLAYGUIDE_HOSTS に追加する
 *
 * まとめサイト・転売サイト・ニュースメディアは絶対に追加しない。
 * ドメインに ticket を含むだけの無関係サイトが実際に混入している
 * (ticketjam.jp = 転売サイトのマガジン記事 / ticket-festa.com = まとめ記事)。
 * 自動追加もしない(出現頻度で昇格させると上記が混入する)。
 */

/** 公演固有ページであれば申込先として許可するプレイガイド(サブドメインを含む) */
export const PLAYGUIDE_HOSTS: readonly string[] = [
  'eplus.jp', // イープラス
  'e-ticketbook.com', // チケットボード
  'tickebo.jp', // チケットボ
  'livepocket.jp', // LivePocket
  'l-tike.com', // ローソンチケット
  'tixplus.jp', // チケプラ
  'ticket.rakuten.co.jp', // 楽天チケット
  'zaiko.io', // ZAIKO
  'teket.jp', // teket
  'cnplayguide.com', // CNプレイガイド
]

/**
 * ぴあは同一ドメインに公演ページと会場検索が同居するためパスで絞る。
 * 許可: w.pia.jp/t/<公演> · pia.jp/v/<公演> · t.pia.jp/pia/ticketInformation...
 * 除外: t.pia.jp/pia/venue/venue.do?venueCd=SDFK (サンドーム福井の会場検索ページ)
 */
const PIA_HOST = 'pia.jp'
const PIA_ALLOWED_PATHS: readonly string[] = ['/v/', '/t/', '/pia/ticketInformation']

/** 許可ホストであっても購入ページではないと分かるパス(告知・記事・会場検索) */
const DENY_PATH =
  /(\/news(\/|$)|\/magazine(\/|$)|\/blog(\/|$)|\/feature(\/|$)|\/articles?(\/|$)|\/venue(\/|$)|venue\.do|detail\.php)/

/** http(s) 以外(javascript: 等)を弾いた上で URL を返す */
function parseHttpUrl(rawUrl: string | null | undefined): URL | null {
  if (!rawUrl) return null
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return null
  }
  return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '')
}

function matchesHost(host: string, allowed: string): boolean {
  return host === allowed || host.endsWith(`.${allowed}`)
}

/** URL のホスト(www. を除いた小文字)。判定できなければ null */
export function hostOf(rawUrl: string | null | undefined): string | null {
  const u = parseHttpUrl(rawUrl)
  return u ? normalizeHost(u.hostname) : null
}

/**
 * 申込先として記録する価値がないホスト(転売プラットフォーム・まとめ記事・個人ブログ)。
 *
 * PLAYGUIDE_HOSTS との役割の違い:
 *   ホワイトリスト外 → 記録はするがリンクにしない(公式の告知ページなど情報価値がある)
 *   ここに該当       → そもそも記録しない(踏んでも申し込めず、公式情報でもない)
 *
 * 公式リセール(tixplus.jp の「チケプラTrade」等)は転売ではないのでここには入れない。
 * 追加する前に、そのホストが本当に非公式かを人間が確認すること。
 */
export const DENIED_HOSTS: readonly string[] = [
  'ticketjam.jp', // チケジャム(転売)。実データで申込先として収集されていた
  'ticket-festa.com', // まとめ記事サイト。同上
  'jayjayblog.com', // 個人ブログ。同上
  'ticketstreet.jp', // チケットストリート(転売)
  'ticket-ryutsu.com', // チケット流通センター(転売)
  'livefans.jp', // ライブ情報まとめ
]

/**
 * 会場(サンドーム福井)公式サイト。events.source_url としては正しいが、
 * tour_url(アーティスト側のページ)としては受け付けない。
 * 収集 LLM が source_url をそのままコピーしてくる事故を ingest で止めるために使う
 */
export const VENUE_HOSTS: readonly string[] = ['sundome.jp', 'sundome.sankan.jp']

export function isVenueHost(rawUrl: string | null | undefined): boolean {
  const host = hostOf(rawUrl)
  return host !== null && VENUE_HOSTS.some((h) => matchesHost(host, h))
}

/** サイトのトップページ(パスなし)か。公演を特定できないので tour_url としては無価値 */
export function isTopPage(rawUrl: string | null | undefined): boolean {
  const u = parseHttpUrl(rawUrl)
  return u !== null && u.pathname.replace(/\//g, '') === ''
}

/** 申込先・情報源として記録してはいけないURLか */
export function isDeniedHost(rawUrl: string | null | undefined): boolean {
  const host = hostOf(rawUrl)
  return host !== null && DENIED_HOSTS.some((h) => matchesHost(host, h))
}

/** その公演を実際に申し込める購入ページとみなせるか */
export function isPurchasePage(rawUrl: string | null | undefined): rawUrl is string {
  const u = parseHttpUrl(rawUrl)
  if (!u) return false
  // トップページは公演を特定できず、訪問者が自力で探す羽目になる
  if (u.pathname.replace(/\//g, '') === '') return false
  if (DENY_PATH.test(u.pathname)) return false

  const host = normalizeHost(u.hostname)
  if (matchesHost(host, PIA_HOST)) {
    return PIA_ALLOWED_PATHS.some((p) => u.pathname.startsWith(p))
  }
  return PLAYGUIDE_HOSTS.some((h) => matchesHost(host, h))
}
