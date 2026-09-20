import type { EventWithLotteries } from '../lib/db'
import { escapeHtml } from '../lib/html'
import { buildHeadMeta, buildJsonLd } from '../lib/seo'
import { lotteryStatus } from '../lib/status'
import { COUNTDOWN_SCRIPT, renderLottery, stubDate } from './list'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土']

function formatDateJa(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return `${y}年${m}月${d}日(${WEEKDAYS_JA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`
}

function metaDescription(e: EventWithLotteries): string {
  const names = e.lotteries.map((l) => l.name).slice(0, 3)
  const lotPart = names.length > 0 ? `${names.join('、')}などの受付期間・申込先` : 'チケット受付情報'
  return `${e.artist}のサンドーム福井公演「${e.title}」(${formatDateJa(e.date)})の${lotPart}を自動収集して掲載。締切カウントダウン付き。`
}

export function renderDetailPage(e: EventWithLotteries, now: Date, canonical: string): string {
  const d = stubDate(e.date)
  const hasOpen = e.lotteries.some((l) => lotteryStatus(l, now) === 'open')
  const times = [e.open_time && `開場 ${e.open_time}`, e.start_time && `開演 ${e.start_time}`]
    .filter(Boolean)
    .join(' / ')
  // 「コンサート情報」はアーティスト側のツアーページへ。未収集なら情報源(会場ページ)で代用
  const infoUrl = e.tour_url ?? e.source_url
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
<p class="back"><a href="/#${escapeHtml(e.id)}">← 公演一覧</a></p>
<article class="tix${hasOpen ? ' open' : ''}">
  <div class="stub">
    <div class="y">${escapeHtml(d.y)}</div>
    <div class="md">${escapeHtml(d.md)}</div>
    <div class="dw">${escapeHtml(d.dw)}</div>
  </div>
  <div class="bod">
  <h2 class="event-title">${escapeHtml(e.artist)}</h2>
  <div class="tour-title">${escapeHtml(e.title)}</div>
  <div class="event-meta">
    <span>${escapeHtml(formatDateJa(e.date))}</span>
    ${times ? `<span class="times">${escapeHtml(times)}</span>` : ''}
    <span>サンドーム福井(福井県越前市)</span>
    ${e.artist_url ? `<a href="${escapeHtml(e.artist_url)}" rel="noopener" target="_blank">${escapeHtml(e.artist)} 公式サイト</a>` : ''}
    ${infoUrl ? `<a href="${escapeHtml(infoUrl)}" rel="noopener" target="_blank">コンサート情報</a>` : ''}
  </div>
  ${
    e.lotteries.length > 0
      ? `<ul class="lotteries">${e.lotteries.map((l) => renderLottery(l, now)).join('')}</ul>`
      : '<p class="no-lottery">チケット情報は未収集です(毎晩自動で再調査しています)</p>'
  }
  </div>
  <div class="serial" aria-hidden="true">NO.${escapeHtml(e.id.toUpperCase())}</div>
</article>
</main>
${SITE_FOOTER}
${COUNTDOWN_SCRIPT}
</body>
</html>`
}
