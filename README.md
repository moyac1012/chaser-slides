# CHaser 教材スライド

CHaser（U-16 プログラミングコンテスト）の教材スライドを一覧・閲覧できる静的サイトです。
依存パッケージはなく、Node.js（18 以上）だけでビルドできます。

## 使い方

```sh
npm run build     # dist/ に書き出し
npm run preview   # ビルドしてローカルで確認
npm run deploy    # ビルドして Cloudflare Workers にデプロイ
```

## ディレクトリ構成

```
content/roadmap.json    ロードマップの章（並び順・タイトル・説明）
content/decks/<slug>/   1デッキ = 1フォルダ（<slug> が URL になる：/decks/<slug>/）
  meta.json             一覧ページに出す情報
  deck.json             スライドの並び順とフォント（Slides アーティファクトの index）
  slides/<id>.html      1枚 = 1つの <section>（1920×1080）
  assets/               画像
  assets.json           （任意）スライド内の画像 URL → assets/ のファイル名
site/                   一覧ページとビューアのテンプレート・CSS・JS
scripts/build.mjs       content/ から dist/ を生成
```

## スライドを追加する

1. `content/decks/<slug>/` を作る（例：`content/decks/walk/`）。
2. Slides アーティファクトの `project/deck.json` と `project/slides/*.html` を、`deck.json` と `slides/` に置く。
3. スライド内の画像（`/_blob/<id>`）を `assets/` に保存し、`assets.json` で対応づける。

   ```json
   { "/_blob/7041f5d8b9ee2590579ac1c458df99a0": "bot-me.png" }
   ```

4. `meta.json` を書く。

   ```json
   {
     "title": "まっすぐ見る（search）",
     "description": "一覧ページに表示する説明文",
     "goal": "ロードマップに出す「できるようになること」",
     "category": "ブロック解説",
     "tags": ["search", "変数"],
     "date": "2026-10-23",
     "chapter": "see",
     "order": 10
   }
   ```

   - `chapter` は `content/roadmap.json` の章の `id`。章のないデッキは「そのほか」にまとめられます。
   - 学ぶ順（STEP 番号）は「章の並び → 章の中では `order` の小さい順」で自動的に決まります。
     あとから間に入れたいときは、`order` を 10, 20, 30… のように空けておくと便利です。
   - 一覧ページ・ロードマップ・ビューアの「前／次」リンクは、すべてこの順番から作られます。

5. `npm run build` で確認し、コミットして push する。

## ダウンロード（HTML / PDF）

一覧・ロードマップ・ビューアから、各デッキを次の形でダウンロードできます。

| 形式 | 中身 | 作られ方 |
| --- | --- | --- |
| HTML（`chaser-<slug>.html`） | 画像・CSS・JS を埋め込んだ1ファイル。ブラウザで開けばそのまま発表できる | `npm run build` のたびに自動生成 |
| PDF（`chaser-<slug>.pdf`） | 1枚＝1ページ（1920×1080） | `pdf/<slug>.pdf` をサイトにコピー |

PDF は GitHub Actions（`.github/workflows/pdf.yml`）が、`content/`・`site/`・`scripts/` の変更を push したときに作り直して `pdf/` にコミットします。手元で作る場合は次のとおりです。

```sh
npm install --no-save playwright && npx playwright install chromium
npm run build && npm run pdf
```

ビューアの URL に `?print` を付けると全スライドが縦に並ぶ印刷用ページになり、ブラウザの印刷から PDF 保存もできます。

## ビューアの操作

| 操作 | キー |
| --- | --- |
| 次 / 前のスライド | → / ←（スペース、PageDown / PageUp でも可。スマホはスワイプ） |
| 最初 / 最後 | Home / End |
| スライド一覧 | O |
| スピーカーノート | N |
| 全画面 | F |

URL の末尾の `#3` で3枚目を直接開けます。

## デプロイ（Cloudflare Workers の静的アセット）

`wrangler.toml` の `[assets] directory = "./dist"` で、ビルド結果をそのまま配信します。

- **GitHub 連携（設定済み）**：Cloudflare の Workers Builds が push のたびに次を実行します。
  - Build command: `npm run build`
  - Deploy command: `npx wrangler deploy`
- **手動**：`npx wrangler login` のあと `npm run deploy`。
