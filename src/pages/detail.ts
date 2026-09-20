import type { EventRun, EventWithLotteries } from '../lib/db'
import { escapeHtml } from '../lib/html'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta, buildJsonLd } from '../lib/seo'
import { COUNTDOWN_SCRIPT, formatDateJa, renderEventCard } from './list'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

function metaDescription(e: EventWithLotteries): string {
  const names = e.lotteries.map((l) => l.name).slice(0, 3)
  const lotPart = names.length > 0 ? `${names.join('、')}などの受付期間・申込先` : 'チケット受付情報'
  return `${e.artist}のサンドーム福井公演「${e.title}」(${formatDateJa(e.date)})の${lotPart}を自動収集して掲載。締切カウントダウン付き。`
}

export function renderDetailPage(run: EventRun, now: Date, canonical: string): string {
  const e = run.focus
  const head = buildHeadMeta({
    title: `${e.artist}「${e.title}」チケット・抽選情報(${formatDateJa(e.date)} サンドーム福井)`,
    description: metaDescription(e),
    canonical,
  })
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<link rel="alternate" type="application/rss+xml" title="更新情報" href="/feed.xml">
<style>${SITE_CSS}</style>
<script type="application/ld+json">${buildJsonLd([e], canonical)}</script>
</head>
<body>
${SITE_HEADER}
<main>
<div class="back"><a class="btn-text" href="/#${escapeHtml(e.id)}">${iconSvg('arrow_back')}公演一覧</a></div>
<div class="cards">
${renderEventCard(run.group, now, { focusDate: e.date })}
</div>
</main>
${SITE_FOOTER}
${COUNTDOWN_SCRIPT}
</body>
</html>`
}
