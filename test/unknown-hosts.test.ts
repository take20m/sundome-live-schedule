import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema } from './helpers'

type Body = { hosts: { host: string; count: number; samples: string[]; lotteries: string[] }[] }

const day = 24 * 60 * 60 * 1000

function get(token?: string) {
  return SELF.fetch('https://example.com/api/unknown-hosts', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

// 未知ホストは「終了していない抽選」だけを対象にする(過去のノイズで新顔が埋没しないように)
const LOTTERIES = [
  { name: '受付中の未知ホスト', from: -1, to: 3, url: 'https://ticketjam.jp/magazine/music/131991' },
  { name: '受付前の未知ホスト', from: 5, to: 10, url: 'https://ticketjam.jp/magazine/music/999' },
  { name: '受付中の購入ページ', from: -1, to: 3, url: 'https://eplus.jp/known/tour/' },
  { name: '終了した未知ホスト', from: -10, to: -5, url: 'https://ticket-festa.com/old/article/' },
  { name: 'URLなし', from: -1, to: 3, url: null },
]

beforeAll(async () => {
  await applySchema(env.DB)
  const now = new Date()
  const nowIso = now.toISOString()
  const date = new Date(now.getTime() + 30 * day).toISOString().slice(0, 10)
  await env.DB.prepare(
    `INSERT INTO events (id, title, artist, date, confidence, updated_at)
     VALUES (?, 'HOST TEST TOUR', 'ホスト検証', ?, 'official', ?)`,
  )
    .bind(`ev-${date}`, date, nowIso)
    .run()
  for (const [i, l] of LOTTERIES.entries()) {
    await env.DB.prepare(
      `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, url, confidence, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'official', ?)`,
    )
      .bind(
        `lot-ev-${date}-host${i}`,
        `ev-${date}`,
        l.name,
        new Date(now.getTime() + l.from * day).toISOString(),
        new Date(now.getTime() + l.to * day).toISOString(),
        l.url,
        nowIso,
      )
      .run()
  }
})

describe('unknown-hosts API', () => {
  it('トークン無し/不一致は401', async () => {
    expect((await get()).status).toBe(401)
    expect((await get('wrong-token')).status).toBe(401)
  })

  it('購入ページと判定できないホストを出現回数つきで返す', async () => {
    const res = await get('test-token')
    expect(res.status).toBe(200)
    const { hosts } = await res.json<Body>()
    const jam = hosts.find((h) => h.host === 'ticketjam.jp')
    expect(jam).toBeDefined()
    // 受付中と受付前の2件
    expect(jam!.count).toBe(2)
    expect(jam!.samples).toContain('https://ticketjam.jp/magazine/music/131991')
    expect(jam!.lotteries).toContain('ホスト検証 / 受付中の未知ホスト')
  })

  it('購入ページと判定できるホストは含まない', async () => {
    const { hosts } = await (await get('test-token')).json<Body>()
    expect(hosts.map((h) => h.host)).not.toContain('eplus.jp')
  })

  it('終了した抽選とURLなしは含まない', async () => {
    const { hosts } = await (await get('test-token')).json<Body>()
    expect(hosts.map((h) => h.host)).not.toContain('ticket-festa.com')
    expect(hosts.every((h) => h.samples.length > 0)).toBe(true)
  })
})
