import type { EventWithLotteries } from './db'
import { escapeHtml } from './html'
import { BRAND_COLOR } from './icon'
import { lotteryStatus } from './status'
import { isPurchasePage } from './ticket-url'

/** 受付状態を schema.org の availability 語彙へ(売切=SoldOut / 受付前=PreOrder / 受付中=InStock / 終了=Discontinued) */
function offerAvailability(l: { starts_at: string | null; ends_at: string | null; sold_out: number }, now: number): string | null {
  if (l.sold_out === 1) return 'https://schema.org/SoldOut'
  if (l.starts_at && now < Date.parse(l.starts_at)) return 'https://schema.org/PreOrder'
  if (l.ends_at && now > Date.parse(l.ends_at)) return 'https://schema.org/Discontinued'
  if (l.starts_at || l.ends_at) return 'https://schema.org/InStock'
  return null
}

/** schema.org MusicEvent の JSON-LD(Googleイベントリッチリザルト対応) */
export function buildJsonLd(events: EventWithLotteries[], siteUrl: string): string {
  const now = Date.now()
  const nowDate = new Date(now)
  const items = events.map((e) => ({
    '@type': 'MusicEvent',
    name: e.title,
    description: `${e.artist}のサンドーム福井(福井県越前市)公演「${e.title}」。チケット先行・抽選の受付期間を掲載。`,
    startDate: e.start_time ? `${e.date}T${e.start_time}:00+09:00` : e.date,
    endDate: e.date,
    ...(e.open_time ? { doorTime: `${e.date}T${e.open_time}:00+09:00` } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'EventVenue',
      name: 'サンドーム福井',
      address: {
        '@type': 'PostalAddress',
        addressLocality: '越前市',
        addressRegion: '福井県',
        streetAddress: '瓜生町5-1-1',
        addressCountry: 'JP',
      },
    },
    performer: {
      '@type': 'MusicGroup',
      name: e.artist,
      ...(e.artist_url ? { sameAs: e.artist_url } : {}),
    },
    // 主催者(プロモーター)は収集していないため、アーティスト公式を organizer として載せる
    organizer: {
      '@type': 'MusicGroup',
      name: e.artist,
      ...(e.artist_url ? { url: e.artist_url } : {}),
    },
    ...(e.tour_url ?? e.source_url ? { url: e.tour_url ?? e.source_url } : {}),
    ...(e.image_url ? { image: [e.image_url] } : {}),
    offers: e.lotteries
      .filter((l) => l.url || l.starts_at || l.ends_at)
      .map((l) => {
        const availability = offerAvailability(l, now)
        // Offer.url は「そのオファーを購入できるページ」を意味し、検索結果のチケット導線として
        // 使われる。告知ページやまとめ記事を載せると検索経由で同じ空振りが起きるため、
        // 画面のリンクと同じ判定を通したものだけ出す
        const url = l.url
        const purchasable = lotteryStatus(l, nowDate) === 'open' && isPurchasePage(url)
        return {
          '@type': 'Offer',
          name: l.name,
          ...(purchasable ? { url } : {}),
          ...(l.starts_at ? { availabilityStarts: l.starts_at, validFrom: l.starts_at } : {}),
          ...(l.ends_at ? { availabilityEnds: l.ends_at, validThrough: l.ends_at } : {}),
          ...(availability ? { availability } : {}),
        }
      }),
  }))
  // <script> 内に埋め込むため、HTMLとして意味を持つ文字をJSONエスケープに置換する
  // (< 等は有効なJSONのまま。</script> によるタグ脱出を防ぐ)
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'サンドーム福井 コンサート・ライブ情報',
        url: siteUrl,
      },
      ...items,
    ],
  })
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029')
}

export function buildMetaDescription(events: EventWithLotteries[]): string {
  const artists = [...new Set(events.map((e) => e.artist))].slice(0, 5)
  const list = artists.length > 0 ? `${artists.join('、')} などの公演を掲載中。` : ''
  return `サンドーム福井(福井県越前市)で開催されるライブの予定と、チケット先行・抽選の受付期間を毎日更新。${list}締切カウントダウン・RSS対応。`
}

export function buildSitemap(siteUrl: string, lastmod: string, extraPaths: string[] = []): string {
  const url = (path: string) => `  <url><loc>${new URL(path, siteUrl).toString()}</loc><lastmod>${lastmod}</lastmod></url>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/past', '/about', ...extraPaths].map(url).join('\n')}
</urlset>
`
}

export function buildRobots(siteUrl: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${new URL('/sitemap.xml', siteUrl).toString()}\n`
}

/** 既定の OG 画像(会場写真 1200×630)。ページ固有の画像が無いときに使う */
export const DEFAULT_OG_IMAGE = { path: '/img/og-default.jpg', width: 1200, height: 630, alt: 'サンドーム福井の外観' }

/** 共通の <head> メタタグ(title, description, OGP, canonical) */
export function buildHeadMeta(opts: {
  title: string
  description: string
  canonical: string
  /** ページ固有の OG 画像(絶対 URL)。省略時は会場写真 */
  image?: { url: string; alt: string } | null
}): string {
  const t = escapeHtml(opts.title)
  const d = escapeHtml(opts.description)
  const canonical = escapeHtml(opts.canonical)
  const image = opts.image ?? {
    url: new URL(DEFAULT_OG_IMAGE.path, opts.canonical).toString(),
    alt: DEFAULT_OG_IMAGE.alt,
  }
  // 会場写真はサイズが分かる。外部画像(ツアーの og:image)はサイズ不明なので width/height を出さない
  const size =
    opts.image == null
      ? `\n<meta property="og:image:width" content="${DEFAULT_OG_IMAGE.width}">\n<meta property="og:image:height" content="${DEFAULT_OG_IMAGE.height}">`
      : ''
  return `<title>${t}</title>
<meta name="google-site-verification" content="Zqb1r-WsvcKYv5AbyATIlunK_PCtx7NgNemnjRPkXBg">
<meta name="description" content="${d}">
<meta name="theme-color" content="${BRAND_COLOR}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&amp;family=Noto+Sans+JP:wght@400;500;700&amp;display=swap">
<link rel="apple-touch-icon" href="/favicon.svg">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${escapeHtml(image.url)}">${size}
<meta property="og:image:alt" content="${escapeHtml(image.alt)}">
<meta property="og:site_name" content="サンドーム福井 コンサート・ライブ情報">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">`
}
