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
     "category": "ブロック解説",
     "tags": ["search", "変数"],
     "date": "2026-10-23",
     "order": 10
   }
   ```

   一覧は `order` の小さい順に並び、`order` が同じなら `date` の新しい順です。

5. `npm run build` で確認し、コミットして push する。

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
