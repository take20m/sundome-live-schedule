import type { EventWithLotteries } from '../lib/db'
import { groupConsecutive } from '../lib/group'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta } from '../lib/seo'
import { renderEventCard } from './list'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

type Groups = ReturnType<typeof groupConsecutive>

/**
 * 過去の公演。年をタブで選び、その年だけ新しい順に出す(4 年分を縦に並べると長すぎる)。
 * 抽選は件数だけ出し、詳細で全記録を見せる。canonical は年を含めない /past 固定
 */
export function renderPastPage(events: EventWithLotteries[], now: Date, canonical: string, yearParam: string | null): string {
  // groupConsecutive は日付昇順で返すので、年ごとに束ねてから新しい順に並べ直す
  const byYear = new Map<string, Groups>()
  for (const g of groupConsecutive(events).reverse()) {
    const year = g.first.date.slice(0, 4)
    const list = byYear.get(year) ?? []
    list.push(g)
    byYear.set(year, list)
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a))
  // 指定がない、または記録のない年なら、いちばん新しい年
  const year = yearParam !== null && byYear.has(yearParam) ? yearParam : (years[0] ?? null)
  const groups = year ? byYear.get(year)! : []
  const count = (gs: Groups) => gs.reduce((n, g) => n + g.events.length, 0)

  const tabs = years
    .map((y) => `<a class="chip${y === year ? ' chip-open' : ''}" href="/past?y=${y}"${y === year ? ' aria-current="page"' : ''}>${y}年</a>`)
    .join('')
  const body = year
    ? `<nav class="years" aria-label="年を選ぶ">${tabs}</nav>
<div class="section"><h2>${year}年</h2><span class="sup">${count(groups)} 公演</span></div>
<div class="cards">
${groups.map((g) => renderEventCard(g, now, { compact: true })).join('\n')}
</div>`
    : '<p class="none">過去の公演の記録はまだありません。</p>'

  const head = buildHeadMeta({
    title: `${year ? `${year}年の公演 | ` : ''}過去の公演 | サンドーム福井 コンサート・ライブ情報`,
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
${body}
</main>
${SITE_FOOTER}
</body>
</html>`
}
