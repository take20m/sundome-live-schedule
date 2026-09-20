import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema, seedSample } from './helpers'

beforeAll(async () => {
  await applySchema(env.DB)
})

describe('routing skeleton', () => {
  it('GET / はデータが空でも200を返す', async () => {
    const res = await SELF.fetch('https://example.com/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('今後の公演情報はまだありません')
  })

  it('POST /api/ingest は認証必須', async () => {
    const res = await SELF.fetch('https://example.com/api/ingest', { method: 'POST' })
    expect(res.status).toBe(401)
  })
})

describe('detail page', () => {
  it('「← 公演一覧」は一覧のその公演カードの位置(/#ev-...)に戻る', async () => {
    const now = new Date()
    await seedSample(env.DB, now)
    const eventDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const res = await SELF.fetch(`https://example.com/e/ev-${eventDate}`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(`<a href="/#ev-${eventDate}">← 公演一覧</a>`)
  })
})
