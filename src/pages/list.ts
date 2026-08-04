import { todayInJst } from '../lib/db'
import type { EventWithLotteries } from '../lib/db'
import { formatJst } from '../lib/format'
import { escapeHtml } from '../lib/html'
import { buildHeadMeta, buildJsonLd, buildMetaDescription } from '../lib/seo'
import type { LotteryRow } from '../types'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

const WEEKDAYS_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** チケット半券用の日付パーツ { y: '2027', md: '02.13', dw: 'SAT' } */
export function stubDate(date: string): { y: string; md: string; dw: string } {
  const [y, m, day] = date.split('-').map(Number)
  if (!y || !m || !day) return { y: '', md: date, dw: '' }
  const dw = WEEKDAYS_EN[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]
  return { y: String(y), md: `${String(m).padStart(2, '0')}.${String(day).padStart(2, '0')}`, dw }
}

type LotteryStatus = 'open' | 'upcoming' | 'closed' | 'unknown'

export function lotteryStatus(l: LotteryRow, now: Date): LotteryStatus {
  const starts = l.starts_at ? new Date(l.starts_at) : null
  const ends = l.ends_at ? new Date(l.ends_at) : null
  if (starts && now < starts) return 'upcoming'
  if (ends && now > ends) return 'closed'
  if (starts || ends) return 'open'
  return 'unknown'
}

const STATUS_LABEL: Record<LotteryStatus, string> = {
  open: '受付中',
  upcoming: '受付前',
  closed: '終了',
  unknown: '期間不明',
}

/** サーバー側の静的カウントダウン文字列(クライアントJSが30秒ごとに更新) */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '終了'
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) return `あと${days}日`
  if (hours >= 1) return `あと${hours}時間${minutes % 60}分`
  return `あと${minutes}分`
}

function renderDeadlines(events: EventWithLotteries[], now: Date): string {
  type Entry = { event: EventWithLotteries; lottery: LotteryRow; status: LotteryStatus }
  const entries: Entry[] = []
  for (const e of events) {
    for (const l of e.lotteries) {
      const status = lotteryStatus(l, now)
      if ((status === 'open' || status === 'upcoming') && l.ends_at) {
        entries.push({ event: e, lottery: l, status })
      }
    }
  }
  if (entries.length === 0) return ''
  entries.sort(
    (a, b) =>
      (a.lottery.ends_at ?? '').localeCompare(b.lottery.ends_at ?? '') ||
      a.event.date.localeCompare(b.event.date),
  )

  // 「アーティスト+締切」でグループ化して1行にまとめる。
  // 同一ツアーの複数公演日や、席種違いの同時受付(プレリザーブ/ステージサイド等)を集約する
  type Group = { first: Entry; names: string[]; dates: Set<string> }
  const groups = new Map<string, Group>()
  for (const entry of entries) {
    const key = `${entry.event.artist}|${Date.parse(entry.lottery.ends_at!)}`
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { first: entry, names: [entry.lottery.name], dates: new Set([entry.event.date]) })
    } else {
      if (!g.names.includes(entry.lottery.name)) g.names.push(entry.lottery.name)
      g.dates.add(entry.event.date)
    }
  }

  const md = (date: string) => {
    const [, m, d] = date.split('-').map(Number)
    return `${m}/${d}`
  }
  const items = [...groups.values()]
    .slice(0, 6)
    .map(({ first, names, dates }) => {
      const { event, lottery, status } = first
      const ends = new Date(lottery.ends_at!)
      const countdown =
        status === 'open' ? formatCountdown(ends.getTime() - now.getTime()) : `${formatJst(lottery.starts_at)}〜`
      const sortedDates = [...dates].sort()
      const datesLabel = `${sortedDates[0].slice(0, 4)}/${sortedDates.map(md).join('・')}`
      const nameLabel = names.length > 1 ? `${names[0]} 他${names.length - 1}件` : names[0]
      return `<a class="deadline${status === 'open' ? ' deadline-open' : ''}" href="/e/${escapeHtml(event.id)}">
      <span class="countdown"${status === 'open' ? ` data-ends="${escapeHtml(lottery.ends_at!)}"` : ''}>${escapeHtml(countdown)}</span>
      <span><span class="who">${escapeHtml(event.artist)}</span>
      <span class="what">${escapeHtml(nameLabel)} · 公演 ${escapeHtml(datesLabel)} · 〆${escapeHtml(formatJst(lottery.ends_at))}</span></span>
      <span class="badge badge-${status}">${STATUS_LABEL[status]}</span>
    </a>`
    })
    .join('\n')
  return `<h2 class="section">締切が近い受付</h2>\n<div class="deadlines">${items}</div>`
}

export function renderLottery(l: LotteryRow, now: Date): string {
  const status = lotteryStatus(l, now)
  const period =
    l.starts_at || l.ends_at ? `${formatJst(l.starts_at)} 〜 ${formatJst(l.ends_at)}` : '期間未確認'
  const name = l.url
    ? `<a href="${escapeHtml(l.url)}" rel="noopener" target="_blank">${escapeHtml(l.name)}</a>`
    : escapeHtml(l.name)
  return `<li class="lottery lottery-${status}">
    <span class="badge badge-${status}">${STATUS_LABEL[status]}</span>
    <span class="lottery-name">${name}</span>
    <span class="lottery-period">${escapeHtml(period)}</span>
    ${l.confidence === 'inferred' ? '<span class="badge badge-inferred" title="自動収集による推定情報">推定</span>' : ''}
  </li>`
}

function renderEvent(e: EventWithLotteries, now: Date): string {
  const hasOpen = e.lotteries.some((l) => lotteryStatus(l, now) === 'open')
  const isToday = e.date === todayInJst(now)
  const times = [e.open_time && `開場 ${e.open_time}`, e.start_time && `開演 ${e.start_time}`]
    .filter(Boolean)
    .join(' / ')
  const d = stubDate(e.date)
  return `<article class="tix${hasOpen ? ' open' : ''}${isToday ? ' is-today' : ''}" id="${escapeHtml(e.id)}">
    <div class="stub">
      ${isToday ? '<div class="today-label">本日公演</div>' : `<div class="y">${escapeHtml(d.y)}</div>`}
      <div class="md">${escapeHtml(d.md)}</div>
      <div class="dw">${escapeHtml(d.dw)}</div>
    </div>
    <div class="bod">
    <h2 class="event-title"><a href="/e/${escapeHtml(e.id)}">${escapeHtml(e.artist)}</a></h2>
    <div class="tour-title">${escapeHtml(e.title)}</div>
    <div class="event-meta">
      ${times ? `<span class="times">${escapeHtml(times)}</span>` : ''}
      ${e.source_url ? `<a href="${escapeHtml(e.source_url)}" rel="noopener" target="_blank">公式情報</a>` : ''}
      ${e.confidence === 'inferred' ? '<span class="badge badge-inferred" title="会場公式では未確認">推定</span>' : ''}
    </div>
    ${e.lotteries.length > 0 ? `<ul class="lotteries">${e.lotteries.map((l) => renderLottery(l, now)).join('')}</ul>` : '<p class="no-lottery">チケット情報は未収集です</p>'}
    </div>
    <div class="serial" aria-hidden="true">NO.${escapeHtml(e.id.toUpperCase())}</div>
  </article>`
}

export const COUNTDOWN_SCRIPT = `<script>
(function(){
  function fmt(ms){
    if (ms <= 0) return '終了';
    var m = Math.floor(ms/60000), h = Math.floor(m/60), d = Math.floor(h/24);
    if (d >= 1) return 'あと' + d + '日';
    if (h >= 1) return 'あと' + h + '時間' + (m % 60) + '分';
    return 'あと' + m + '分';
  }
  function tick(){
    document.querySelectorAll('[data-ends]').forEach(function(el){
      el.textContent = fmt(new Date(el.dataset.ends).getTime() - Date.now());
    });
  }
  tick(); setInterval(tick, 30000);
})();
</script>`

export function renderListPage(events: EventWithLotteries[], now: Date, canonical: string): string {
  const body =
    events.length > 0
      ? events.map((e) => renderEvent(e, now)).join('\n')
      : '<p class="empty">今後の公演情報はまだありません。</p>'
  const head = buildHeadMeta({
    title: 'サンドーム福井 ライブ予定・チケット抽選情報',
    description: buildMetaDescription(events),
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
<script type="application/ld+json">${buildJsonLd(events, canonical)}</script>
</head>
<body>
${SITE_HEADER}
<main>
${renderDeadlines(events, now)}
<h2 class="section">今後の公演</h2>
${body}
</main>
${SITE_FOOTER}
${COUNTDOWN_SCRIPT}
</body>
</html>`
}
