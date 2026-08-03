# sundome-live-schedule

https://sundome.take20m.dev

サンドーム福井のライブ予定と、チケット先行・抽選の受付期間をまとめているサイトです。

FC先行に気づいたときには締切が昨日だった、というのを何度かやらかしたのが発端です。この手の情報は会場公式・アーティスト公式・ファンクラブ・プレイガイドにバラバラに散らばっていて人力で追うのはしんどいので、毎晩 Claude Code に調べさせて1ページにまとめることにしました。

## どう動いているか

収集の実体は、GitHub Actions で毎晩3時半に `claude -p` を実行しているだけです。調査の手順は [collector/prompt.md](./collector/prompt.md) に日本語で書いてあります。ざっくり言うと、会場公式カレンダーで公演を確定させたあと、公演ごとにチケット受付期間を検索で逆引きし、さらに会場にまだ載っていないツアー発表がないかも探します(こっちは「推定」フラグ付き)。

結果は JSON にして Worker の取り込みAPIに送り、Cloudflare D1 に保存します。表示側は Workers + Hono の小さな SSR で、公演一覧と RSS(`/feed.xml`)を返します。新規公演や抽選開始があった夜だけ RSS に流れるので、Slack の `/feed` に食わせておくと発表に気づけます。

取り込みでいちばん気を使っているのは「一度取れた情報を、後日の雑な収集結果で壊さない」ことです。LLM の出力は夜ごとに揺れるので、

- null で既存の値を上書きしない
- 会場公式で確認済みの情報を推定に格下げしない
- 受付期間まで取れている行は、期間を取れている収集結果からしか消せない

というルールで取り込みます。それでも期間が取れなかった公演は `/api/missing` に溜まり、翌晩アーティスト単位の深掘り調査がもう一周走ります。

ちなみに `claude -p` は Claude のサブスクリプションの範囲で動くので、LLM の API 代はかかっていません。収集は1日1回・検索回数も控えめにして、収集先に負荷をかけないようにしています。

## 手元で動かす

```sh
npm install
npm test        # Vitest + Miniflare
npm run dev     # wrangler dev
```

収集だけ試したいときは claude CLI から直接叩けます:

```sh
mkdir -p collector/out
claude -p "$(cat collector/prompt.md)" \
  --allowedTools "WebSearch,WebFetch,Edit(collector/out/**)" \
  --permission-mode acceptEdits \
  --max-turns 80
node collector/validate.mjs collector/out/events.json
```

`INGEST_URL` と `INGEST_TOKEN` を環境変数に入れておくと、検証後にそのまま取り込みAPIへ送信します。未設定なら検証だけで止まります。

## 自分の環境にデプロイする

Cloudflare のアカウントがあれば動きます。

```sh
wrangler d1 create sundome-reminder        # 出てきた database_id を wrangler.toml へ
wrangler d1 execute sundome-reminder --remote --file=schema.sql
wrangler secret put INGEST_TOKEN           # openssl rand -hex 32 あたりで
wrangler deploy
```

あとは GitHub リポジトリに Secrets として `CLAUDE_CODE_OAUTH_TOKEN`(`claude setup-token` で発行)と `INGEST_TOKEN`、Variables として `INGEST_URL`(デプロイした Worker のURL)を設定すれば、Actions の collect workflow が毎晩動きます。初回は workflow_dispatch で手動実行して確認するのがおすすめです。

## ライセンス

[AGPL-3.0](./LICENSE)
