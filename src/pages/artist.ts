import type { Doc } from '../lib/content'
import { renderMarkdown } from '../lib/content'
import type { EventWithLotteries } from '../lib/db'
import { todayInJst } from '../lib/db'
import { groupConsecutive } from '../lib/group'
import { escapeHtml } from '../lib/html'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta, buildJsonLd } from '../lib/seo'
import { COUNTDOWN_SCRIPT, renderEventCard } from './list'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

/**
 * アーティストページ: 解説(content/artists/*.md、任意)+ サンドーム福井での公演(今後・過去)。
 * 検索意図「アーティスト名 × サンドーム福井」の着地先で、公演日が過ぎても残る
 */
export function renderArtistPage(
  name: string,
  events: EventWithLotteries[],
  doc: Doc | null,
  now: Date,
  canonical: string,
): string {
  const today = todayInJst(now)
  const upcoming = events.filter((e) => e.date >= today)
  const past = events.filter((e) => e.date < today).reverse()
  const displayName = events[0]?.artist ?? doc?.meta.artist ?? name
  const title = doc?.meta.title ?? `${displayName} サンドーム福井公演のチケット・抽選情報`
  const description =
    doc?.meta.description ??
    `${displayName}のサンドーム福井(福井県越前市)公演の予定と、チケット先行・抽選の受付期間。過去の公演記録も掲載。`
  const image = upcoming.find((e) => e.image_url)?.image_url ?? events.find((e) => e.image_url)?.image_url ?? null
  const head = buildHeadMeta({
    title,
    description,
    canonical,
    image: image ? { url: image, alt: displayName } : null,
  })
  const section = (label: string, list: EventWithLotteries[], compact: boolean) =>
    list.length === 0
      ? ''
      : `<div class="section"><h2>${label}</h2><span class="sup">${list.length} 公演</span></div>
<div class="cards">
${groupConsecutive(list)
  .sort((a, b) => (compact ? b.first.date.localeCompare(a.first.date) : a.first.date.localeCompare(b.first.date)))
  .map((g) => renderEventCard(g, now, compact ? { compact: true } : {}))
  .join('\n')}
</div>`
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<style>${SITE_CSS}</style>
<script type="application/ld+json">${buildJsonLd(upcoming, canonical)}</script>
</head>
<body>
${SITE_HEADER}
<main class="prose">
<div class="back"><a class="btn-text" href="/">${iconSvg('arrow_back')}公演一覧</a></div>
<article class="prose-card">
<h1>${escapeHtml(displayName)}</h1>
${doc?.meta.updated ? `<p class="updated">最終更新 ${escapeHtml(doc.meta.updated)}</p>` : ''}
${doc ? renderMarkdown(doc.body) : `<p>${escapeHtml(displayName)}のサンドーム福井公演の予定とチケット受付情報です。</p>`}
</article>
${section('今後の公演', upcoming, false)}
${section('過去の公演', past, true)}
</main>
${SITE_FOOTER}
${COUNTDOWN_SCRIPT}
</body>
</html>`
}
