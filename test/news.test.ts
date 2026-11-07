import { describe, expect, it } from 'vitest'
import { parseNewsRss, renderNewsHints } from '../collector/news-feed.mjs'

const item = (title: string, source: string, pubDate: string) =>
  `<item><title>${title} - ${source}</title><link>https://news.google.com/rss/articles/x</link><pubDate>${pubDate}</pubDate><source url="https://example.com">${source}</source></item>`

describe('parseNewsRss', () => {
  it('見出しから末尾の配信元を外し、配信元と日時を別に持つ。実体参照も戻す', () => {
    const xml = `<rss><channel><title>"サンドーム福井" - Google ニュース</title>${item(
      'HANAがついにアリーナツアー開催、全国15カ所巡る（音楽ナタリー）',
      'Yahoo!ニュース',
      'Sat, 31 Oct 2026 13:30:00 GMT',
    )}${item('A &amp; B &lt;ツアー&gt;', '音楽ナタリー', 'not a date')}</channel></rss>`
    expect(parseNewsRss(xml)).toEqual([
      {
        title: 'HANAがついにアリーナツアー開催、全国15カ所巡る（音楽ナタリー）',
        source: 'Yahoo!ニュース',
        publishedAt: '2026-10-31T13:30:00.000Z',
      },
      { title: 'A & B <ツアー>', source: '音楽ナタリー', publishedAt: null },
    ])
  })

  it('item が無ければ空', () => {
    expect(parseNewsRss('<rss><channel></channel></rss>')).toEqual([])
  })
})

describe('renderNewsHints', () => {
  const a = { title: 'ツアー発表', source: '音楽ナタリー', publishedAt: '2026-10-31T15:30:00.000Z' }
  const b = { title: 'グルメ博', source: 'ふーぽ', publishedAt: '2026-11-04T01:00:00.000Z' }

  it('検索語ごとの重複を除き、新しい順に日本時間の日付を付ける', () => {
    expect(renderNewsHints([a, b, { ...a }], { days: 30, limit: 40 })).toBe(
      [
        '',
        '## 参考: 直近30日のニュース見出し',
        '',
        '本文に「サンドーム福井」を含む記事の見出し(Google ニュースの検索結果、新しい順)。手順3で使う。',
        '',
        '- 2026-11-04 グルメ博(ふーぽ)',
        '- 2026-11-01 ツアー発表(音楽ナタリー)',
        '',
      ].join('\n'),
    )
  })

  it('件数を絞る。見出しが無ければ空文字(指示に何も足さない)', () => {
    expect(renderNewsHints([a, b], { days: 30, limit: 1 })).toContain('- 2026-11-04 グルメ博')
    expect(renderNewsHints([a, b], { days: 30, limit: 1 })).not.toContain('ツアー発表')
    expect(renderNewsHints([], { days: 30, limit: 40 })).toBe('')
  })
})
