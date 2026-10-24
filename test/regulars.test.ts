import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema } from './helpers'

type Body = { artists: { artist: string; last_date: string; artist_url: string | null }[] }

const day = 24 * 60 * 60 * 1000
const dateFromNow = (days: number) => new Date(Date.now() + days * day).toISOString().slice(0, 10)

function get(token?: string) {
  return SELF.fetch('https://example.com/api/regulars', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

beforeAll(async () => {
  await applySchema(env.DB)
  const ins = env.DB.prepare(
    `INSERT INTO events (id, title, artist, date, artist_url, confidence, updated_at) VALUES (?, 'TOUR', ?, ?, ?, 'official', ?)`,
  )
  const now = new Date().toISOString()
  const rows: [string, number, string | null][] = [
    // 過去に来ていて、次の公演をまだ把握していない
    ['ミュージカル『束ね』', -700, 'https://example.com/musical/'],
    ['ミュージカル『束ね』', -300, 'https://example.com/musical/'],
    // 名義の表記ゆれ(公式サイトが同じ)は 1 組。表記は最近の公演のもの
    ['Kaze Example', -600, 'https://kaze.example.com/'],
    ['風 例', -100, 'https://www.kaze.example.com'],
    // 「from EXILE TRIBE」の有無だけ違う名義は同じ出演者。次の公演が分かっているので見回らない
    ['GENERATIONS from EXILE TRIBE', -200, null],
    ['GENERATIONS', 20, 'https://generations.example.com/'],
    // 次の公演だけが分かっている出演者も見回らない
    ['はじめて', 40, null],
  ]
  for (const [i, [artist, offset, url]] of rows.entries()) {
    await ins.bind(`ev-test-${i}`, artist, dateFromNow(offset), url, now).run()
  }
})

describe('GET /api/regulars', () => {
  it('トークンが要る', async () => {
    expect((await get()).status).toBe(401)
    expect((await get('wrong')).status).toBe(401)
  })

  it('過去に公演して、次の公演がまだ分かっていない出演者だけを、名義の表記ゆれを束ねて返す', async () => {
    const res = await get('test-token')
    expect(res.status).toBe(200)
    const { artists } = (await res.json()) as Body
    expect(artists).toEqual([
      { artist: 'ミュージカル『束ね』', last_date: dateFromNow(-300), artist_url: 'https://example.com/musical/' },
      { artist: '風 例', last_date: dateFromNow(-100), artist_url: 'https://www.kaze.example.com' },
    ])
  })
})
