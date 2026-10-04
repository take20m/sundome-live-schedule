import { Hono } from 'hono'
import type { Context } from 'hono'
import { handleIngest } from './api/ingest'
import { handlePendingFocus, handlePendingImages, handleSetFocus, handleSetImages } from './api/images'
import { handleMissing } from './api/missing'
import { handleUnknownHosts } from './api/unknown-hosts'
import { buildRss } from './feeds/rss'
import { getEventRun, lastChangeByEvent, listAllEventIds, listEvents, listEventsByArtist, listPastEvents, listRecentChanges, todayInJst } from './lib/db'
import { artistDocNames, findArtistDoc, findGuideDoc, guideSlugs } from './lib/content'
import { groupRuns } from './lib/group'
import { FAVICON_SVG } from './lib/icon'
import { buildRobots, buildSitemap } from './lib/seo'
import { renderAboutPage } from './pages/about'
import { renderSubscribePage } from './pages/subscribe'
import { handleConfirm, handleSent, handleStop, handleStopPage, handleSubscribe, mailEnabled } from './api/subscribe'
import { runDigest } from './lib/digest'
import { pushEnabled, sendPushToAll } from './lib/push'
import { handlePushSubscribe, handlePushUnsubscribe } from './api/push'
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
/** プッシュ通知の公開鍵(鍵がそろっているときだけ。docs/web-push.md) */
const vapidOf = (env: Bindings) => (pushEnabled(env) ? env.VAPID_PUBLIC_KEY! : null)

app.get('/', async (c) => {
  const now = new Date()
  const events = await listEvents(c.env.DB, todayInJst(now))
  // 解説を書いたアーティストのページへ、トップから 1 回でたどれるようにする(検索エンジンの巡回の道を短く)
  // 表示名は解説の題の先頭(「藤井風 サンドーム福井公演…」→「藤井風」)。URL はデータ上の名前(Fujii Kaze)
  const artistDocs = artistDocNames().map((artist) => ({ artist, name: (findArtistDoc(artist)?.meta.title ?? artist).split(' ')[0] }))
  return c.html(renderListPage(events, now, siteUrl(c.req.url), { promo: mailEnabled(c.env), vapid: vapidOf(c.env), artistDocs }))
})

app.get('/e/:id', async (c) => {
  const id = c.req.param('id')
  if (!/^ev-\d{4}-\d{2}-\d{2}$/.test(id)) return c.notFound()
  const run = await getEventRun(c.env.DB, id)
  if (!run) return c.notFound()
  // 連日は 2 日目以降も 200 で残しつつ、canonical は初日に寄せる(内容が同じ URL が並ぶため)
  return c.html(
    renderDetailPage(run, new Date(), siteUrl(c.req.url, `/e/${run.group.first.id}`), { promo: mailEnabled(c.env), vapid: vapidOf(c.env) }),
  )
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

app.get('/about', (c) => c.html(renderAboutPage(siteUrl(c.req.url, '/about'), { mail: mailEnabled(c.env), push: pushEnabled(c.env) })))
app.get('/subscribe', (c) =>
  c.html(
    renderSubscribePage(siteUrl(c.req.url, '/subscribe'), {
      turnstileSiteKey: mailEnabled(c.env) ? c.env.TURNSTILE_SITE_KEY : null,
      mailError: c.req.query('e') ?? null,
      vapidPublicKey: vapidOf(c.env),
    }),
  ),
)
app.post('/api/subscribe', handleSubscribe)
app.post('/api/push/subscribe', handlePushSubscribe)
app.post('/api/push/unsubscribe', handlePushUnsubscribe)
// 登録済みの端末にテスト通知を送る(運用用: 通知が届くかの確認)。収集と同じトークンが要る
app.post('/api/push/test', async (c) => {
  if (!c.env.INGEST_TOKEN || c.req.header('authorization') !== `Bearer ${c.env.INGEST_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  return c.json(
    await sendPushToAll(c.env, { title: 'サンドーム福井ライブ情報', body: 'テスト通知です。届いていれば設定は完了しています。', url: siteUrl(c.req.url, '/subscribe') }),
  )
})
// まとめメールを今すぐ送る(運用用: 送り損ねた日のやり直しや、公開時の確認)。収集と同じトークンが要る
app.post('/api/digest', async (c) => {
  if (!c.env.INGEST_TOKEN || c.req.header('authorization') !== `Bearer ${c.env.INGEST_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  return c.json(await runDigest(c.env, siteUrl(c.req.url), new Date()))
})
app.get('/subscribe/sent', handleSent)
app.get('/subscribe/confirm', handleConfirm)
app.get('/subscribe/stop', handleStopPage)
app.post('/subscribe/stop', handleStop)

app.get('/feed.xml', async (c) => {
  const changes = await listRecentChanges(c.env.DB)
  return c.body(buildRss(changes, siteUrl(c.req.url)), 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8',
  })
})

// about と /subscribe の中身を最後に変えた日(変えたらここも直す)
const PAGE_UPDATED = { about: '2026-10-04', subscribe: '2026-10-04' }

app.get('/sitemap.xml', async (c) => {
  // 開催済みの公演ページは載せない(受付情報のない薄いページになるので noindex にしてある)。
  // 解説のあるアーティストページだけを載せるのも同じ理由。
  // 連日は初日だけ ─ 2 日目以降は canonical を初日に向けており、非正規 URL は sitemap に入れない
  const today = todayInJst(new Date())
  const runs = groupRuns(await listAllEventIds(c.env.DB))
  const { byEvent, latest } = await lastChangeByEvent(c.env.DB)
  const day = (iso: string | null | undefined) => (iso ? todayInJst(new Date(iso)) : null)
  const runLastmod = (run: { id: string }[]) => day(run.map(({ id }) => byEvent.get(id) ?? '').sort().pop() || null)
  const lastPast = runs.filter((r) => r[r.length - 1].date < today).map((r) => r[r.length - 1].date).sort().pop() ?? null
  return c.body(
    buildSitemap(siteUrl(c.req.url), [
      { path: '/', lastmod: day(latest) },
      { path: '/past', lastmod: lastPast },
      { path: '/about', lastmod: PAGE_UPDATED.about },
      { path: '/subscribe', lastmod: PAGE_UPDATED.subscribe },
      ...guideSlugs().map((s) => ({ path: `/guide/${s}`, lastmod: findGuideDoc(s)?.meta.updated ?? null })),
      ...artistDocNames().map((a) => ({ path: `/a/${encodeURIComponent(a)}`, lastmod: findArtistDoc(a)?.meta.updated ?? null })),
      ...runs.filter((run) => run[run.length - 1].date >= today).map((run) => ({ path: `/e/${run[0].id}`, lastmod: runLastmod(run) })),
    ]),
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

// 新着まとめメール(docs/email-digest.md)。wrangler.toml の Cron Trigger(12:00 JST)から呼ばれる
async function scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(
    runDigest(env, 'https://sundome.take20m.dev/', new Date()).then((r) => console.log('digest', JSON.stringify(r))),
  )
}

export default { fetch: app.fetch, scheduled }
