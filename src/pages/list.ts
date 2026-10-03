import { isRestrictedLottery } from '../lib/audience'
import { todayInJst } from '../lib/db'
import type { EventWithLotteries } from '../lib/db'
import { formatJst } from '../lib/format'
import { groupConsecutive, lotteryAnchor, mergeLotteries } from '../lib/group'
import type { EventGroup, MergedLottery } from '../lib/group'
import { escapeHtml, safeHttpUrl } from '../lib/html'
import { iconSvg } from '../lib/icon'
import { buildHeadMeta, buildJsonLd, buildMetaDescription } from '../lib/seo'
import type { LotteryStatus } from '../lib/status'
import { lotteryStatus } from '../lib/status'
import { safeBg, safeFit, safeFocus, safeZoom } from '../lib/focus'
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

/** 販売中欄で締切を赤くする残り時間(表示が「あと3日」以下) */
const SOON_MS = 4 * 24 * 60 * 60 * 1000

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
      // 受付中(締切あり/終了未定とも)だけを載せる。受付前は公演カードで開始日時を予告する
      if (status === 'open') {
        entries.push({ event: e, lottery: l, status })
      }
    }
  }
  if (entries.length === 0) return ''
  // 並び: 締切の近い順、終了未定は最後
  const sortKey = (x: Entry) => x.lottery.ends_at ?? '9999'
  entries.sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.event.date.localeCompare(b.event.date))

  // 「アーティスト+締切」でグループ化して 1 枚にまとめる。
  // 同一ツアーの複数公演日や、席種違いの同時受付(プレリザーブ/ステージサイド等)を集約する
  type Group = { first: Entry; events: EventWithLotteries[] }
  const groups = new Map<string, Group>()
  for (const entry of entries) {
    const key = `${entry.event.artist}|${entry.lottery.ends_at ? Date.parse(entry.lottery.ends_at) : 'endless'}`
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { first: entry, events: [entry.event] })
    } else if (!g.events.some((e) => e.id === entry.event.id)) {
      g.events.push(entry.event)
    }
  }

  const card = ({ first, events: evs }: Group) => {
    const { event, lottery } = first
    const sorted = [...evs].sort((a, b) => a.date.localeCompare(b.date))
    // 公演日: 「2027/5/1(土)・5/2(日)」。画像の代わりの大きい日付は「5/1・5/2」(3 日以上は初日–最終日)
    const datesLabel = `${sorted[0].date.slice(0, 4)}/${sorted.map((e) => dayLabel(e.date)).join('・')}`
    const bigDate =
      sorted.length <= 2 ? sorted.map((e) => md(e.date)).join('・') : `${md(sorted[0].date)}–${md(sorted[sorted.length - 1].date)}`
    // ツアービジュアルを 16:10 に切る。切り出し位置と「全体を収める + 余白色」は公演カードのサムネと同じ値を使い、
    // 拡大(正方形に切るときの値)は使わない。読み込めなければ日付に戻す
    const imgEvent = [event, ...sorted].find((e) => safeHttpUrl(e.image_url))
    const imageUrl = imgEvent ? safeHttpUrl(imgEvent.image_url) : null
    const fit = safeFit(imgEvent?.image_fit) ?? 'cover'
    const bg = fit === 'contain' ? safeBg(imgEvent?.image_bg) : null
    const focusPos = safeFocus(imgEvent?.image_focus) ?? '50% 50%'
    // 正方形用の拡大(上下の帯を枠外へ出すなど)は、そのままでは 16:10 に効きすぎる。画像の縦横比が分かってから
    // スクリプトが「正方形で見せていた高さを超えない」倍率に換算する。縮めて収める画像には使わない
    const zoom = fit === 'cover' ? safeZoom(imgEvent?.image_zoom) : null
    const imgStyle = [
      fit === 'contain' ? 'object-fit: contain' : '',
      focusPos !== '50% 50%' ? `object-position: ${focusPos}` : '',
      zoom && zoom > 1 ? `transform-origin: ${focusPos}` : '',
    ]
      .filter(Boolean)
      .join('; ')
    const media = `<span class="sale-media"${bg ? ` style="background: ${bg}"` : ''}>${
      imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" decoding="async"${zoom && zoom > 1 ? ` data-zoom="${zoom}"` : ''}${imgStyle ? ` style="${imgStyle}"` : ''} onerror="this.nextElementSibling.hidden=false;this.parentNode.style.background='';this.remove()">`
        : ''
    }<span class="sale-date"${imageUrl ? ' hidden' : ''}>${escapeHtml(bigDate)}</span></span>`
    // 状態は 1 か所だけ。締切までの残り(3 日以内は赤)、締切が無ければ「締切未定」
    let state: string
    if (lottery.ends_at) {
      const left = new Date(lottery.ends_at).getTime() - now.getTime()
      state = `<span class="pill pill-left${left < SOON_MS ? ' cd-soon' : ''}">${iconSvg('schedule')}<span data-ends="${escapeHtml(lottery.ends_at)}">${escapeHtml(formatCountdown(left))}</span>${iconSvg('chevron_right')}</span>`
    } else {
      state = `<span class="pill">${iconSvg('calendar_today')}<span>締切未定</span>${iconSvg('chevron_right')}</span>`
    }
    // 受付の名前は出さない(カードから詳細ページのその受付へ飛べる)。期間と名前は詳細ページにある
    return `<li><a class="sale-card" href="/e/${escapeHtml(event.id)}#${lotteryAnchor(lottery)}">
  ${media}
  <span class="sale-body"><span class="sale-h">${escapeHtml(event.artist)}</span><span class="sale-s">${escapeHtml(datesLabel)}</span>${state}</span>
</a></li>`
  }
  return `<div class="section"><h2 id="sale-title">販売中のチケット</h2><span class="sup">一般申込み可能</span></div>
<div class="sale">
<button class="sale-nav sale-prev" type="button" aria-label="前へ" hidden>${iconSvg('chevron_left')}</button>
<ul class="sale-track" aria-labelledby="sale-title">
${[...groups.values()].slice(0, 6).map(card).join('\n')}
</ul>
<button class="sale-nav sale-next" type="button" aria-label="次へ" hidden>${iconSvg('chevron_right')}</button>
</div>`
}

/**
 * 抽選 1 行。note は連結カードで一部の公演日にしか紐づかない受付への注記("10/4 のみ")。
 * detail: 詳細ページの行。販売中欄から飛べるよう id を付け、期間も出す。
 * 一覧のカードでは期間を出さない(受付中のものだけが並び、締切は販売中欄のカウントダウンにある)
 */
export function renderLottery(l: LotteryRow, now: Date, note = '', detail = false): string {
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
  const periodHtml = detail ? `<span class="lot-period">${escapeHtml(period)}</span>` : ''
  return `<li class="lot lot-${status}"${detail ? ` id="${lotteryAnchor(l)}"` : ''}>${statusChip(status)}<span class="lot-name">${name}</span>${noteHtml}${periodHtml}</li>`
}

const SOON_LABEL = ['本日', '明日', '明後日']

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

  // 詳細: 日ごとに「日付 開場 / 開演」。一覧: 日付は上の行(サムネ時)か日付タイルが示すので繰り返さず、
  // 連日なら曜日だけ、時刻は開演だけにする(開演が未確認なら開場)
  const timesOf = (e: EventWithLotteries) =>
    detail
      ? [e.open_time && `開場 ${e.open_time}`, e.start_time && `開演 ${e.start_time}`].filter(Boolean).join(' / ')
      : e.start_time
        ? `開演 ${e.start_time}`
        : e.open_time
          ? `開場 ${e.open_time}`
          : ''
  let schedule = ''
  if (multi || detail) {
    // 日ごとに並べる(同一ツアーでも曜日で時刻が違う)。
    // 連日は 1 本のランを 1 ページとして扱うので、どの日で開いたかは強調しない
    schedule = `<div class="days">${events
      .map((e) => {
        const t = timesOf(e)
        const day = detail ? dayLabel(e.date) : dateParts(e.date).dw
        return `<span class="meta-item day">${iconSvg('schedule')}<span>${escapeHtml(day)}${t ? ` ${escapeHtml(t)}` : ''}</span></span>`
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
  // 一覧では、今クリックして申し込める受付(受付中で申込ページがある = renderLottery がリンクにするもの)を出す。
  // 終了・売り切れ・期間不明や、申込先の無い受付は視線を取るだけなので詳細ページに任せる
  const shown = detail ? merged : merged.filter((m) => lotteryStatus(m, now) === 'open' && isPurchasePage(m.url))
  // 受付前は一覧では「受付前 10/5 12:00〜」の予告だけにする。一般申込み可能なもの(販売中欄と同じ基準)を
  // 開始日時ごとに 1 行へまとめ、受付名は出さない(詳細ページにある)。開始時刻を過ぎれば上の受付中の行になる
  const upcomingStarts = new Map<string, Set<string>>()
  if (!detail) {
    for (const m of merged) {
      if (lotteryStatus(m, now) !== 'upcoming' || isRestrictedLottery(m.name)) continue
      const dates = upcomingStarts.get(m.starts_at!) ?? new Set<string>()
      m.dates.forEach((d) => dates.add(d))
      upcomingStarts.set(m.starts_at!, dates)
    }
  }
  const upcomingRows = [...upcomingStarts]
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([startsAt, dates]) => {
      const note = dates.size < events.length ? `<span class="lot-note">${escapeHtml([...dates].sort().map(md).join('・'))} のみ</span>` : ''
      return `<li class="lot lot-upcoming">${statusChip('upcoming')}<span class="lot-name">${escapeHtml(formatJst(startsAt))}〜</span>${note}</li>`
    })
  const lots = opts.compact
    ? merged.length > 0
      ? `<p class="lot-summary"><a href="/e/${escapeHtml(first.id)}">先行・抽選 ${merged.length} 件の記録</a></p>`
      : ''
    : shown.length + upcomingRows.length > 0
      ? `<ul class="lots">${shown
          .map((m) => {
            const partial = m.dates.length < events.length
            return renderLottery(m, now, partial ? `${m.dates.map(md).join('・')} のみ` : '', detail)
          })
          .join('')}${upcomingRows.join('')}</ul>`
      : !detail && merged.length > 0
        ? '' // 受付の記録はあるが今申し込めるもの・予告するものがない。一覧では何も出さない(詳細ページに全部ある)
      : events[events.length - 1].date < todayInJst(now)
        ? '' // 開催済みの公演はもう収集しないので、「未収集」とは言わない
        : `<p class="none">${detail ? 'チケット情報は未収集です(毎晩調べ直しています)' : 'チケット情報は未収集です'}</p>`

  const anchors = events
    .slice(1)
    .map((e) => `<span class="anchor" id="${escapeHtml(e.id)}"></span>`)
    .join('')

  // ツアービジュアル(og:image の直リンク)。開いている日の画像を優先し、無ければ他の日のもの。
  // 読み込めなければ領域ごと閉じる(壊れた画像アイコンを見せない)
  // 画像のリンク先: 一覧では詳細へ、詳細では出典(ツアーページ)へ
  const imageUrl = safeHttpUrl(focus.image_url) ?? events.map((e) => safeHttpUrl(e.image_url)).find((u) => u) ?? null
  const mediaHref = detail ? safeHttpUrl(focus.tour_url) : `/e/${first.id}`
  // 詳細は上に 16:9 の帯。一覧は日付タイルの代わりに左の正方形サムネにする(カードが低くなり、公演名と受付が先に目に入る)。
  // 正方形に切り出す中心は image_focus(夜間処理が画像を見て決める。画像は保存しない)。未設定なら中央
  const thumbMode = !detail && imageUrl !== null
  const img = imageUrl && detail
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(first.title)}" loading="lazy" decoding="async" onerror="this.closest('.card-media').remove()">`
    : ''
  const media = !img
    ? ''
    : mediaHref
      ? `<a class="card-media" href="${escapeHtml(mediaHref)}" rel="noopener" target="_blank">${img}</a>`
      : `<div class="card-media">${img}</div>`
  // 見せ方(切る/縮めて収める・余白の色・拡大)。どれも検証済みの値だけを style に入れる
  const imgEvent = events.find((e) => safeHttpUrl(e.image_url) === imageUrl)
  const focusPos = safeFocus(imgEvent?.image_focus) ?? '50% 50%'
  const fit = safeFit(imgEvent?.image_fit) ?? 'cover'
  const bg = fit === 'contain' ? safeBg(imgEvent?.image_bg) : null
  const zoom = safeZoom(imgEvent?.image_zoom)
  const imgStyle = [
    fit === 'contain' ? 'object-fit: contain' : '',
    focusPos !== '50% 50%' ? `object-position: ${focusPos}` : '',
    zoom && zoom > 1 ? `transform: scale(${zoom}); transform-origin: ${focusPos}` : '',
  ].filter(Boolean).join('; ')
  // サムネが読み込めなければ日付タイルに戻す(壊れた画像アイコンを見せない)
  const thumb = thumbMode
    ? `<div class="thumb"${bg ? ` style="background: ${bg}"` : ''}><img src="${escapeHtml(imageUrl!)}" alt="${escapeHtml(first.title)}" loading="lazy" decoding="async"${imgStyle ? ` style="${imgStyle}"` : ''} onerror="var t=this.closest('.thumb');t.nextElementSibling.hidden=false;t.remove()"></div>`
    : ''
  // サムネのときは日付を文字で出す。年は今年でなければ付ける
  const dayShort = (date: string) => {
    // 同じ月なら日だけ("4(日)")、月をまたぐなら月から("11/1(日)")
    return first.date.slice(0, 7) === date.slice(0, 7) ? `${dateParts(date).d}(${dateParts(date).dw})` : dayLabel(date)
  }
  const dateText =
    (first.date.slice(0, 4) !== today.slice(0, 4) ? `${first.date.slice(0, 4)}年 ` : '') +
    (events.length === 1 ? dayLabel(first.date) : `${dayLabel(first.date)}${events.length === 2 ? '・' : '〜'}${dayShort(last.date)}`)
  const cardDate = thumbMode
    ? `<p class="card-date">${soonLabel ? `<span class="soon${isToday ? ' today' : ''}">${soonLabel}</span>` : ''}${escapeHtml(dateText)}</p>`
    : ''

  // 一覧・アーティスト・過去公演では card-main 全体を詳細への当たり判定にする(タイトルの <a> を CSS で引き伸ばす)。
  // 抽選リストの申込リンクは <a> の入れ子にできないので、引き伸ばしたリンクの上に重ねて出す
  const tap = !detail

  return `<article class="card${hasOpen ? ' is-open' : ''}${isToday ? ' is-today' : ''}" id="${escapeHtml(first.id)}">
  ${anchors}
  ${media}
  <div class="card-main${tap ? ' tap' : ''}">
  ${thumb}
  <div class="tile"${thumbMode ? ' hidden' : ''}>
    <span class="tile-bar${soonLabel ? ' soon' : ''}${isToday ? ' today' : ''}">${soonLabel ?? tileYm}</span>
    <span class="tile-body">
      <span class="tile-d${multi ? ' range' : ''}">${tileD}</span>
      <span class="tile-w">${tileW}</span>
    </span>
  </div>
  <div class="card-body">
    ${cardDate}
    <h3 class="card-title">${title}</h3>
    ${detail ? `<p class="card-sub">${escapeHtml(first.title)}</p>` : ''}
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
      var ms = new Date(el.dataset.ends).getTime() - Date.now();
      el.textContent = fmt(ms);
      var pill = el.closest('.pill-left');
      if (pill) pill.classList.toggle('cd-soon', ms < ${SOON_MS});
    });
  }
  tick(); setInterval(tick, 30000);
})();
</script>`

/**
 * 販売中欄のカルーセル。幅に収まらないときだけ、末尾の次に先頭が来るように並びを複製してつなぎ、
 * 4 秒ごとに 1 枚ずつ送る(矢印もマウスのある端末に出す)。人が触る・スクロールする・キーボードで動かすと
 * 以後は自動で送らない。マウスが乗っている間、欄が画面外のとき、タブが裏のときは止める。
 * 「動きを減らす」設定なら自動では送らず、矢印でも動きを付けない。
 * 送りの動きはブラウザの smooth スクロールに任せず自前で描く。iOS の WebKit は吸着つきの横スクロールを
 * smooth で動かすと元の位置へ吸い戻すことがあり、iPhone の Chrome では自動送りが進まなかった
 */
const SALE_SCRIPT = `<script>
(function(){
  var root = document.querySelector('.sale'); if (!root) return;
  var track = root.querySelector('.sale-track');
  var prev = root.querySelector('.sale-prev'), next = root.querySelector('.sale-next');
  var items = [].slice.call(track.children);
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stopped = still, hover = false, visible = true, looped = false, anim = 0;
  function pad(){ return parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0; }
  // 各カードの吸着位置(scrollLeft の値)
  function stops(){
    var base = track.getBoundingClientRect().left + pad();
    return [].map.call(track.children, function(li){ return track.scrollLeft + li.getBoundingClientRect().left - base; });
  }
  // 元の並びが幅に収まるか。収まらないときだけ複製をつなぐ
  function fits(){
    var last = items[items.length - 1].getBoundingClientRect(), first = items[0].getBoundingClientRect();
    return last.right - first.left <= track.clientWidth - 2 * pad() + 1;
  }
  function loopWidth(){ return looped ? stops()[items.length] : 0; }
  function setLoop(on){
    if (on === looped) return;
    if (on) {
      items.forEach(function(li){
        var c = li.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        c.querySelectorAll('a').forEach(function(a){ a.tabIndex = -1; });
        track.appendChild(c);
      });
    } else {
      while (track.children.length > items.length) track.removeChild(track.lastChild);
      track.scrollLeft = 0;
    }
    looped = on;
    prev.hidden = next.hidden = !on;
  }
  // 複製側に入ったら、同じ見た目の元の側へ瞬時に戻す
  function wrap(){
    var w = loopWidth();
    if (w && track.scrollLeft >= w - 1) track.scrollLeft -= w;
  }
  function slideTo(left){
    cancelAnimationFrame(anim);
    if (still) { track.scrollLeft = left; wrap(); return; }
    var from = track.scrollLeft, d = left - from, t0 = null;
    track.style.scrollSnapType = 'none';
    function frame(t){
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / 450);
      track.scrollLeft = from + d * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      if (k < 1) { anim = requestAnimationFrame(frame); return; }
      wrap();
      track.style.scrollSnapType = '';
    }
    anim = requestAnimationFrame(frame);
  }
  function go(dir){
    var cur = track.scrollLeft, list = stops(), target = null;
    if (dir < 0 && cur < 4 && looped) { cur += loopWidth(); track.scrollLeft = cur; list = stops(); }
    if (dir > 0) { for (var i = 0; i < list.length; i++) if (list[i] > cur + 4) { target = list[i]; break; } }
    else { for (var j = list.length - 1; j >= 0; j--) if (list[j] < cur - 4) { target = list[j]; break; } }
    if (target === null) return;
    slideTo(Math.min(target, track.scrollWidth - track.clientWidth));
  }
  function stop(){ stopped = true; }
  setInterval(function(){
    if (stopped || hover || !visible || document.hidden || !looped) return;
    go(1);
  }, 4000);
  ['pointerdown', 'wheel', 'touchstart', 'keydown', 'focusin'].forEach(function(t){ root.addEventListener(t, stop, { passive: true }); });
  root.addEventListener('mouseenter', function(){ hover = true; });
  root.addEventListener('mouseleave', function(){ hover = false; });
  prev.addEventListener('click', function(){ go(-1); });
  next.addEventListener('click', function(){ go(1); });
  // 人が指で複製側までスクロールしたときも、止まったところで元の側へ戻す
  var idle;
  track.addEventListener('scroll', function(){ clearTimeout(idle); idle = setTimeout(function(){ if (!track.style.scrollSnapType) wrap(); }, 150); }, { passive: true });
  addEventListener('resize', function(){ setLoop(!fits()); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function(es){ visible = es[0].isIntersecting; }).observe(track);
  setLoop(!fits());
})();
</script>`

export function renderListPage(events: EventWithLotteries[], now: Date, canonical: string): string {
  const body =
    events.length > 0
      ? `<div class="cards">\n${groupConsecutive(events).map((g) => renderEventCard(g, now)).join('\n')}\n</div>`
      : '<p class="none">今後の公演情報はまだありません。</p>'
  const head = buildHeadMeta({
    title: 'サンドーム福井ライブ情報｜コンサート・チケット抽選・先行',
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
${SALE_SCRIPT}
</body>
</html>`
}
