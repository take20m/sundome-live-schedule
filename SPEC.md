# SPEC: sundome-live-schedule

サンドーム福井のライブ開催予定と、各公演のチケット抽選(申込)期間を自動収集して一覧表示するサイト。LT発表のデモを兼ねる。

## 受入条件(完了の定義)

1. 直近・今後の実公演が数件、正しい日付で一覧表示される
2. 少なくとも一部の公演に抽選期間が紐づいて表示され、受付中の公演が強調される
3. GitHub Actions の夜間 cron で自動更新が動いている
4. RSS フィード(`/feed.xml`)で新規公演・抽選開始が配信される

(改訂 2026-08-02: 当初あった ICS 購読とカレンダービューは「一覧+RSSのみ」の方針変更により削除)

## 非目標

- 抽選期間の完全網羅(ベストエフォート。全先行・全プレイガイドは追わない)
- 手動補正の管理画面
- チケット購入導線・リセール情報
- サンドーム福井以外の会場

## アーキテクチャ

```
[GitHub Actions (毎晩 cron)]
  claude -p(Claude Team プラン枠 / WebSearch・WebFetch 使用)
    ① 会場起点: サンドーム福井公式カレンダー等から公演リストを確定
    ② 逆引き: アーティスト公式/FC・チケットサイト(ぴあ/e+/ローチケ)を検索し
       抽選期間・先行受付情報を抽出(公式未掲載の先行情報も拾う)
    ③ JSON Schema でバリデーション済みの events.json を生成
  → Cloudflare D1 へ書き込み(Worker の管理 API をトークン認証で叩く)

[Cloudflare Workers + D1]
  - HTML 一覧ページ(開催日順・抽選受付中を強調・情報の信頼度バッジ)
  - GET /calendar.ics(公演日+抽選期間)
  - GET /feed.xml(新規公演・抽選開始の差分を RSS 配信)
  - Web Push(将来枠。まず RSS で更新通知を成立させる)
```

### 技術選定の背景

- `claude -p`(Claude Code ヘッドレス)は Claude.ai Team プランの利用枠内で動くため
  API 従量課金が発生しない。Anthropic API 直接呼び出し(従量課金)は採用しない。
- `claude -p` は CLI 実行環境が必要なため、収集は Cloudflare Workers ではなく
  GitHub Actions 上で行う。Workers は配信専用。

## データモデル(D1)

### events

| カラム | 型 | 説明 |
|---|---|---|
| id | TEXT PK | 公演の安定ID(`ev-<日付>`。単一ホール・1日1公演の前提で、LLM出力のアーティスト名表記ゆれによる重複を防ぐ) |
| title | TEXT | 公演名 |
| artist | TEXT | アーティスト名 |
| date | TEXT | 公演日(ISO 8601) |
| open_time / start_time | TEXT | 開場・開演(nullable) |
| source_url | TEXT | 情報源URL(会場公式の公演ページ等) |
| artist_url | TEXT | アーティスト公式サイトのトップ(nullable) |
| tour_url | TEXT | アーティスト側のその公演・ツアーのページ。詳細の「コンサート情報」の飛び先。無ければ source_url で代用(nullable) |
| confidence | TEXT | `official`(会場公式掲載) / `inferred`(逆引きのみ) |
| updated_at | TEXT | 最終更新日時 |

### lotteries

| カラム | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| event_id | TEXT FK | events.id |
| name | TEXT | FC先行 / プレリク先行 / 一般発売 等 |
| starts_at / ends_at | TEXT | 受付期間(ISO 8601) |
| url | TEXT | 申込ページURL |
| confidence | TEXT | `official` / `inferred` |

差分検知: 収集ごとにスナップショットのハッシュを保持し、変化があった項目のみ RSS に流す。

## 例外・境界

- LLM 抽出結果は JSON Schema で検証し、日付として不正なものは破棄(誤表示より欠落を優先)
- 会場公式に載っている公演は `official`、逆引きのみで見つけた公演は `inferred` として表示上区別
- 収集失敗時(claude -p のエラー、抽出0件など)は前回データを維持し、サイトは落とさない

## テスト方針

- 抽出プロンプトは固定入力(保存した HTML サンプル)でスナップショットテスト
- Worker は Vitest + Miniflare(@cloudflare/vitest-pool-workers)で ICS / RSS / 一覧のレスポンスを検証

## 運用・リスク

- `claude -p` の OAuth トークン(`claude setup-token` で発行)を GitHub Actions Secrets に保存。失効時は再発行
- Team プランの利用枠を夜間ジョブが消費する(1日1回・小規模なので影響は軽微な見込み)
- 収集は1日1回に留め、robots.txt を尊重する
- 完全自動運用(手動補正なし)。誤抽出リスクは confidence バッジと Schema 検証で緩和

## 受入レベル

LT デモが成立するレベル(直近・今後の実公演が数件正しく表示され、自動更新が動いていること)。
抽選期間の網羅性はベストエフォート。
