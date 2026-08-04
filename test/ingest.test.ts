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

    // changes: 公演added + 抽選added + 抽選updated = 3件
    const { results } = await env.DB.prepare('SELECT * FROM changes ORDER BY id').all()
    expect(results.length).toBe(3)
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

    // 完全に別の名前に変わった → 新IDが追加され、古いIDは削除される(置換)
    const renamed = structuredClone(base)
    renamed.lotteries[0].name = 'ファンクラブ第2弾先行'
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

    // 期間付きの収集が来たら置換が働き、古い行は削除される
    const renamedWithPeriod = structuredClone(renamedShallow)
    renamedWithPeriod.lotteries[0].starts_at = '2027-05-01T10:00:00+09:00'
    renamedWithPeriod.lotteries[0].ends_at = '2027-05-10T23:59:00+09:00'
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

  it('sold_out: 期間内でも予定枚数終了として表示され、フラグはtrue方向にのみ倒れる', async () => {
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

    // 一覧で「予定枚数終了」バッジ、受付中扱いにならない
    const html = await (await SELF.fetch('https://example.com/')).text()
    expect(html).toContain('予定枚数終了')

    // 浅い収集(sold_out欠落)で再送してもフラグは維持される
    const shallow = structuredClone(soldOutEvent)
    delete (shallow.lotteries[0] as Record<string, unknown>).sold_out
    await post({ events: [shallow] })
    const row = await env.DB.prepare(
      "SELECT sold_out FROM lotteries WHERE event_id = 'ev-2027-10-10'",
    ).first<{ sold_out: number }>()
    expect(row?.sold_out).toBe(1)
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
