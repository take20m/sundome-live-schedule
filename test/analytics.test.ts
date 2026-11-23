import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema } from './helpers'

const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js'

beforeAll(async () => {
  await applySchema(env.DB)
})

describe('アクセス解析タグ', () => {
  it('HTML ページに Cloudflare Web Analytics のタグが1つだけ入る', async () => {
    for (const path of ['/', '/about', '/past']) {
      const res = await SELF.fetch(`https://example.com${path}`)
      expect(res.status, path).toBe(200)
      const html = await res.text()
      expect(html.split(BEACON).length - 1, path).toBe(1)
    }
  })

  it('プライバシーポリシーに解析の利用を書いている', async () => {
    const html = await (await SELF.fetch('https://example.com/about')).text()
    expect(html).toContain('Cloudflare Web Analytics')
  })
})
