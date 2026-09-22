import { isRestrictedLottery } from '../lib/audience'
import { todayInJst } from '../lib/db'
import type { EventWithLotteries } from '../lib/db'
import { formatJst } from '../lib/format'
import { groupConsecutive, mergeLotteries } from '../lib/group'
import type { EventGroup, MergedLottery } from '../lib/group'
import { escapeHtml, safeHttpUrl } from '../lib/html'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta, buildJsonLd, buildMetaDescription } from '../lib/seo'
import type { LotteryStatus } from '../lib/status'
import { lotteryStatus } from '../lib/status'
import { isPurchasePage } from '../lib/ticket-url'
import type { LotteryRow } from '../types'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土']

/** 日付タイル用のパーツ { ym: '2027.02', d: '13', dw: '土' } */
export function dateParts(date: string): { ym: string; d: string; dw: string } {
  const [y, m, day] = date.split('-').map(Number)
  if (!y || !m || !day) return { ym: '', d: date, dw: '' }
  const dw = WEEKDAYS_JA[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]
  return { ym: `${y}.${String(m).padStart(2, '0')}`, d: String(day), dw }
}

/**
 * タイル内の区切り。連日は中黒(3・4)、月の範囲と3日以上は en dash(10–11 / 3–5)。
 * 中黒は「並列」、en dash は「範囲」で意味が違うため字種を分ける。
 * 色は落とさない ─ 黄地(--primary-container)の上で 4.5:1 を満たせないので、階層はサイズ差で作る
 */
const SEP_NAKAGURO = '<span class="sep">・</span>'
const SEP_DASH = '<span class="sep-en">–</span>'

/** "2026年10月3日(土)" */
export function formatDateJa(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return `${y}年${m}月${d}日(${WEEKDAYS_JA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`
}

/**
 * 連日 1 本ぶんの日付。title と meta description 用なので、2 日目以降は
 * 重なっている年・月を落として読ませる。"2026年10月3日(土)・4日(日)" / 3 日以上は "〜"
 */
export function formatRunDatesJa(dates: string[]): string {
  if (dates.length === 0) return ''
  const sorted = [...dates].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === last) return formatDateJa(first)
  const [fy, fm] = first.split('-').map(Number)
  const [ly, lm, ld] = last.split('-').map(Number)
  const join = sorted.length === 2 ? '・' : '〜'
  if (!fy || !fm || !ly || !lm || !ld) return `${formatDateJa(first)}${join}${formatDateJa(last)}`
  const lw = WEEKDAYS_JA[new Date(Date.UTC(ly, lm - 1, ld)).getUTCDay()]
  const tail = fy !== ly ? formatDateJa(last) : fm !== lm ? `${lm}月${ld}日(${lw})` : `${ld}日(${lw})`
  return `${formatDateJa(first)}${join}${tail}`
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
  return `<div class="section"><h2>販売中のチケット</h2><span class="sup">一般申込み可能</span></div>
<div class="list">
${items}
</div>`
}

/** 抽選 1 行。note は連結カードで一部の公演日にしか紐づかない受付への注記("10/4 のみ") */
export function renderLottery(l: LotteryRow, now: Date, note = ''): string {
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
  const noteHtml = note ? `<span class="lot-note">${escapeHtml(note)}</span>` : ''
  return `<li class="lot lot-${status}">${statusChip(status)}<span class="lot-name">${name}</span>${noteHtml}<span class="lot-period">${escapeHtml(period)}</span></li>`
}

const SOON_LABEL = ['本日公演', '明日公演', '明後日公演']

/** "10/3(土)" */
function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return `${m}/${d}(${WEEKDAYS_JA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`
}

const md = (date: string) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}`
}

export type CardOptions = {
  /** 詳細ページで開いている公演日。指定すると詳細表示(リンク・会場・当日の強調)になる */
  focusDate?: string
  /** 過去の公演ページ用。抽選は一覧せず件数だけにする */
  compact?: boolean
}

/**
 * 公演カード。連日公演は 1 グループ = 1 枚で、一覧と詳細で共用する。
 * カードの id は初日の公演 ID。2 日目以降は空アンカーを置き、/#ev-<日付> のどれからでも着地できるようにする
 */
export function renderEventCard(group: EventGroup, now: Date, opts: CardOptions = {}): string {
  const { events, first, last } = group
  const detail = opts.focusDate !== undefined
  const focus = events.find((e) => e.date === opts.focusDate) ?? first
  const multi = events.length > 1
  const hasOpen = events.some((e) => e.lotteries.some((l) => lotteryStatus(l, now) === 'open'))

  const today = todayInJst(now)
  const daysAway = (e: EventWithLotteries) => Math.round((Date.parse(e.date) - Date.parse(today)) / 86400000)
  // 「本日/明日/明後日」は区間内で今日以降の直近の日で判定する
  const upcoming = events.find((e) => daysAway(e) >= 0) ?? last
  const da = daysAway(upcoming)
  const soonLabel = da >= 0 && da <= 2 ? SOON_LABEL[da] : null
  const isToday = events.some((e) => daysAway(e) === 0)

  // 以下 3 つは組み立て済みの HTML。dateParts は不正な日付でそのまま date を d に返すのでパーツ単位でエスケープする
  const f = dateParts(first.date)
  const l = dateParts(last.date)
  const tileYm =
    multi && f.ym !== l.ym ? `${escapeHtml(f.ym)}${SEP_DASH}${escapeHtml(l.ym.slice(5))}` : escapeHtml(f.ym)
  // 2 日は中黒で並列に。3 日以上は中黒だと「3 と 5」に読めるので範囲の en dash へ倒し、
  // 曜日も中日を畳んで初日–最終日だけにする(全部並べると 72px / 60px の枠に収まらない)
  const rangeSep = events.length === 2 ? SEP_NAKAGURO : SEP_DASH
  const tileD = multi ? `${escapeHtml(f.d)}${rangeSep}${escapeHtml(l.d)}` : escapeHtml(f.d)
  const tileW = multi ? `${escapeHtml(f.dw)}${rangeSep}${escapeHtml(l.dw)}` : escapeHtml(f.dw)

  // 一覧: カードタイトルは詳細へ。詳細: タイトルはアーティストページへ(そのアーティストの他公演と解説)
  const title = detail
    ? `<a href="/a/${encodeURIComponent(first.artist)}">${escapeHtml(first.artist)}</a>`
    : `<a href="/e/${escapeHtml(first.id)}">${escapeHtml(first.artist)}</a>`

  const timesOf = (e: EventWithLotteries) =>
    [e.open_time && `開場 ${e.open_time}`, e.start_time && `開演 ${e.start_time}`].filter(Boolean).join(' / ')
  let schedule = ''
  if (multi || detail) {
    // 日ごとに開場・開演を並べる(同一ツアーでも曜日で時刻が違う)。
    // 連日は 1 本のランを 1 ページとして扱うので、どの日で開いたかは強調しない
    schedule = `<div class="days">${events
      .map((e) => {
        const t = timesOf(e)
        return `<span class="meta-item day">${iconSvg('schedule')}<span>${escapeHtml(dayLabel(e.date))}${t ? ` ${escapeHtml(t)}` : ''}</span></span>`
      })
      .join('')}</div>`
  } else {
    const t = timesOf(first)
    schedule = t ? `<div class="meta"><span class="meta-item">${iconSvg('schedule')}${escapeHtml(t)}</span></div>` : ''
  }
  const venue = detail
    ? `<div class="meta"><span class="meta-item">${iconSvg('place')}サンドーム福井(福井県越前市)</span></div>`
    : ''

  let actions = ''
  if (detail) {
    // 「コンサート情報」はアーティスト側のツアーページへ。未収集なら情報源(会場ページ)で代用
    const infoUrl = safeHttpUrl(focus.tour_url) ?? safeHttpUrl(focus.source_url)
    const artistUrl = safeHttpUrl(focus.artist_url)
    const links = [
      artistUrl
        ? `<a class="btn-text" href="${escapeHtml(artistUrl)}" rel="noopener" target="_blank">${escapeHtml(focus.artist)} 公式サイト${iconSvg('open_in_new')}</a>`
        : '',
      infoUrl
        ? `<a class="btn-text" href="${escapeHtml(infoUrl)}" rel="noopener" target="_blank">コンサート情報${iconSvg('open_in_new')}</a>`
        : '',
    ].join('')
    actions = links ? `<div class="actions">${links}</div>` : ''
  }

  const merged: MergedLottery[] = mergeLotteries(group)
  const lots = opts.compact
    ? merged.length > 0
      ? `<p class="lot-summary"><a href="/e/${escapeHtml(first.id)}">先行・抽選 ${merged.length} 件の記録</a></p>`
      : ''
    : merged.length > 0
      ? `<ul class="lots">${merged
          .map((m) => {
            const partial = m.dates.length < events.length
            return renderLottery(m, now, partial ? `${m.dates.map(md).join('・')} のみ` : '')
          })
          .join('')}</ul>`
      : events[events.length - 1].date < todayInJst(now)
        ? '' // 開催済みの公演はもう収集しないので、「未収集」とは言わない
        : `<p class="none">${detail ? 'チケット情報は未収集です(毎晩自動で再調査しています)' : 'チケット情報は未収集です'}</p>`

  const anchors = events
    .slice(1)
    .map((e) => `<span class="anchor" id="${escapeHtml(e.id)}"></span>`)
    .join('')

  // ツアービジュアル(og:image の直リンク)。開いている日の画像を優先し、無ければ他の日のもの。
  // 読み込めなければ領域ごと閉じる(壊れた画像アイコンを見せない)
  // 画像のリンク先: 一覧では詳細へ、詳細では出典(ツアーページ)へ
  const imageUrl = safeHttpUrl(focus.image_url) ?? events.map((e) => safeHttpUrl(e.image_url)).find((u) => u) ?? null
  const mediaHref = detail ? safeHttpUrl(focus.tour_url) : `/e/${first.id}`
  const img = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(first.title)}" loading="lazy" decoding="async" onerror="this.closest('.card-media').remove()">`
    : ''
  const media = !img
    ? ''
    : mediaHref
      ? `<a class="card-media" href="${escapeHtml(mediaHref)}"${detail ? ' rel="noopener" target="_blank"' : ''}>${img}</a>`
      : `<div class="card-media">${img}</div>`

  // 一覧とアーティストページでは card-main 全体を詳細への当たり判定にする(タイトルの <a> を CSS で引き伸ばす)。
  // 抽選リストは外に置いたまま ─ 中の外部チケットリンクが <a> の入れ子になるのと、期間の日時が選択できなくなるのを避ける
  const tap = !detail && !opts.compact

  return `<article class="card${hasOpen ? ' is-open' : ''}${isToday ? ' is-today' : ''}" id="${escapeHtml(first.id)}">
  ${anchors}
  ${media}
  <div class="card-main${tap ? ' tap' : ''}">
  <div class="tile">
    <span class="tile-bar${soonLabel ? ' soon' : ''}${isToday ? ' today' : ''}">${soonLabel ?? tileYm}</span>
    <span class="tile-body">
      <span class="tile-d${multi ? ' range' : ''}">${tileD}</span>
      <span class="tile-w">${tileW}</span>
    </span>
  </div>
  <div class="card-body">
    <h3 class="card-title">${title}</h3>
    <p class="card-sub">${escapeHtml(first.title)}</p>
    ${schedule}
    ${venue}
    ${actions}
    ${lots}
  </div>
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
      ? `<div class="cards">\n${groupConsecutive(events).map((g) => renderEventCard(g, now)).join('\n')}\n</div>`
      : '<p class="none">今後の公演情報はまだありません。</p>'
  const head = buildHeadMeta({
    title: 'サンドーム福井 コンサート・ライブ情報｜チケット抽選・先行',
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
<picture class="banner">
  <source media="(max-width: 480px)" srcset="/img/sundome-fukui-16x9.webp">
  <img src="/img/sundome-fukui-21x9.webp" alt="サンドーム福井の外観" width="1600" height="685" decoding="async" fetchpriority="high">
</picture>
${renderDeadlines(events, now)}
<div class="section"><h2>今後の公演</h2><span class="sup">${events.length} 公演</span></div>
${body}
<div class="section"><h2>ガイド</h2></div>
<div class="list">
  <a class="row" href="/guide/access"><span class="row-text"><span class="row-h">アクセス・会場ガイド</span><span class="row-s">鯖江駅・武生駅からの行き方、駐車場、開場前の過ごし方</span></span>${iconSvg('arrow_forward')}</a>
  <a class="row" href="/guide/tickets"><span class="row-text"><span class="row-h">チケットの取り方</span><span class="row-s">先行・抽選・一般発売の違いと、公式リセールの使い方</span></span>${iconSvg('arrow_forward')}</a>
</div>
<p class="more"><a class="btn-text" href="/past">過去の公演を見る${iconSvg('arrow_forward')}</a></p>
</main>
${SITE_FOOTER}
${COUNTDOWN_SCRIPT}
</body>
</html>`
}
