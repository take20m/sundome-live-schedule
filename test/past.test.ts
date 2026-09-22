import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema } from './helpers'

const day = 24 * 60 * 60 * 1000
const now = new Date()
const dateAt = (n: number) => new Date(now.getTime() + n * day).toISOString().slice(0, 10)
const p1 = dateAt(-400) // 去年
const p2 = dateAt(-20)
const p3 = dateAt(-19) // p2 と連日
const f1 = dateAt(30)

beforeAll(async () => {
  await applySchema(env.DB)
  const ins = env.DB.prepare(
    `INSERT INTO events (id, title, artist, date, confidence, updated_at) VALUES (?, ?, ?, ?, 'official', ?)`,
  )
  await ins.bind(`ev-${p1}`, 'OLD TOUR', '去年のバンド', p1, now.toISOString()).run()
  await ins.bind(`ev-${p2}`, 'RECENT TOUR', '先月のバンド', p2, now.toISOString()).run()
  await ins.bind(`ev-${p3}`, 'RECENT TOUR', '先月のバンド', p3, now.toISOString()).run()
  await ins.bind(`ev-${f1}`, 'FUTURE TOUR', '来月のバンド', f1, now.toISOString()).run()
  await env.DB.prepare(
    `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, confidence, updated_at) VALUES (?, ?, ?, ?, ?, 'official', ?)`,
  )
    .bind(`lot-${p2}-a`, `ev-${p2}`, '終わった先行', dateAt(-60), dateAt(-50), now.toISOString())
    .run()
})

describe('過去の公演ページ', () => {
  it('年タブで切り替え、指定がなければ最新の年。抽選は件数だけ。トップと sitemap からリンクされる', async () => {
    const res = await SELF.fetch('https://example.com/past')
    expect(res.status).toBe(200)
    const html = await res.text()
    // 既定は最新の年だけ。タブには全部の年が新しい順で並ぶ
    expect(html).toContain('先月のバンド')
    expect(html).not.toContain('去年のバンド')
    expect(html).not.toContain('来月のバンド')
    expect(html).toContain(`<a class="chip chip-open" href="/past?y=${p2.slice(0, 4)}" aria-current="page">${p2.slice(0, 4)}年</a>`)
    expect(html).toContain(`<a class="chip" href="/past?y=${p1.slice(0, 4)}">${p1.slice(0, 4)}年</a>`)
    expect(html.indexOf(`/past?y=${p2.slice(0, 4)}`)).toBeLessThan(html.indexOf(`/past?y=${p1.slice(0, 4)}`))
    expect(html).toContain(`<title>${p2.slice(0, 4)}年の公演 | 過去の公演`)
    // 連日は 1 枚、抽選は件数リンク
    expect(html.match(/<article class="card/g)?.length).toBe(1)
    expect(html).toContain(`<a href="/e/ev-${p2}">先行・抽選 1 件の記録</a>`)
    expect(html).not.toContain('終わった先行')
    // 年を指定すればその年。知らない年は最新の年に倒す
    const old = await (await SELF.fetch(`https://example.com/past?y=${p1.slice(0, 4)}`)).text()
    expect(old).toContain('去年のバンド')
    expect(old).not.toContain('先月のバンド')
    const bogus = await (await SELF.fetch('https://example.com/past?y=1999')).text()
    expect(bogus).toContain('先月のバンド')
    // 開催済みの公演の詳細では「未収集」と言わない(もう収集しない)
    const detail = await (await SELF.fetch(`https://example.com/e/ev-${p1}`)).text()
    expect(detail).not.toContain('未収集')

    const top = await (await SELF.fetch('https://example.com/')).text()
    expect(top).toContain('href="/past"')
    expect(top).not.toContain('先月のバンド')
    const sitemap = await (await SELF.fetch('https://example.com/sitemap.xml')).text()
    expect(sitemap).toContain('/past</loc>')
  })
})

describe('過去公演の抽選は履歴として残す', () => {
  it('開催済みの公演では、収集に現れない抽選を2回見落としても削除しない', async () => {
    const post = () =>
      SELF.fetch('https://example.com/api/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
        body: JSON.stringify({
          events: [
            {
              title: 'RECENT TOUR',
              artist: '先月のバンド',
              date: p2,
              confidence: 'official',
              // 「終わった先行」は含まれない収集結果を3回送る
              lotteries: [{ name: '一般発売', starts_at: dateAt(-40), ends_at: dateAt(-30), url: null, confidence: 'official' }],
            },
          ],
        }),
      })
    for (let i = 0; i < 3; i++) expect((await post()).status).toBe(200)
    const { results } = await env.DB.prepare('SELECT name FROM lotteries WHERE event_id = ? ORDER BY name').bind(`ev-${p2}`).all<{ name: string }>()
    expect(results.map((r) => r.name)).toEqual(['一般発売', '終わった先行'])
  })
})
