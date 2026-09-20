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
  it('過去の公演だけを年ごとに新しい順で出し、抽選は件数だけ。トップと sitemap からリンクされる', async () => {
    const res = await SELF.fetch('https://example.com/past')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('先月のバンド')
    expect(html).toContain('去年のバンド')
    expect(html).not.toContain('来月のバンド')
    // 年見出しは新しい年が先
    expect(html.indexOf(`${p2.slice(0, 4)}年`)).toBeLessThan(html.indexOf(`${p1.slice(0, 4)}年`))
    // 連日は 1 枚、抽選は件数リンク
    expect(html.match(/<article class="card/g)?.length).toBe(2)
    expect(html).toContain(`<a href="/e/ev-${p2}">先行・抽選 1 件の記録</a>`)
    expect(html).not.toContain('終わった先行')

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
