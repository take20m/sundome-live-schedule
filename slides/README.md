# LT スライド

サイト本体と同じ「チケット半券インディゴ」で組んだ Marp のデッキ。5分・10枚・途中でライブデモを1回挟む構成。

- `deck.md` … 本体(スピーカーノートは `<!-- -->` に入っている)
- `theme.css` … Marp テーマ

## ビルド

```sh
# ブラウザで見る(発表用。P キーでスピーカーノート)
npx @marp-team/marp-cli slides/deck.md --theme slides/theme.css --html -o slides/deck.html

# PDF
npx @marp-team/marp-cli slides/deck.md --theme slides/theme.css --html --pdf -o slides/deck.pdf

# 執筆中のプレビュー
npx @marp-team/marp-cli slides/deck.md --theme slides/theme.css --html --watch
```

VS Code の Marp 拡張を使う場合は、ワークスペース設定に `"markdown.marp.themes": ["./slides/theme.css"]` を入れる。

## 構成

| # | 内容 |
|---|---|
| 1 | タイトル |
| 2 | 動機(先行を見逃す/情報が散在) |
| 3 | **ライブデモ**(60秒) |
| 4 | 仕組み(Actions + `claude -p` → Workers/D1、API課金ゼロ) |
| 5 | 工夫① 収集は両方向から + 2段ロケット |
| 6 | 工夫① 成果(公式掲載前の公演をキャッチ) |
| 7 | 工夫② LLM は毎晩ちょっと違うことを言う(症状4つ) |
| 8 | 工夫② 対策(識別子/ラチェット) |
| 9 | 工夫② 通知は行動できる差分だけ(30〜95件 → 2件) |
| 10 | まとめ |
