#!/usr/bin/env node
// 一覧の正方形サムネの見せ方(切るか縮めて収めるか・中心・余白の色・拡大率)を、画像を見て決める(4段目)。
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

この画像を、一覧に置く小さな正方形のサムネイル(約 90px 四方)にします。見せ方を決めてください。

- fit: "cover" か "contain"
  - "cover": 正方形いっぱいに拡大し、はみ出た部分を切る。写真・イラストなど、切っても主役が残る画像向け
  - "contain": 切らずに全体を縮めて正方形に収め、余白を bg の色で埋める。
    無地(白・黒など)の背景に横長の文字ロゴが載っているだけの画像向け(cover だと文字が途中で切れるため)
- focus: CSS の object-position の値「横% 縦%」(0%=左端/上端、50%=中央、100%=右端/下端)。
  cover では切り抜きの中心、zoom では拡大の中心になる。
  残す優先順: 1) ツアー名・ロゴなどの文字(読める部分が最も多く残る位置) 2) 人物の顔 3) 主役の図柄
- bg: contain のときの余白の色。画像の背景(縁)の色を "#RRGGBB" で。cover なら null
- zoom: 1〜3 の拡大率。通常は 1。上下や左右に黒帯・白帯が入っている画像は、帯が枠の外に出る倍率にする。
  contain で文字ロゴの周りの余白が大きすぎる場合も、読みやすくなる程度に少し上げてよい

答えは次の形の JSON を 1 行だけ出力してください。説明や他の文字は書かないでください。
{"fit":"cover","focus":"50% 30%","bg":null,"zoom":1}`

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
        [
          '-p', prompt(file, img.artist, img.title),
          '--model', process.env.CLAUDE_MODEL ?? 'claude-opus-5-5',
          '--allowedTools', `Read(${TMP_DIR}/**)`,
          '--max-turns', '4',
          '--output-format', 'text',
        ],
        { encoding: 'utf8', timeout: 180_000 },
      )
      rmSync(file, { force: true })
      // 最後に出てきた JSON 1 行を採る。形が合わなければ見送り(翌晩また対象になる)
      let framing = null
      for (const line of out.trim().split('\n').reverse()) {
        const m = line.match(/\{.*\}/)
        if (!m) continue
        try {
          framing = JSON.parse(m[0])
          break
        } catch {}
      }
      if (!framing || !FOCUS_RE.test(framing.focus ?? '')) {
        console.log(`  skip ${label}: 見せ方を読み取れない(${out.trim().slice(0, 80)})`)
        continue
      }
      const { fit, focus, bg, zoom } = framing
      results.push({ image_url: img.image_url, focus, fit, bg, zoom })
      console.log(`  ok   ${label}: ${JSON.stringify({ fit, focus, bg, zoom })}`)
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
