import { Hono } from 'hono'
import { handleIngest } from './api/ingest'
import { handlePendingImages, handleSetImages } from './api/images'
import { handleMissing } from './api/missing'
import { handleUnknownHosts } from './api/unknown-hosts'
import { buildRss } from './feeds/rss'
import { getEventRun, listAllEventIds, listEvents, listPastEvents, listRecentChanges, todayInJst } from './lib/db'
import { FAVICON_SVG } from './lib/icon'
import { buildRobots, buildSitemap } from './lib/seo'
import { renderAboutPage } from './pages/about'
import { renderDetailPage } from './pages/detail'
import { renderListPage } from './pages/list'
import { renderPastPage } from './pages/past'
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
  return c.html(renderPastPage(events, now, siteUrl(c.req.url, '/past')))
})

app.get('/about', (c) => c.html(renderAboutPage(siteUrl(c.req.url, '/about'))))

app.get('/feed.xml', async (c) => {
  const changes = await listRecentChanges(c.env.DB)
  return c.body(buildRss(changes, siteUrl(c.req.url)), 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8',
  })
})

app.get('/sitemap.xml', async (c) => {
  const ids = await listAllEventIds(c.env.DB)
  return c.body(
    buildSitemap(
      siteUrl(c.req.url),
      new Date().toISOString().slice(0, 10),
      ids.map(({ id }) => `/e/${id}`),
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
