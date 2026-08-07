# LT スライド

Marp のデッキ。5分・13枚・途中でライブデモを1回挟む構成。

- `deck.md` … 本体(スピーカーノートは `<!-- -->` に入っている)
- `theme.css` … Marp テーマ(白背景・紺の見出し)
- `img/` … スクリーンショットと写真

ローカル画像を使っているので、ビルド時は `--allow-local-files` が必要。

## ビルド

```sh
cd slides

# ブラウザで見る(発表用。P キーでスピーカーノート)
npx @marp-team/marp-cli deck.md --theme theme.css --html --allow-local-files -o deck.html

# PDF
npx @marp-team/marp-cli deck.md --theme theme.css --html --allow-local-files --pdf -o deck.pdf

# 執筆中のプレビュー
npx @marp-team/marp-cli deck.md --theme theme.css --html --allow-local-files --watch
```

VS Code の Marp 拡張を使う場合は、ワークスペース設定に `"markdown.marp.themes": ["./slides/theme.css"]` を入れる。

## 構成

| # | 内容 |
|---|---|
| 1 | タイトル |
| 2 | 自己紹介 |
| 3 | 私の推し |
| 4 | 藤井風さんのコンサート(SNSをフォローしていたから間に合った) |
| 5 | 動機(直前に知る/全アーティストは追えない) |
| 6 | 作ったもの + **ライブデモ**(60秒) |
| 7 | 仕組み(Actions + `claude -p` → Workers/D1、API課金ゼロ) |
| 8 | 工夫① 収集は両方向から + 2段ロケット |
| 9 | 工夫① 成果(公式掲載前の公演をキャッチ) |
| 10 | 工夫② LLM は毎晩ちょっと違うことを言う(症状4つ) |
| 11 | 工夫② 対策(識別子/ラチェット) |
| 12 | 工夫② 通知は行動できる差分だけ(30〜95件 → 2件) |
| 13 | まとめ |
