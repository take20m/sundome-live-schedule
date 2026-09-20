import { isRestrictedLottery } from '../lib/audience'
import { todayInJst } from '../lib/db'
import type { EventWithLotteries } from '../lib/db'
import { formatJst } from '../lib/format'
import { escapeHtml } from '../lib/html'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta, buildJsonLd, buildMetaDescription } from '../lib/seo'
import type { LotteryStatus } from '../lib/status'
import { lotteryStatus } from '../lib/status'
import { isPurchasePage } from '../lib/ticket-url'
import type { LotteryRow } from '../types'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

const WEEKDAYS_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土']

/** 日付タイル用のパーツ { ym: '2027.02', d: '13', dw: 'SAT' } */
export function dateParts(date: string): { ym: string; d: string; dw: string } {
  const [y, m, day] = date.split('-').map(Number)
  if (!y || !m || !day) return { ym: '', d: date, dw: '' }
  const dw = WEEKDAYS_EN[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]
  return { ym: `${y}.${String(m).padStart(2, '0')}`, d: String(day), dw }
}

/** "2026年10月3日(土)" */
export function formatDateJa(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return `${y}年${m}月${d}日(${WEEKDAYS_JA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`
}

const STATUS_LABEL: Record<LotteryStatus, string> = {
  open: '受付中',
  upcoming: '受付前',
  closed: '終了',
  soldout: '売り切れ',
  unknown: '期間不明',
}

function statusChip(status: LotteryStatus): string {
  return `<span class="chip chip-${status}">${STATUS_LABEL[status]}</span>`
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
      // 会員限定・CD封入特典は、資格のない通りすがりの人には申し込めないので載せない
      if (isRestrictedLottery(l.name)) continue
      const status = lotteryStatus(l, now)
      // 受付中(締切あり/終了未定とも)と受付前を載せる。売り切れ・終了・期間不明は除外
      if (status === 'open' || (status === 'upcoming' && l.ends_at)) {
        entries.push({ event: e, lottery: l, status })
      }
    }
  }
  if (entries.length === 0) return ''
  // 並び: ステータス優先。受付中(締切順) → 受付中(終了未定) → 受付前(開始順)
  const rank = (x: Entry) => (x.status === 'upcoming' ? 2 : x.lottery.ends_at ? 0 : 1)
  const sortKey = (x: Entry) => x.lottery.ends_at ?? x.lottery.starts_at ?? '9999'
  entries.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      sortKey(a).localeCompare(sortKey(b)) ||
      a.event.date.localeCompare(b.event.date),
  )

  // 「アーティスト+締切」でグループ化して1行にまとめる。
  // 同一ツアーの複数公演日や、席種違いの同時受付(プレリザーブ/ステージサイド等)を集約する
  type Group = { first: Entry; names: string[]; dates: Set<string> }
  const groups = new Map<string, Group>()
  for (const entry of entries) {
    const key = `${entry.event.artist}|${entry.lottery.ends_at ? Date.parse(entry.lottery.ends_at) : 'endless'}`
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
      const hasEnd = lottery.ends_at !== null
      const countdown =
        status === 'open'
          ? hasEnd
            ? formatCountdown(new Date(lottery.ends_at!).getTime() - now.getTime())
            : '販売中'
          : `${formatJst(lottery.starts_at)}〜`
      const sortedDates = [...dates].sort()
      const datesLabel = `${sortedDates[0].slice(0, 4)}/${sortedDates.map(md).join('・')}`
      const nameLabel = names.length > 1 ? `${names[0]} 他${names.length - 1}件` : names[0]
      const endLabel = hasEnd ? `〆${formatJst(lottery.ends_at)}` : '〆未定'
      return `<a class="row${status === 'open' ? ' row-open' : ''}" href="/e/${escapeHtml(event.id)}">
  <span class="cd"${status === 'open' && hasEnd ? ` data-ends="${escapeHtml(lottery.ends_at!)}"` : ''}>${escapeHtml(countdown)}</span>
  <span class="row-text"><span class="row-h">${escapeHtml(event.artist)}</span><span class="row-s">${escapeHtml(nameLabel)} · 公演 ${escapeHtml(datesLabel)} · ${escapeHtml(endLabel)}</span></span>
  ${statusChip(status)}
</a>`
    })
    .join('\n')
  return `<div class="section"><h2>販売中のチケット</h2><span class="sup">会員資格なしで申し込めるもの</span></div>
<div class="list">
${items}
</div>`
}

export function renderLottery(l: LotteryRow, now: Date): string {
  const status = lotteryStatus(l, now)
  const period =
    l.starts_at || l.ends_at ? `${formatJst(l.starts_at)} 〜 ${formatJst(l.ends_at)}` : '期間未確認'
  // 受付中かつ実際に申し込める購入ページのときだけリンクにする。
  // 終了・受付前や、告知ページ・まとめ記事に飛ばしても申し込めず苛立たせるだけ
  const url = l.url
  const name =
    status === 'open' && isPurchasePage(url)
      ? `<a href="${escapeHtml(url)}" rel="noopener" target="_blank">${escapeHtml(l.name)}</a>`
      : escapeHtml(l.name)
  return `<li class="lot lot-${status}">${statusChip(status)}<span class="lot-name">${name}</span><span class="lot-period">${escapeHtml(period)}</span></li>`
}

const SOON_LABEL = ['本日公演', '明日公演', '明後日公演']

/**
 * 公演カード。一覧と詳細で共用する。
 * detail=true のとき: タイトルをリンクにせず、日付・会場・公式サイト/コンサート情報のリンクを出す
 */
export function renderEventCard(e: EventWithLotteries, now: Date, detail = false): string {
  const hasOpen = e.lotteries.some((l) => lotteryStatus(l, now) === 'open')
  const daysAway = Math.round((Date.parse(e.date) - Date.parse(todayInJst(now))) / 86400000)
  const soonLabel = daysAway >= 0 && daysAway <= 2 ? SOON_LABEL[daysAway] : null
  const isToday = daysAway === 0
  const times = [e.open_time && `開場 ${e.open_time}`, e.start_time && `開演 ${e.start_time}`]
    .filter(Boolean)
    .join(' / ')
  const d = dateParts(e.date)

  const title = detail
    ? escapeHtml(e.artist)
    : `<a href="/e/${escapeHtml(e.id)}">${escapeHtml(e.artist)}</a>`
  const meta = [
    detail ? `<span class="meta-item">${escapeHtml(formatDateJa(e.date))}</span>` : '',
    times ? `<span class="meta-item">${iconSvg('schedule')}${escapeHtml(times)}</span>` : '',
    detail ? `<span class="meta-item">${iconSvg('place')}サンドーム福井(福井県越前市)</span>` : '',
  ].join('')

  let actions = ''
  if (detail) {
    // 「コンサート情報」はアーティスト側のツアーページへ。未収集なら情報源(会場ページ)で代用
    const infoUrl = e.tour_url ?? e.source_url
    const links = [
      e.artist_url
        ? `<a class="btn-text" href="${escapeHtml(e.artist_url)}" rel="noopener" target="_blank">${escapeHtml(e.artist)} 公式サイト${iconSvg('open_in_new')}</a>`
        : '',
      infoUrl
        ? `<a class="btn-text" href="${escapeHtml(infoUrl)}" rel="noopener" target="_blank">コンサート情報${iconSvg('open_in_new')}</a>`
        : '',
    ].join('')
    actions = links ? `<div class="actions">${links}</div>` : ''
  }

  const lots =
    e.lotteries.length > 0
      ? `<ul class="lots">${e.lotteries.map((l) => renderLottery(l, now)).join('')}</ul>`
      : `<p class="none">${detail ? 'チケット情報は未収集です(毎晩自動で再調査しています)' : 'チケット情報は未収集です'}</p>`

  return `<article class="card${hasOpen ? ' is-open' : ''}${isToday ? ' is-today' : ''}" id="${escapeHtml(e.id)}">
  <div class="tile">
    ${soonLabel ? `<span class="tile-soon">${soonLabel}</span>` : `<span class="tile-m">${escapeHtml(d.ym)}</span>`}
    <span class="tile-d">${escapeHtml(d.d)}</span>
    <span class="tile-w">${escapeHtml(d.dw)}</span>
  </div>
  <div class="card-body">
    <h3 class="card-title">${title}</h3>
    <p class="card-sub">${escapeHtml(e.title)}</p>
    ${meta ? `<div class="meta">${meta}</div>` : ''}
    ${actions}
    ${lots}
  </div>
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
      ? `<div class="cards">\n${events.map((e) => renderEventCard(e, now)).join('\n')}\n</div>`
      : '<p class="none">今後の公演情報はまだありません。</p>'
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
<div class="section"><h2>今後の公演</h2><span class="sup">${events.length} 公演</span></div>
${body}
</main>
${SITE_FOOTER}
${COUNTDOWN_SCRIPT}
</body>
</html>`
}
