import { Hono } from 'hono'
import { handleIngest } from './api/ingest'
import { handlePendingImages, handleSetImages } from './api/images'
import { handleMissing } from './api/missing'
import { handleUnknownHosts } from './api/unknown-hosts'
import { buildRss } from './feeds/rss'
import { getEventRun, listAllEventIds, listEvents, listEventsByArtist, listPastEvents, listRecentChanges, todayInJst } from './lib/db'
import { artistDocNames, findArtistDoc, findGuideDoc, guideSlugs } from './lib/content'
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
  return c.html(renderDetailPage(run, new Date(), siteUrl(c.req.url, `/e/${id}`)))
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
  // 解説のあるアーティストページだけを載せるのも同じ理由
  const today = todayInJst(new Date())
  const ids = (await listAllEventIds(c.env.DB)).filter(({ date }) => date >= today)
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

app.get('/favicon.svg', (c) =>
  c.body(FAVICON_SVG, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=86400',
  }),
)

app.post('/api/ingest', handleIngest)
app.get('/api/missing', handleMissing)
app.get('/api/unknown-hosts', handleUnknownHosts)
app.get('/api/images/pending', handlePendingImages)
app.post('/api/images', handleSetImages)

export default app
