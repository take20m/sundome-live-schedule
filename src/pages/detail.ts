import { todayInJst } from '../lib/db'
import type { EventRun, EventWithLotteries } from '../lib/db'
import { escapeHtml, safeHttpUrl } from '../lib/html'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta, buildJsonLd } from '../lib/seo'
import { COUNTDOWN_SCRIPT, formatRunDatesJa, renderEventCard } from './list'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

function metaDescription(e: EventWithLotteries, dates: string): string {
  const names = e.lotteries.map((l) => l.name).slice(0, 3)
  const lotPart = names.length > 0 ? `${names.join('、')}などの受付期間・申込先` : 'チケット受付情報'
  return `${e.artist}のサンドーム福井公演「${e.title}」(${dates})の${lotPart}を自動収集して掲載。締切カウントダウン付き。`
}

export function renderDetailPage(run: EventRun, now: Date, canonical: string): string {
  const e = run.focus
  // 連日は 1 本のランが 1 ページ。canonical は初日に寄せてあるので、題も説明も全公演日を名乗る
  // (初日の日付しか書かないと、2 日目で検索した人にこのページが当たらない)
  const dates = formatRunDatesJa(run.group.events.map((x) => x.date))
  const head = buildHeadMeta({
    title: `${e.artist}「${e.title}」チケット・抽選情報(${dates} サンドーム福井)`,
    description: metaDescription(e, dates),
    canonical,
    // 共有カードにはツアービジュアルを出す。未取得なら会場写真(既定)
    image: safeHttpUrl(e.image_url) ? { url: e.image_url!, alt: `${e.artist}「${e.title}」` } : null,
    // 開催済みの公演は受付情報を持たない薄いページになるので検索には出さない(/past からは辿れる)。
    // 判定は最終日 ─ 初日基準だと、2 日目当日に canonical 先(初日)が noindex になってランごと消える
    noindex: run.group.last.date < todayInJst(now),
  })
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<link rel="alternate" type="application/rss+xml" title="更新情報" href="/feed.xml">
<style>${SITE_CSS}</style>
<script type="application/ld+json">${buildJsonLd(run.group.events, canonical)}</script>
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
