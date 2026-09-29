#!/usr/bin/env node
// 一覧の正方形サムネに切り出す中心(CSS object-position)を、画像を見て決める(4段目)。
// 切り出し位置が未設定の画像だけが対象なので、人が決めた位置は上書きしない。
// 画像はこのジョブの間だけ一時フォルダに置き、判断が済んだら消す(サイトには保存しない。位置だけを送る)。
// 使い方: INGEST_URL=... INGEST_TOKEN=... node collector/focus-images.mjs [maxImages]
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ingestUrl = process.env.INGEST_URL
const ingestToken = process.env.INGEST_TOKEN
const maxImages = Number(process.argv[2] ?? 10)
const USER_AGENT = 'sundome-live-schedule/1.0 (+https://sundome.take20m.dev/about)'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const FOCUS_RE = /^(100|[1-9]?\d)% (100|[1-9]?\d)%$/
// claude -p に読ませてよいのはこのフォルダだけ(Read の許可範囲)
const TMP_DIR = 'collector/.focus-tmp'
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

if (!ingestUrl || !ingestToken) {
  console.error('focus-images: INGEST_URL / INGEST_TOKEN が必要')
  process.exit(1)
}
const auth = { authorization: `Bearer ${ingestToken}` }

const pending = await fetch(new URL('/api/images/focus-pending', ingestUrl), { headers: auth })
if (!pending.ok) {
  console.error(`focus-images: /api/images/focus-pending がエラー: ${pending.status}`)
  process.exit(1)
}
const { images } = await pending.json()
if (images.length === 0) {
  console.log('focus-images: 切り出し位置が未設定の画像なし。スキップ')
  process.exit(0)
}
console.log(`focus-images: 対象 ${Math.min(images.length, maxImages)} / ${images.length} 枚`)

const prompt = (file, artist, title) => `次の画像は、コンサート「${artist}「${title}」」のツアービジュアルです: ${file}
この画像を Read で開いて見てください。

この画像を、一覧に置く正方形のサムネイルにします(CSS の object-fit: cover で正方形に切り抜く)。
正方形に切り抜いたときに、次の優先順で大事なものが残るよう、切り抜きの中心を決めてください。
1. ツアー名・公演名・ロゴなどの文字(読める部分が最も多く残る位置)
2. 人物の顔(切れないように)
3. 画像の主役になっている図柄

答えは CSS の object-position の値として「横% 縦%」の形で 1 行だけ出力してください(0%=左端/上端、50%=中央、100%=右端/下端)。
画像が正方形に近く、どこを中心にしても差がないなら「50% 50%」にしてください。
例: 50% 30%
説明や他の文字は書かないでください。`

mkdirSync(TMP_DIR, { recursive: true })
const results = []
try {
  for (const img of images.slice(0, maxImages)) {
    const label = `${img.artist}「${img.title}」`
    try {
      const res = await fetch(img.image_url, {
        headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      })
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
      if (!res.ok || !EXT[type]) {
        console.log(`  skip ${label}: HTTP ${res.status} ${type}`)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_IMAGE_BYTES) {
        console.log(`  skip ${label}: 画像が大きすぎる(${buf.length}B)`)
        continue
      }
      const file = join(TMP_DIR, `image.${EXT[type]}`)
      writeFileSync(file, buf)
      const out = execFileSync(
        'claude',
        ['-p', prompt(file, img.artist, img.title), '--allowedTools', `Read(${TMP_DIR}/**)`, '--max-turns', '4', '--output-format', 'text'],
        { encoding: 'utf8', timeout: 180_000 },
      )
      rmSync(file, { force: true })
      const focus = out.trim().split('\n').map((l) => l.trim()).reverse().find((l) => FOCUS_RE.test(l))
      if (!focus) {
        console.log(`  skip ${label}: 位置を読み取れない(${out.trim().slice(0, 80)})`)
        continue
      }
      results.push({ image_url: img.image_url, focus })
      console.log(`  ok   ${label}: ${focus}`)
    } catch (err) {
      console.log(`  skip ${label}: ${err.message.split('\n')[0]}`)
    }
  }
} finally {
  // 画像はサイトに保存しない。判断が済んだら必ず消す
  rmSync(TMP_DIR, { recursive: true, force: true })
}

if (results.length === 0) {
  console.log('focus-images: 決められた位置なし')
  process.exit(0)
}
const post = await fetch(new URL('/api/images/focus', ingestUrl), {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ focus: results }),
})
const body = await post.text()
if (!post.ok) {
  console.error(`focus-images: /api/images/focus がエラー: ${post.status} ${body}`)
  process.exit(1)
}
console.log(`focus-images: 保存 ${body}`)
