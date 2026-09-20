import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { isRestrictedLottery } from '../src/lib/audience'
import { applySchema, seedSample } from './helpers'

describe('isRestrictedLottery', () => {
  it.each([
    'FATHER&MOTHER会員先行',
    'Pontaパス会員先行',
    'EXILE TRIBE FC',
    'FANTASTICS OFFICIAL FAN CLUB',
    'FC「AIM」会員優先予約(抽選)',
    'AIMYON BEST ALBUM「唇を追え！」封入シリアル先行',
    'OFFICIAL FAN CLUB「Ringo Jam」年会員＋CD予約購入者限定 最速先行',
    'NF member深海限定抽選受付',
    'LDH official mobile 先行抽選予約①',
    'EXILE TRIBE CARD 先行抽選予約',
    'LDH LIVE SQUARE 先行抽選予約',
    'EXILE chプレミアム・EXILE ch',
  ])('資格限定: %s', (name) => {
    expect(isRestrictedLottery(name)).toBe(true)
  })

  it.each([
    '一般抽選受付',
    '一般発売',
    'オフィシャル先行',
    'オフィシャル2次先行',
    '最終抽選受付',
    'チケットぴあ先行',
    'ぴあ抽選先行',
    'プレリザーブ先行',
    'ticketbook先行申込',
    'ticketbook2次先行(先着)',
  ])('誰でも申込可: %s', (name) => {
    expect(isRestrictedLottery(name)).toBe(false)
  })
})

describe('販売中のチケット欄の対象', () => {
  beforeAll(async () => {
    await applySchema(env.DB)
    await seedSample(env.DB)
  })

  it('FC限定の受付は公演カードには出るが販売中欄には出ない', async () => {
    const day = 24 * 60 * 60 * 1000
    const now = new Date()
    const eventDate = new Date(now.getTime() + 30 * day).toISOString().slice(0, 10)
    await env.DB.prepare(
      `INSERT INTO lotteries (id, event_id, name, starts_at, ends_at, confidence, updated_at)
       VALUES (?, ?, 'FC会員限定先行(抽選)', ?, ?, 'official', ?)`,
    )
      .bind(
        `lot-ev-${eventDate}-fc000001`,
        `ev-${eventDate}`,
        new Date(now.getTime() - 1 * day).toISOString(),
        new Date(now.getTime() + 5 * day).toISOString(),
        now.toISOString(),
      )
      .run()

    const html = await (await SELF.fetch('https://example.com/')).text()
    const [, rest] = html.split('販売中のチケット')
    const [section, cards] = rest.split('今後の公演')
    expect(section).toContain('オフィシャル先行(抽選)')
    expect(section).not.toContain('FC会員限定先行(抽選)')
    expect(cards).toContain('FC会員限定先行(抽選)')
  })
})
