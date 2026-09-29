import { Hono } from 'hono'
import type { Context } from 'hono'
import { handleIngest } from './api/ingest'
import { handlePendingFocus, handlePendingImages, handleSetFocus, handleSetImages } from './api/images'
import { handleMissing } from './api/missing'
import { handleUnknownHosts } from './api/unknown-hosts'
import { buildRss } from './feeds/rss'
import { getEventRun, listAllEventIds, listEvents, listEventsByArtist, listPastEvents, listRecentChanges, todayInJst } from './lib/db'
import { artistDocNames, findArtistDoc, findGuideDoc, guideSlugs } from './lib/content'
import { groupRuns } from './lib/group'
import { FAVICON_SVG } from './lib/icon'
import { buildRobots, buildSitemap } from './lib/seo'
import { renderAboutPage } from './pages/about'
import { renderDetailPage } from './pages/detail'
import { renderListPage } from './pages/list'
import { renderPastPage } from './pages/past'
import { renderArtistPage } from './pages/artist'
import { renderGuidePage } from './pages/guide'
import type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

// HTML は表示のたびにサーバーへ確認させる(no-cache)。毎晩データが変わり、デプロイ後も
// iPhone の Safari が前のページを出し続けることがあったため。個別に Cache-Control を付けた応答はそのまま
app.use('*', async (c, next) => {
  await next()
  if (c.res.headers.get('content-type')?.startsWith('text/html') && !c.res.headers.has('cache-control')) {
    c.res.headers.set('Cache-Control', 'no-cache')
  }
})

const siteUrl = (reqUrl: string, path = '/') => new URL(path, reqUrl).toString()

app.get('/', async (c) => {
  const now = new Date()
  const events = await listEvents(c.env.DB, todayInJst(now))
  return c.html(renderListPage(events, now, siteUrl(c.req.url)))
})

app.get('/e/:id', async (c) => {
  const id = c.req.param('id')
  if (!/^ev-\d{4}-\d{2}-\d{2}$/.test(id)) return c.notFound()
  const run = await getEventRun(c.env.DB, id)
  if (!run) return c.notFound()
  // 連日は 2 日目以降も 200 で残しつつ、canonical は初日に寄せる(内容が同じ URL が並ぶため)
  return c.html(renderDetailPage(run, new Date(), siteUrl(c.req.url, `/e/${run.group.first.id}`)))
})

app.get('/past', async (c) => {
  const now = new Date()
  const events = await listPastEvents(c.env.DB, todayInJst(now))
  return c.html(renderPastPage(events, now, siteUrl(c.req.url, '/past'), c.req.query('y') ?? null))
})

app.get('/a/:name', async (c) => {
  const name = c.req.param('name')
  if (!name || name.length > 100) return c.notFound()
  const now = new Date()
  const events = await listEventsByArtist(c.env.DB, name)
  const doc = findArtistDoc(name)
  if (events.length === 0 && !doc) return c.notFound()
  return c.html(renderArtistPage(name, events, doc, now, siteUrl(c.req.url, `/a/${encodeURIComponent(name)}`)))
})

app.get('/guide/:slug', (c) => {
  const slug = c.req.param('slug')
  const doc = findGuideDoc(slug)
  if (!doc) return c.notFound()
  return c.html(renderGuidePage(doc, siteUrl(c.req.url, `/guide/${slug}`)))
})

app.get('/about', (c) => c.html(renderAboutPage(siteUrl(c.req.url, '/about'))))

app.get('/feed.xml', async (c) => {
  const changes = await listRecentChanges(c.env.DB)
  return c.body(buildRss(changes, siteUrl(c.req.url)), 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8',
  })
})

app.get('/sitemap.xml', async (c) => {
  // 開催済みの公演ページは載せない(受付情報のない薄いページになるので noindex にしてある)。
  // 解説のあるアーティストページだけを載せるのも同じ理由。
  // 連日は初日だけ ─ 2 日目以降は canonical を初日に向けており、非正規 URL は sitemap に入れない
  const today = todayInJst(new Date())
  const ids = groupRuns(await listAllEventIds(c.env.DB))
    .filter((run) => run[run.length - 1].date >= today)
    .map((run) => run[0])
  return c.body(
    buildSitemap(
      siteUrl(c.req.url),
      new Date().toISOString().slice(0, 10),
      [
        ...guideSlugs().map((s) => `/guide/${s}`),
        ...artistDocNames().map((a) => `/a/${encodeURIComponent(a)}`),
        ...ids.map(({ id }) => `/e/${id}`),
      ],
    ),
    200,
    { 'Content-Type': 'application/xml; charset=utf-8' },
  )
})

app.get('/robots.txt', (c) => c.text(buildRobots(siteUrl(c.req.url))))

// アイコンは 2026-09-20 に差し替えた。検索結果の favicon は URL 単位でキャッシュされるので、
// URL を /icon.svg に変えて取り直させる。旧 URL も同じ画像を返す
const serveIcon = (c: Context) =>
  c.body(FAVICON_SVG, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=86400',
  })
app.get('/icon.svg', serveIcon)
app.get('/favicon.svg', serveIcon)

app.post('/api/ingest', handleIngest)
app.get('/api/missing', handleMissing)
app.get('/api/unknown-hosts', handleUnknownHosts)
app.get('/api/images/pending', handlePendingImages)
app.post('/api/images', handleSetImages)
app.get('/api/images/focus-pending', handlePendingFocus)
app.post('/api/images/focus', handleSetFocus)

export default app
