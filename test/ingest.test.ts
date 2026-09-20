import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema } from './helpers'

const payload = {
  events: [
    {
      title: 'TEST TOUR 2027 "FINAL"',
      artist: 'テストバンド',
      date: '2027-03-20',
      open_time: '16:00',
      start_time: '17:00',
      source_url: 'https://example.com/tour',
      confidence: 'official',
      lotteries: [
        {
          name: 'FC先行(抽選)',
          starts_at: '2027-01-10T10:00:00+09:00',
          ends_at: '2027-01-20T23:59:00+09:00',
          url: 'https://example.com/fc',
          confidence: 'inferred',
        },
      ],
    },
  ],
}

function post(body: unknown, token = 'test-token') {
  return SELF.fetch('https://example.com/api/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  await applySchema(env.DB)
})

describe('ingest API', () => {
  it('トークン無し/不一致は401', async () => {
    const res = await SELF.fetch('https://example.com/api/ingest', {
      method: 'POST',
      body: '{}',
    })
    expect(res.status).toBe(401)
    const res2 = await post(payload, 'wrong-token')
    expect(res2.status).toBe(401)
  })

  it('新規→added、同一再送→unchanged、変更→updated と差分検知される', async () => {
    // 1回目: added
    const res1 = await post(payload)
    expect(res1.status).toBe(200)
    const body1 = (await res1.json()) as Record<string, { added: number; updated: number; unchanged: number }>
    expect(body1.events.added).toBe(1)
    expect(body1.lotteries.added).toBe(1)

    // 2回目(同一): unchanged、changes は増えない
    const res2 = await post(payload)
    const body2 = (await res2.json()) as Record<string, { added: number; updated: number; unchanged: number }>
    expect(body2.events.unchanged).toBe(1)
    expect(body2.lotteries.unchanged).toBe(1)

    // 3回目(抽選期間が変わった): updated
    const modified = structuredClone(payload)
    modified.events[0].lotteries[0].ends_at = '2027-01-25T23:59:00+09:00'
    const res3 = await post(modified)
    const body3 = (await res3.json()) as Record<string, { added: number; updated: number; unchanged: number }>
    expect(body3.events.unchanged).toBe(1)
    expect(body3.lotteries.updated).toBe(1)

    // changes: 公演added + 抽選added = 2件。
    // 期間変更は updated として検知されるが(上の body3)、収集の揺れが大半なので通知しない
    const { results } = await env.DB.prepare(
      'SELECT change_kind FROM changes ORDER BY id',
    ).all<{ change_kind: string }>()
    expect(results.map((r) => r.change_kind)).toEqual(['added', 'added'])
  })

  it('公演時刻は判明時だけ通知し、その後の値の揺れでは通知しない', async () => {
    const countChanges = async () =>
      (await env.DB.prepare('SELECT count(*) AS n FROM changes').first<{ n: number }>())!.n
    const base = {
      title: 'TIME TOUR',
      artist: '時刻ゆらぎ',
      date: '2027-06-06',
      open_time: null,
      start_time: null,
      confidence: 'official',
      lotteries: [],
    }

    await post({ events: [base] })
    const afterNew = await countChanges()

    // 時刻が判明 → 知りたい情報なので通知する
    await post({ events: [{ ...base, open_time: '17:00', start_time: '18:00' }] })
    const afterKnown = await countChanges()
    expect(afterKnown).toBe(afterNew + 1)

    // 収集が同一ツアーの別公演日と取り違えた(値→値の変化) → 通知しない
    await post({ events: [{ ...base, open_time: '16:00', start_time: '17:00' }] })
    expect(await countChanges()).toBe(afterKnown)

    // 通知しないだけで、表示用の値はサイレントに最新へ更新される
    const ev = await env.DB.prepare(
      "SELECT open_time, start_time FROM events WHERE id = 'ev-2027-06-06'",
    ).first<{ open_time: string; start_time: string }>()
    expect(ev).toEqual({ open_time: '16:00', start_time: '17:00' })
  })

  it('抽選名の表記ゆれは同一IDに正規化され、改名時は古い方が置換される', async () => {
    const base = {
      title: 'DEDUP TOUR',
      artist: 'デデュープ',
      date: '2027-05-05',
      confidence: 'official',
      lotteries: [
        { name: 'LDH official mobile 先行', starts_at: null, ends_at: null, url: null, confidence: 'official' },
      ],
    }
    await post({ events: [base] })

    // 空白の有無だけ違う名前 → 同一IDとして扱われ、重複しない
    const spaced = structuredClone(base)
    spaced.lotteries[0].name = 'LDH  official mobile先行'
    await post({ events: [spaced] })
    let { results } = await env.DB.prepare("SELECT id FROM lotteries WHERE event_id = 'ev-2027-05-05'").all()
    expect(results.length).toBe(1)

    // 完全に別の名前に変わった → 新IDが追加。古いIDは1回目は残り(収集揺れ対策)、2回目で削除
    const renamed = structuredClone(base)
    renamed.lotteries[0].name = 'ファンクラブ第2弾先行'
    await post({ events: [renamed] })
    ;({ results } = await env.DB.prepare("SELECT id FROM lotteries WHERE event_id = 'ev-2027-05-05'").all())
    expect(results.length).toBe(2)
    await post({ events: [renamed] })
    ;({ results } = await env.DB.prepare("SELECT id FROM lotteries WHERE event_id = 'ev-2027-05-05'").all())
    expect(results.length).toBe(1)

    // 収集が空のときは削除しない(データ保全)
    const emptied = structuredClone(base)
    emptied.lotteries = []
    await post({ events: [emptied] })
    ;({ results } = await env.DB.prepare("SELECT id FROM lotteries WHERE event_id = 'ev-2027-05-05'").all())
    expect(results.length).toBe(1)
  })

  type TestPayloadEvent = {
    title: string
    artist: string
    date: string
    confidence: string
    lotteries: {
      name: string
      starts_at: string | null
      ends_at: string | null
      url: string | null
      confidence: string
    }[]
  }

  it('ラチェット: null の期間で既知の期間を上書きしない', async () => {
    const withPeriod: TestPayloadEvent = {
      title: 'RATCHET TOUR',
      artist: 'ラチェット',
      date: '2027-06-06',
      confidence: 'official',
      lotteries: [
        {
          name: 'FC先行',
          starts_at: '2027-04-01T10:00:00+09:00',
          ends_at: '2027-04-10T23:59:00+09:00',
          url: 'https://example.com/fc',
          confidence: 'official',
        },
      ],
    }
    await post({ events: [withPeriod] })

    // 同じ抽選が期間 null で再収集された(浅い収集) → 既知の期間を保持
    const shallow = structuredClone(withPeriod)
    shallow.lotteries[0].starts_at = null
    shallow.lotteries[0].ends_at = null
    shallow.lotteries[0].url = null
    shallow.lotteries[0].confidence = 'inferred'
    const res = await post({ events: [shallow] })
    const body = (await res.json()) as Record<string, { unchanged: number }>
    expect(body.lotteries.unchanged).toBe(1) // マージ後は同一内容なので unchanged

    const row = await env.DB.prepare(
      "SELECT starts_at, ends_at, url, confidence FROM lotteries WHERE event_id = 'ev-2027-06-06'",
    ).first<{ starts_at: string; ends_at: string; url: string; confidence: string }>()
    expect(row?.starts_at).toBe('2027-04-01T10:00:00+09:00')
    expect(row?.ends_at).toBe('2027-04-10T23:59:00+09:00')
    expect(row?.url).toBe('https://example.com/fc')
    expect(row?.confidence).toBe('official') // official は格下げされない
  })

  it('削除ガード: 期間なしの収集では期間付きの既存行を消さない', async () => {
    const withPeriod: TestPayloadEvent = {
      title: 'GUARD TOUR',
      artist: 'ガード',
      date: '2027-07-07',
      confidence: 'official',
      lotteries: [
        {
          name: '一次抽選受付',
          starts_at: '2027-05-01T10:00:00+09:00',
          ends_at: '2027-05-10T23:59:00+09:00',
          url: null,
          confidence: 'official',
        },
      ],
    }
    await post({ events: [withPeriod] })

    // 別名・期間なしの浅い収集 → 期間付きの既存行は保護され、新名も追加される
    const renamedShallow = structuredClone(withPeriod)
    renamedShallow.lotteries = [
      { name: '全ステイタス対象一次抽選受付', starts_at: null, ends_at: null, url: null, confidence: 'inferred' },
    ]
    await post({ events: [renamedShallow] })
    let { results } = await env.DB.prepare("SELECT id FROM lotteries WHERE event_id = 'ev-2027-07-07'").all()
    expect(results.length).toBe(2) // 保護: 期間付きが残る

    // 期間付きの収集が来たら置換の対象になる。ただし削除は2回連続で漏れてから
    const renamedWithPeriod = structuredClone(renamedShallow)
    renamedWithPeriod.lotteries[0].starts_at = '2027-05-01T10:00:00+09:00'
    renamedWithPeriod.lotteries[0].ends_at = '2027-05-10T23:59:00+09:00'
    await post({ events: [renamedWithPeriod] })
    await post({ events: [renamedWithPeriod] })
    ;({ results } = await env.DB.prepare("SELECT id FROM lotteries WHERE event_id = 'ev-2027-07-07'").all())
    expect(results.length).toBe(1)
  })

  it('通知ノイズ抑制: 改名・締切済み・複数公演日の重複はRSSに流れない', async () => {
    const day = 24 * 60 * 60 * 1000
    const future = (d: number) => new Date(Date.now() + d * day).toISOString()
    const past = (d: number) => new Date(Date.now() - d * day).toISOString()
    const mk = (date: string, lotteries: object[]) => ({
      title: 'NOISE TOUR',
      artist: 'ノイズ',
      date,
      confidence: 'official',
      lotteries,
    })
    const fc = { name: 'FC先行', starts_at: future(1), ends_at: future(10), url: null, confidence: 'official' }
    const ended = { name: '一次先行', starts_at: past(30), ends_at: past(20), url: null, confidence: 'official' }

    const before = await env.DB.prepare('SELECT count(*) AS n FROM changes').first<{ n: number }>()

    // 2公演日に同じ受付(未来)+締切済みの受付
    await post({ events: [mk('2027-09-09', [fc, ended]), mk('2027-09-10', [fc, ended])] })
    let after = await env.DB.prepare('SELECT count(*) AS n FROM changes').first<{ n: number }>()
    // 公演added×2(日付が違うので別サマリ) + FC先行added×1(同文は重複排除) = 3。締切済みは通知されない
    expect(after!.n - before!.n).toBe(3)

    // 同じ受付を改名して再送(期間一致) → ID引き継ぎで added も updated も出ない
    const renamed = structuredClone(fc)
    renamed.name = 'NOISE TOUR 2027 ファンクラブ先行'
    const res = await post({ events: [mk('2027-09-09', [renamed])] })
    const body = (await res.json()) as Record<string, { unchanged: number }>
    expect(body.lotteries.unchanged).toBe(1)
    after = await env.DB.prepare('SELECT count(*) AS n FROM changes').first<{ n: number }>()
    expect(after!.n - before!.n).toBe(3) // 増えていない

    // 名前は最新のものにサイレント更新されている
    const row = await env.DB.prepare(
      "SELECT name FROM lotteries WHERE event_id = 'ev-2027-09-09' AND starts_at IS NOT NULL AND ends_at > ?",
    )
      .bind(new Date().toISOString())
      .first<{ name: string }>()
    expect(row?.name).toBe('NOISE TOUR 2027 ファンクラブ先行')

    // 期間が全く不明の受付、過去公演の受付はどちらも通知されない(DBには入る)
    const yesterday = past(1).slice(0, 10)
    await post({
      events: [
        mk('2027-09-09', [{ name: '期間なし先行', starts_at: null, ends_at: null, url: null, confidence: 'inferred' }]),
        mk(yesterday, [{ name: '過去公演の先行', starts_at: future(1), ends_at: future(5), url: null, confidence: 'official' }]),
      ],
    })
    after = await env.DB.prepare('SELECT count(*) AS n FROM changes').first<{ n: number }>()
    expect(after!.n - before!.n).toBe(3) // 通知は増えない
    const stored = await env.DB.prepare(
      "SELECT count(*) AS n FROM lotteries WHERE name IN ('期間なし先行', '過去公演の先行')",
    ).first<{ n: number }>()
    expect(stored!.n).toBe(2) // 取り込みはされている
  })

  it('sold_out: 期間内でも売り切れとして表示され、フラグはtrue方向にのみ倒れる', async () => {
    const day = 24 * 60 * 60 * 1000
    const soldOutEvent = {
      title: 'SOLDOUT TOUR',
      artist: 'ソールド',
      date: '2027-10-10',
      confidence: 'official',
      lotteries: [
        {
          name: '一般発売(先着順)',
          starts_at: new Date(Date.now() - 10 * day).toISOString(),
          ends_at: null,
          url: null,
          confidence: 'official',
          sold_out: true,
        },
      ],
    }
    await post({ events: [soldOutEvent] })

    // 一覧で「売り切れ」バッジ、受付中扱いにならない
    const html = await (await SELF.fetch('https://example.com/')).text()
    expect(html).toContain('売り切れ')

    // 浅い収集(sold_out欠落)で再送してもフラグは維持される
    const shallow = structuredClone(soldOutEvent)
    delete (shallow.lotteries[0] as Record<string, unknown>).sold_out
    await post({ events: [shallow] })
    const row = await env.DB.prepare(
      "SELECT sold_out FROM lotteries WHERE event_id = 'ev-2027-10-10'",
    ).first<{ sold_out: number }>()
    expect(row?.sold_out).toBe(1)
  })

  it('ハッシュ仕様が変わった行は通知しない(材料変更による一斉誤通知の防止)', async () => {
    const day = 24 * 60 * 60 * 1000
    const ev = {
      title: 'HASHVER TOUR',
      artist: 'ハッシュ',
      date: '2027-11-11',
      confidence: 'official',
      lotteries: [
        {
          name: 'FC先行',
          starts_at: new Date(Date.now() + 1 * day).toISOString(),
          ends_at: new Date(Date.now() + 9 * day).toISOString(),
          url: null,
          confidence: 'official',
        },
      ],
    }
    await post({ events: [ev] })
    const before = await env.DB.prepare('SELECT count(*) AS n FROM changes').first<{ n: number }>()

    // 旧バージョンのハッシュに書き換える(ハッシュ材料を変えた直後と同じ状況を再現)
    await env.DB.prepare(
      "UPDATE snapshots SET hash = 'v1:stale' WHERE item_id LIKE 'lot-ev-2027-11-11-%' OR item_id = 'ev-2027-11-11'",
    ).run()

    // 同じ内容を再送 → 差分あり判定になるが、バージョン移行なので通知されない
    await post({ events: [ev] })
    const after = await env.DB.prepare('SELECT count(*) AS n FROM changes').first<{ n: number }>()
    expect(after!.n).toBe(before!.n)

    // snapshots は新バージョンに更新済み → 次回以降は通常判定に戻る
    const snap = await env.DB.prepare(
      "SELECT hash FROM snapshots WHERE item_id = 'ev-2027-11-11'",
    ).first<{ hash: string }>()
    expect(snap?.hash.startsWith('v1:')).toBe(false)
  })

  it('1回の収集漏れでは受付を消さず、2回連続で漏れたら削除。復活時に誤通知しない', async () => {
    const day = 24 * 60 * 60 * 1000
    const other = { name: '別の先行', starts_at: new Date(Date.now() + 2 * day).toISOString(), ends_at: new Date(Date.now() + 8 * day).toISOString(), url: null, confidence: 'official' }
    const flaky = { name: 'ゆらぎ先行', starts_at: new Date(Date.now() + 3 * day).toISOString(), ends_at: new Date(Date.now() + 9 * day).toISOString(), url: null, confidence: 'official' }
    const mk = (lotteries: object[]) => ({
      title: 'FLAKY TOUR', artist: 'ゆらぎ', date: '2027-12-25', confidence: 'official', lotteries,
    })

    await post({ events: [mk([other, flaky])] })
    const baseline = await env.DB.prepare('SELECT count(*) AS n FROM changes').first<{ n: number }>()

    // 1回目の見落とし → 消えずに残る(表示が1晩だけ欠けるのを防ぐ)
    await post({ events: [mk([other])] })
    let rows = await env.DB.prepare(
      "SELECT missed_count FROM lotteries WHERE event_id = 'ev-2027-12-25' AND name = 'ゆらぎ先行'",
    ).all<{ missed_count: number }>()
    expect(rows.results.length).toBe(1)
    expect(rows.results[0].missed_count).toBe(1)

    // 2回連続の見落とし → 削除される
    await post({ events: [mk([other])] })
    rows = await env.DB.prepare(
      "SELECT missed_count FROM lotteries WHERE event_id = 'ev-2027-12-25' AND name = 'ゆらぎ先行'",
    ).all<{ missed_count: number }>()
    expect(rows.results.length).toBe(0)

    // 後日また収集で見つかっても、内容が同じなら通知は増えない
    const before = await env.DB.prepare('SELECT count(*) AS n FROM changes').first<{ n: number }>()
    await post({ events: [mk([other, flaky])] })
    const after = await env.DB.prepare('SELECT count(*) AS n FROM changes').first<{ n: number }>()
    expect(after!.n).toBe(before!.n)
    expect(after!.n).toBeGreaterThan(baseline!.n - 1) // 初回のadded通知は出ている
  })

  // 収集AIが申込先として転売サイトやまとめ記事を拾ってくることへの防御
  it('転売・まとめサイトのURLは記録せず skipped に載る', async () => {
    const day = 24 * 60 * 60 * 1000
    const period = {
      starts_at: new Date(Date.now() + 1 * day).toISOString(),
      ends_at: new Date(Date.now() + 9 * day).toISOString(),
    }
    const res = await post({
      events: [
        {
          title: 'DENY TOUR',
          artist: '転売よけ',
          date: '2027-08-18',
          source_url: 'https://ticket-festa.com/music/jpop/1',
          confidence: 'official',
          lotteries: [
            { name: 'まとめ記事が申込先', ...period, url: 'https://ticketjam.jp/magazine/x', confidence: 'inferred' },
            { name: '公式告知が申込先', ...period, url: 'https://sakanaction.jp/feature/x', confidence: 'official' },
          ],
        },
      ],
    })
    const body = (await res.json()) as { skipped: string[] }
    // source_url と lotteries[0].url の2件
    expect(body.skipped.length).toBe(2)
    expect(body.skipped.join('\n')).toContain('ticketjam.jp')

    const ev = await env.DB.prepare(
      "SELECT source_url FROM events WHERE id = 'ev-2027-08-18'",
    ).first<{ source_url: string | null }>()
    expect(ev?.source_url).toBe(null)

    const { results } = await env.DB.prepare(
      "SELECT name, url FROM lotteries WHERE event_id = 'ev-2027-08-18'",
    ).all<{ name: string; url: string | null }>()
    const byName = new Map(results.map((r) => [r.name, r.url]))
    // 公式の告知ページは情報として残し、転売サイトだけ捨てる
    expect(byName.get('まとめ記事が申込先')).toBe(null)
    expect(byName.get('公式告知が申込先')).toBe('https://sakanaction.jp/feature/x')
  })

  it('既にDBに入っている転売サイトのURLは次回の収集で消える', async () => {
    const day = 24 * 60 * 60 * 1000
    const period = {
      starts_at: new Date(Date.now() + 2 * day).toISOString(),
      ends_at: new Date(Date.now() + 8 * day).toISOString(),
    }
    const ev = {
      title: 'LEGACY TOUR',
      artist: '過去データ',
      date: '2027-08-19',
      confidence: 'official',
      lotteries: [{ name: '先行', ...period, url: 'https://eplus.jp/legacy/tour/', confidence: 'official' }],
    }
    await post({ events: [ev] })

    // ブロック導入前に保存された状態を再現する
    await env.DB.prepare(
      "UPDATE lotteries SET url = 'https://ticketjam.jp/magazine/old' WHERE event_id = 'ev-2027-08-19'",
    ).run()
    await env.DB.prepare(
      "UPDATE events SET source_url = 'https://ticketjam.jp/magazine/old' WHERE id = 'ev-2027-08-19'",
    ).run()

    // URLが取れなかった収集を再送 → ラチェットに守られず消える
    await post({
      events: [{ ...ev, lotteries: [{ ...ev.lotteries[0], url: null }] }],
    })
    const lot = await env.DB.prepare(
      "SELECT url FROM lotteries WHERE event_id = 'ev-2027-08-19'",
    ).first<{ url: string | null }>()
    expect(lot?.url).toBe(null)
    const evRow = await env.DB.prepare(
      "SELECT source_url FROM events WHERE id = 'ev-2027-08-19'",
    ).first<{ source_url: string | null }>()
    expect(evRow?.source_url).toBe(null)
  })

  describe('tour_url(アーティスト側のツアーページ)', () => {
    const base = {
      title: 'TOUR URL TOUR',
      artist: 'ツアーページ',
      confidence: 'official',
      lotteries: [],
    }

    it('公式サイトのツアーページは記録される', async () => {
      await post({
        events: [{ ...base, date: '2027-09-01', tour_url: 'https://example.com/live/tour2027' }],
      })
      const row = await env.DB.prepare("SELECT tour_url FROM events WHERE id = 'ev-2027-09-01'").first<{
        tour_url: string | null
      }>()
      expect(row?.tour_url).toBe('https://example.com/live/tour2027')
    })

    it.each([
      ['会場公式ページ', 'https://sundome.sankan.jp/eventinfo/mc/'],
      ['会場公式(別ドメイン)', 'https://www.sundome.jp/event/2027/'],
      ['サイトのトップページ', 'https://example.com/'],
      ['転売サイト', 'https://ticketjam.jp/magazine/x'],
    ])('%s は tour_url として捨てられ skipped に載る', async (_label, url) => {
      const res = await post({ events: [{ ...base, date: '2027-09-02', tour_url: url }] })
      const body = (await res.json()) as { skipped: string[] }
      expect(body.skipped.some((s) => s.includes('tour_url') && s.includes(url))).toBe(true)
      const row = await env.DB.prepare("SELECT tour_url FROM events WHERE id = 'ev-2027-09-02'").first<{
        tour_url: string | null
      }>()
      expect(row?.tour_url).toBe(null)
    })

    it('null の再送で既知の tour_url は消えない(ラチェット)。ただし会場ページが残っていれば消える', async () => {
      await post({
        events: [{ ...base, date: '2027-09-03', tour_url: 'https://example.com/live/tour2027' }],
      })
      await post({ events: [{ ...base, date: '2027-09-03', tour_url: null }] })
      const kept = await env.DB.prepare("SELECT tour_url FROM events WHERE id = 'ev-2027-09-03'").first<{
        tour_url: string | null
      }>()
      expect(kept?.tour_url).toBe('https://example.com/live/tour2027')

      // 検査導入前に会場ページが入ってしまった状態を再現 → 次の収集で消える
      await env.DB.prepare(
        "UPDATE events SET tour_url = 'https://sundome.sankan.jp/eventinfo/mc/' WHERE id = 'ev-2027-09-03'",
      ).run()
      await post({ events: [{ ...base, date: '2027-09-03', tour_url: null }] })
      const dropped = await env.DB.prepare("SELECT tour_url FROM events WHERE id = 'ev-2027-09-03'").first<{
        tour_url: string | null
      }>()
      expect(dropped?.tour_url).toBe(null)
    })
  })

  it('不正な日付の公演は破棄され skipped に載る', async () => {
    const res = await post({
      events: [
        { title: 'BAD', artist: 'X', date: '2027/04/01', confidence: 'official', lotteries: [] },
      ],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { events: { added: number }; skipped: string[] }
    expect(body.events.added).toBe(0)
    expect(body.skipped.length).toBe(1)
  })

  it('events 配列が無いボディは400', async () => {
    const res = await post({ foo: 1 })
    expect(res.status).toBe(400)
  })
})
