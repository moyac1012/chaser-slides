// content/decks/<slug>/ の各デッキを dist/ に静的サイトとして書き出す。
//
// 入力（1デッキ = 1フォルダ）
//   meta.json    一覧ページ用のタイトル・説明・タグ・日付・並び順
//   deck.json    Slides アーティファクトの index（title, order, faces）
//   slides/*.html  1枚 = 1つの <section>
//   assets/      画像ファイル
//   assets.json  （任意）スライド内の画像 URL → assets/ のファイル名
//
// 出力
//   dist/index.html             デッキ一覧
//   dist/decks/<slug>/index.html  ビューア
//   dist/decks/<slug>/assets/     画像
//   dist/css, dist/js           共通の CSS / JS

import { readFile, writeFile, readdir, mkdir, cp, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = path.join(ROOT, "content", "decks");
const SITE_DIR = path.join(ROOT, "site");
const DIST_DIR = path.join(ROOT, "dist");

// ---------- 読み込み ----------

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfExists(filePath, fallback) {
  try {
    await access(filePath);
  } catch {
    return fallback;
  }
  return readJson(filePath);
}

async function listDeckSlugs() {
  const entries = await readdir(CONTENT_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function readSlideHtmlList(deckDir, order) {
  return Promise.all(
    order.map((id) => readFile(path.join(deckDir, "slides", `${id}.html`), "utf8")),
  );
}

async function loadDeck(slug) {
  const deckDir = path.join(CONTENT_DIR, slug);
  const meta = await readJson(path.join(deckDir, "meta.json"));
  const deck = await readJson(path.join(deckDir, "deck.json"));
  const assetMap = await readJsonIfExists(path.join(deckDir, "assets.json"), {});
  const slides = await readSlideHtmlList(deckDir, deck.order);
  return { slug, deckDir, meta, deck, assetMap, slides };
}

// ---------- 変換 ----------

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rewriteAssetUrls(html, assetMap) {
  let result = html;
  for (const [from, fileName] of Object.entries(assetMap)) {
    result = result.replaceAll(from, `assets/${fileName}`);
  }
  return result;
}

function fontLinkTags(faces = {}) {
  return Object.values(faces)
    .filter((face) => face.href)
    .map((face) => `<link rel="stylesheet" href="${escapeHtml(face.href)}">`)
    .join("\n");
}

function wrapSlide(sectionHtml, index) {
  return `<div class="slide" data-index="${index}">\n${sectionHtml.trim()}\n</div>`;
}

// ---------- ページ生成 ----------

async function renderViewerPage(loaded) {
  const template = await readFile(path.join(SITE_DIR, "viewer.template.html"), "utf8");
  const slidesHtml = loaded.slides
    .map((html) => rewriteAssetUrls(html, loaded.assetMap))
    .map(wrapSlide)
    .join("\n");
  return template
    .replaceAll("{{TITLE}}", escapeHtml(loaded.meta.title))
    .replace("{{FONT_LINKS}}", fontLinkTags(loaded.deck.faces))
    .replace("{{SLIDES}}", slidesHtml);
}

function renderTagList(tags = []) {
  return tags.map((tag) => `<li class="tag">${escapeHtml(tag)}</li>`).join("");
}

function renderDeckCard(loaded) {
  const { slug, meta, slides } = loaded;
  const href = `decks/${slug}/`;
  const searchText = [meta.title, meta.description, meta.category, ...(meta.tags ?? [])].join(" ");
  return `<article class="card" data-search="${escapeHtml(searchText)}">
  <a class="card__thumb" href="${href}" aria-label="${escapeHtml(meta.title)} を開く">
    <iframe src="${href}?thumb" title="${escapeHtml(meta.title)} の表紙" loading="lazy" tabindex="-1"></iframe>
  </a>
  <div class="card__body">
    <p class="card__eyebrow">${escapeHtml(meta.category ?? "スライド")} · ${slides.length}枚</p>
    <h2 class="card__title"><a href="${href}">${escapeHtml(meta.title)}</a></h2>
    <p class="card__desc">${escapeHtml(meta.description ?? "")}</p>
    <ul class="card__tags">${renderTagList(meta.tags)}</ul>
    <div class="card__foot">
      <time datetime="${escapeHtml(meta.date ?? "")}">${escapeHtml(meta.date ?? "")}</time>
      <a class="button" href="${href}">スライドを開く</a>
    </div>
  </div>
</article>`;
}

function compareDecks(a, b) {
  const orderA = a.meta.order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.meta.order ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return String(b.meta.date ?? "").localeCompare(String(a.meta.date ?? ""));
}

async function renderIndexPage(decks) {
  const template = await readFile(path.join(SITE_DIR, "index.template.html"), "utf8");
  const cards = [...decks].sort(compareDecks).map(renderDeckCard).join("\n");
  return template
    .replace("{{DECK_COUNT}}", String(decks.length))
    .replace("{{CARDS}}", cards);
}

// ---------- 書き出し ----------

async function resetDist() {
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });
}

async function copySharedFiles() {
  await cp(path.join(SITE_DIR, "css"), path.join(DIST_DIR, "css"), { recursive: true });
  await cp(path.join(SITE_DIR, "js"), path.join(DIST_DIR, "js"), { recursive: true });
}

async function writeDeck(loaded) {
  const outDir = path.join(DIST_DIR, "decks", loaded.slug);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), await renderViewerPage(loaded));
  await cp(path.join(loaded.deckDir, "assets"), path.join(outDir, "assets"), { recursive: true });
}

async function writeIndex(decks) {
  await writeFile(path.join(DIST_DIR, "index.html"), await renderIndexPage(decks));
}

// ---------- 実行 ----------

async function build() {
  await resetDist();
  await copySharedFiles();
  const decks = await Promise.all((await listDeckSlugs()).map(loadDeck));
  await Promise.all(decks.map(writeDeck));
  await writeIndex(decks);
  console.log(`built ${decks.length} deck(s) → ${path.relative(ROOT, DIST_DIR)}/`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
