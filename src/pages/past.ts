import type { EventWithLotteries } from '../lib/db'
import { groupConsecutive } from '../lib/group'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta } from '../lib/seo'
import { renderEventCard } from './list'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

/** 過去の公演。年ごとに新しい順。抽選は件数だけ出し、詳細で全記録を見せる */
export function renderPastPage(events: EventWithLotteries[], now: Date, canonical: string): string {
  // groupConsecutive は日付昇順で返すので、年ごとに束ねてから新しい順に並べ直す
  const byYear = new Map<string, ReturnType<typeof groupConsecutive>>()
  for (const g of groupConsecutive(events).reverse()) {
    const year = g.first.date.slice(0, 4)
    const list = byYear.get(year) ?? []
    list.push(g)
    byYear.set(year, list)
  }
  const sections = [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(
      ([year, groups]) => `<div class="section"><h2>${year}年</h2><span class="sup">${groups.reduce((n, g) => n + g.events.length, 0)} 公演</span></div>
<div class="cards">
${groups.map((g) => renderEventCard(g, now, { compact: true })).join('\n')}
</div>`,
    )
    .join('\n')
  const head = buildHeadMeta({
    title: '過去の公演 | サンドーム福井 コンサート・ライブ情報',
    description: 'サンドーム福井(福井県越前市)で開催されたライブ・コンサートの記録。各公演のチケット先行・抽選の受付履歴も残しています。',
    canonical,
  })
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<style>${SITE_CSS}</style>
</head>
<body>
${SITE_HEADER}
<main>
<div class="back"><a class="btn-text" href="/">${iconSvg('arrow_back')}今後の公演</a></div>
${sections || '<p class="none">過去の公演の記録はまだありません。</p>'}
</main>
${SITE_FOOTER}
</body>
</html>`
}
