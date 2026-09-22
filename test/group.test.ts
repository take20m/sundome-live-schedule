import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import type { EventWithLotteries } from '../src/lib/db'
import { groupConsecutive, mergeLotteries, nextDay } from '../src/lib/group'
import { renderEventCard } from '../src/pages/list'
import { SITE_CSS } from '../src/pages/style'
import type { LotteryRow } from '../src/types'
import { applySchema } from './helpers'

function ev(date: string, artist = 'A', title = 'T', lotteries: LotteryRow[] = []): EventWithLotteries {
  return {
    id: `ev-${date}`, title, artist, date, open_time: null, start_time: null,
    source_url: null, artist_url: null, tour_url: null, image_url: null, confidence: 'official', updated_at: '', lotteries,
  }
}
function lot(event_id: string, name: string, starts_at: string | null, ends_at: string | null, url: string | null = null): LotteryRow {
  return { id: `${event_id}-${name}`, event_id, name, starts_at, ends_at, url, confidence: 'official', sold_out: 0, missed_count: 0, updated_at: '' }
}

describe('groupConsecutive', () => {
  it('同一アーティスト・同一タイトルで連続する日付は1グループ、離れた日・別タイトルは別', () => {
    const groups = groupConsecutive([
      ev('2026-10-04'), ev('2026-10-03'), // 順不同でも日付順に束ねる
      ev('2026-10-11', 'B', 'X'),
      ev('2026-11-13'), ev('2026-11-14'), ev('2026-11-16'), // 11/16 は 1 日空くので別
      ev('2026-12-01', 'A', '別ツアー'), ev('2026-12-02'),
    ])
    expect(groups.map((g) => g.events.map((e) => e.date))).toEqual([
      ['2026-10-03', '2026-10-04'],
      ['2026-10-11'],
      ['2026-11-13', '2026-11-14'],
      ['2026-11-16'],
      ['2026-12-01'],
      ['2026-12-02'],
    ])
  })

  it('月跨ぎ・年跨ぎの連日も束ねる。表記ゆれ(全角・空白)は同一視する', () => {
    expect(nextDay('2026-12-31')).toBe('2027-01-01')
    const groups = groupConsecutive([ev('2026-12-31', 'Ｍｒ．Ｃｈｉｌｄｒｅｎ', 'TOUR  2026'), ev('2027-01-01', 'Mr.Children', 'TOUR 2026')])
    expect(groups.length).toBe(1)
  })
})

describe('mergeLotteries', () => {
  it('名前+期間が同じ受付は1行に統合され、片日だけの受付は dates がその日だけになる', () => {
    const d1 = '2026-10-03', d2 = '2026-10-04'
    const [g] = groupConsecutive([
      ev(d1, 'A', 'T', [lot(`ev-${d1}`, 'オフィシャル先行', '2026-09-01T10:00:00+09:00', '2026-09-10T23:59:00+09:00', null)]),
      ev(d2, 'A', 'T', [
        lot(`ev-${d2}`, 'オフィシャル先行', '2026-09-01T10:00:00+09:00', '2026-09-10T23:59:00+09:00', 'https://eplus.jp/x/'),
        lot(`ev-${d2}`, '当日券', '2026-10-04T15:00:00+09:00', null),
      ]),
    ])
    const merged = mergeLotteries(g)
    expect(merged.map((m) => [m.name, m.dates])).toEqual([
      ['オフィシャル先行', [d1, d2]],
      ['当日券', [d2]],
    ])
    // URL は非 null を拾う
    expect(merged[0].url).toBe('https://eplus.jp/x/')
  })
})

describe('連日公演の表示', () => {
  const day = 24 * 60 * 60 * 1000
  const now = new Date()
  const d1 = new Date(now.getTime() + 30 * day).toISOString().slice(0, 10)
  const d2 = new Date(now.getTime() + 31 * day).toISOString().slice(0, 10)
  const d3 = new Date(now.getTime() + 40 * day).toISOString().slice(0, 10)
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`

  beforeAll(async () => {
    await applySchema(env.DB)
    const ins = env.DB.prepare(
      `INSERT INTO events (id, title, artist, date, open_time, start_time, artist_url, tour_url, confidence, updated_at)
       VALUES (?, 'TWO NIGHTS', '連日バンド', ?, ?, ?, 'https://example.com/', 'https://example.com/live/two', 'official', ?)`,
    )
    await ins.bind(`ev-${d1}`, d1, '17:00', '18:00', now.toISOString()).run()
    await ins.bind(`ev-${d2}`, d2, '16:00', '17:00', now.toISOString()).run()
    // 別タイトルの翌々週公演は束ねない
    await env.DB.prepare(
      `INSERT INTO events (id, title, artist, date, confidence, updated_at) VALUES (?, 'OTHER SHOW', '連日バンド', ?, 'official', ?)`,
    ).bind(`ev-${d3}`, d3, now.toISOString()).run()
    const starts = new Date(now.getTime() - 1 * day).toISOString()
    const ends = new Date(now.getTime() + 5 * day).toISOString()
    const lotIns = env.DB.prepare(
      `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, confidence, updated_at) VALUES (?, ?, ?, ?, ?, 'official', ?)`,
    )
    await lotIns.bind(`lot-${d1}-a`, `ev-${d1}`, 'オフィシャル先行', starts, ends, now.toISOString()).run()
    await lotIns.bind(`lot-${d2}-a`, `ev-${d2}`, 'オフィシャル先行', starts, ends, now.toISOString()).run()
    await lotIns.bind(`lot-${d2}-b`, `ev-${d2}`, '2日目限定当日券', null, ends, now.toISOString()).run()
  })

  it('一覧では連日公演が1枚のカードになり、日ごとの開場・開演と2日目のアンカーを持つ', async () => {
    const html = await (await SELF.fetch('https://example.com/')).text()
    const cards = html.split('今後の公演')[1]
    expect(cards.match(/<article class="card/g)?.length).toBe(2) // 連日で1枚 + 別タイトルで1枚
    expect(cards).toContain(`id="ev-${d1}"`)
    expect(cards).toContain(`<span class="anchor" id="ev-${d2}"></span>`)
    expect(cards).toContain('開場 17:00 / 開演 18:00')
    expect(cards).toContain('開場 16:00 / 開演 17:00')
    expect(cards).toContain(
      `<span class="tile-d range">${Number(d1.slice(8, 10))}<span class="sep">・</span>${Number(d2.slice(8, 10))}</span>`,
    )
    // 両日共通の受付は1行、片日だけの受付には注記
    expect(cards.match(/オフィシャル先行/g)?.length).toBe(1)
    expect(cards).toContain(`${md(d2)} のみ`)
  })

  it('2日目の URL でも連結カードを出し、その日を強調する。canonical と JSON-LD はその日のもの', async () => {
    const html = await (await SELF.fetch(`https://example.com/e/ev-${d2}`)).text()
    expect(html).toContain(`href="/#ev-${d2}"`)
    expect(html).toContain('開場 17:00 / 開演 18:00')
    expect(html).toMatch(new RegExp(`day day-focus">.*?${md(d2)}\\(.\\) 開場 16:00 / 開演 17:00`))
    expect(html).toContain('このページの公演日')
    expect(html).toContain(`<link rel="canonical" href="https://example.com/e/ev-${d2}">`)
    expect(html.match(/"@type":"MusicEvent"/g)?.length).toBe(1)
    expect(html).toContain(`"startDate":"${d2}T17:00:00+09:00"`)
    expect(html).toContain('href="https://example.com/live/two" rel="noopener" target="_blank">コンサート情報')
  })
})

describe('カードの当たり判定', () => {
  const now = new Date('2026-10-03T03:00:00Z')
  const card = (opts?: Parameters<typeof renderEventCard>[2]) => {
    const [g] = groupConsecutive([
      ev('2026-11-07', 'A', 'T', [
        lot('ev-2026-11-07', '一般発売', '2026-10-01T10:00:00+09:00', '2026-12-01T23:59:00+09:00', 'https://eplus.jp/x/'),
      ]),
    ])
    return renderEventCard(g, now, opts)
  }

  it('一覧とアーティストページでは card-main 全体が詳細への当たり判定になる', () => {
    const html = card()
    expect(html).toContain('<div class="card-main tap">')
    expect(html).toContain('<a href="/e/ev-2026-11-07">')
  })

  it('詳細ページと過去公演(compact)では広げない', () => {
    expect(card({ focusDate: '2026-11-07' })).toContain('<div class="card-main">')
    expect(card({ compact: true })).toContain('<div class="card-main">')
  })

  it('抽選リストは card-main の中にあるので、CSS で引き伸ばしたリンクより上に出す', () => {
    // マークアップ上 lots は card-body の中 = 当たり判定の下。この 1 行が消えると
    // 受付中の外部チケットリンクがオーバーレイに覆われて押せなくなる(ブラウザで実測して判明)
    expect(card()).toContain('<ul class="lots">')
    expect(SITE_CSS).toContain('.card-main.tap .lots { position: relative; z-index: 1;')
  })

  it('受付中の抽選は外部リンクのまま残る', () => {
    expect(card()).toContain('<a href="https://eplus.jp/x/" rel="noopener" target="_blank">')
  })
})

describe('日付タイル', () => {
  // JST 2026-10-03(土) 12:00。2026-10-03 が土曜、10-31 も土曜になる
  const now = new Date('2026-10-03T03:00:00Z')
  const tileOf = (dates: string[]) => {
    const [g] = groupConsecutive(dates.map((d) => ev(d)))
    const html = renderEventCard(g, now)
    return html.slice(html.indexOf('<div class="tile">'), html.indexOf('<div class="card-body">'))
  }

  it('連日2日は日も曜日も中黒でつなぐ', () => {
    const t = tileOf(['2026-11-07', '2026-11-08'])
    expect(t).toContain('<span class="tile-bar">2026.11</span>')
    expect(t).toContain('<span class="tile-d range">7<span class="sep">・</span>8</span>')
    expect(t).toContain('<span class="tile-w">土<span class="sep">・</span>日</span>')
  })

  it('単日は区切りを出さない', () => {
    const t = tileOf(['2026-11-07'])
    expect(t).toContain('<span class="tile-bar">2026.11</span>')
    expect(t).toContain('<span class="tile-d">7</span>')
    expect(t).toContain('<span class="tile-w">土</span>')
    expect(t).not.toContain('class="sep"')
    expect(t).not.toContain('class="sep-en"')
  })

  it('3日以上は中黒だと「7と9」に読めるので範囲の en dash に倒す', () => {
    const t = tileOf(['2026-11-07', '2026-11-08', '2026-11-09'])
    expect(t).toContain('<span class="tile-d range">7<span class="sep-en">–</span>9</span>')
    // 曜日も中日を畳む(土・日・月 は 72px / 60px の枠に収まらない)
    expect(t).toContain('<span class="tile-w">土<span class="sep-en">–</span>月</span>')
  })

  it('月またぎは帯だけ en dash、日は中黒のまま', () => {
    const t = tileOf(['2026-10-31', '2026-11-01'])
    expect(t).toContain('<span class="tile-bar">2026.10<span class="sep-en">–</span>11</span>')
    expect(t).toContain('<span class="tile-d range">31<span class="sep">・</span>1</span>')
    expect(t).toContain('<span class="tile-w">土<span class="sep">・</span>日</span>')
  })

  it('本日・明日・明後日は帯が告知に置き換わり、本日だけ紺になる', () => {
    expect(tileOf(['2026-10-03', '2026-10-04'])).toContain('<span class="tile-bar soon today">本日公演</span>')
    expect(tileOf(['2026-10-04'])).toContain('<span class="tile-bar soon">明日公演</span>')
    expect(tileOf(['2026-10-05'])).toContain('<span class="tile-bar soon">明後日公演</span>')
    // 通常の帯は年月のまま。today は本日以外には付かない
    expect(tileOf(['2026-11-07'])).toContain('<span class="tile-bar">2026.11</span>')
  })

  it('タイルは HTML を組み立てるので、日付が壊れていてもエスケープされる', () => {
    const t = tileOf(['2026-10-03"><script>alert(1)</script>'])
    expect(t).not.toContain('<script>')
    expect(t).toContain('&lt;script&gt;')
  })
})
