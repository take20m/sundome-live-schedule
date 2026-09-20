import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { applySchema } from './helpers'

// 収集データ(Web由来)に悪意ある文字列が混ざっても XSS にならないことの回帰テスト
beforeAll(async () => {
  await applySchema(env.DB)
  const day = 24 * 60 * 60 * 1000
  const date = new Date(Date.now() + 10 * day).toISOString().slice(0, 10)
  await env.DB.prepare(
    `INSERT INTO events (id, title, artist, date, source_url, confidence, updated_at)
     VALUES (?, ?, ?, ?, ?, 'inferred', ?)`,
  )
    .bind(
      `ev-${date}`,
      '</script><script>alert(1)</script>',
      '"><img src=x onerror=alert(2)>',
      date,
      'https://example.com/x',
      new Date().toISOString(),
    )
    .run()
})

describe('XSS耐性', () => {
  it('一覧ページで悪意あるタイトル/アーティスト名が無害化される', async () => {
    const html = await (await SELF.fetch('https://example.com/')).text()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('"><img src=x')
    // JSON-LD内は < 形式にエスケープされている
    expect(html).toContain('\\u003c')
  })

  it('metaタグでも無害化される(生タグが存在しない)', async () => {
    const html = await (await SELF.fetch('https://example.com/')).text()
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>alert(1)')
    // 属性値の脱出("> でタグを閉じる)が起きていない
    expect(html).not.toContain('"><img')
  })
})

describe('URL スキームの防御(描画側)', () => {
  it('DB に javascript: スキームの URL が入っていても href / src に出さない', async () => {
    const day = 24 * 60 * 60 * 1000
    const date = new Date(Date.now() + 11 * day).toISOString().slice(0, 10)
    await env.DB.prepare(
      `INSERT INTO events (id, title, artist, date, source_url, artist_url, tour_url, image_url, confidence, updated_at)
       VALUES (?, 'SCHEME TEST', 'スキーム検証', ?, 'javascript:alert(3)', 'javascript:alert(4)', 'javascript:alert(5)', 'javascript:alert(6)', 'inferred', ?)`,
    )
      .bind(`ev-${date}`, date, new Date().toISOString())
      .run()
    const top = await (await SELF.fetch('https://example.com/')).text()
    const detail = await (await SELF.fetch(`https://example.com/e/ev-${date}`)).text()
    for (const html of [top, detail]) {
      expect(html).not.toMatch(/(href|src)="javascript:/)
    }
    // リンク自体が出ない(公式サイト・コンサート情報・画像)
    expect(detail).not.toContain('公式サイト')
    expect(detail).not.toContain('>コンサート情報')
    // CSS にはクラス名が残るので、要素として出ていないことを見る
    expect(detail).not.toContain('class="card-media"')
  })
})
