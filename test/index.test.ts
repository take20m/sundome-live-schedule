import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema } from './helpers'

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
