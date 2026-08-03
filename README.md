# sundome-live-schedule

サンドーム福井のライブ開催予定とチケット抽選期間を、Claude Code(`claude -p`)で毎晩自動収集して表示するサイト。

- 📄 仕様: [SPEC.md](./SPEC.md)
- 🏗️ 構成: GitHub Actions(収集) + Cloudflare Workers / D1(配信)

## 機能

| パス | 内容 |
|---|---|
| `/` | 公演一覧(開催日順、抽選受付中を強調、締切カウントダウン、推定情報にはバッジ) |
| `/feed.xml` | 新規公演・抽選情報の更新RSS |
| `POST /api/ingest` | 収集パイプラインからの取り込み(Bearer認証) |

## 仕組み

```
GitHub Actions (毎晩 JST 3:30)
  └─ claude -p collector/prompt.md   ← Claudeプランの利用枠で動く(API従量課金なし)
       ①会場公式カレンダーから公演を確定(confidence: official)
       ②公演ごとにアーティスト公式/チケットサイトを逆引きして抽選期間を抽出
       ③会場未掲載のツアー発表も検索して先行キャッチ(confidence: inferred)
       → collector/out/events.json(JSON Schema検証)
  └─ node collector/validate.mjs → POST /api/ingest
       → D1にupsert、内容ハッシュで差分検知、変更分だけRSSへ
       → ラチェット: nullで既知の値を上書きしない / official を格下げしない /
         期間付きの行は期間を取れている収集でしか削除されない
  └─ node collector/enrich.mjs(2段目)
       GET /api/missing で期間未確認の公演を取得し、
       欠けているアーティスト上位3組を1組ずつ集中 claude -p で深掘り → 再ingest
       (WebFetchブロック時は Wayback → 別ソースの順に迂回)
```

## 開発

```sh
npm install
npm test          # Vitest + Workers pool(Miniflare)
npm run typecheck
npm run dev       # wrangler dev
```

ローカルで ingest を試す場合は `.dev.vars` に `INGEST_TOKEN=...` を書く。

## デプロイ手順

```sh
# 1. D1作成(出力された database_id を wrangler.toml に反映)
wrangler d1 create sundome-reminder
wrangler d1 execute sundome-reminder --remote --file=schema.sql

# 2. シークレット設定
wrangler secret put INGEST_TOKEN   # ランダム文字列(openssl rand -hex 32 等)

# 3. デプロイ
wrangler deploy
```

### GitHub 側の設定

| 種別 | 名前 | 内容 |
|---|---|---|
| Secret | `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` で発行(Claudeプランで認証) |
| Secret | `INGEST_TOKEN` | wrangler secret と同じ値 |
| Variable | `INGEST_URL` | デプロイした Worker の URL |

設定後、Actions の `collect` workflow を手動実行(workflow_dispatch)して疎通確認。

## 収集を手元で試す

```sh
mkdir -p collector/out
claude -p "$(cat collector/prompt.md)" \
  --allowedTools "WebSearch,WebFetch,Edit(collector/out/**)" \
  --permission-mode acceptEdits \
  --max-turns 80
node collector/validate.mjs collector/out/events.json   # INGEST_URL未設定なら検証のみ
```

## ライセンス

[AGPL-3.0](./LICENSE)

## 注意

- 情報は自動収集(ベストエフォート)。`推定` バッジは会場公式で未確認の情報
- 収集は1日1回、1公演あたり検索2〜3回に制限(収集先への配慮)
