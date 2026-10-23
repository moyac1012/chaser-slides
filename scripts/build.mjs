// content/ のデッキとロードマップから、dist/ に静的サイトを書き出す。
//
// 入力
//   content/roadmap.json             章（chapter）の並びと説明
//   content/decks/<slug>/meta.json   一覧・ロードマップ用の情報（chapter と order で学ぶ順が決まる）
//   content/decks/<slug>/deck.json   Slides アーティファクトの index（order, faces）
//   content/decks/<slug>/slides/*.html  1枚 = 1つの <section>
//   content/decks/<slug>/assets/     画像
//   content/decks/<slug>/assets.json （任意）スライド内の画像 URL → assets/ のファイル名
//
// 出力
//   dist/index.html                  デッキ一覧（学ぶ順）
//   dist/roadmap/index.html          学習ロードマップ
//   dist/decks/<slug>/index.html     ビューア（前後のデッキへのリンク付き）
//   dist/decks/<slug>/assets/        画像
//   dist/css, dist/js                共通の CSS / JS

import { readFile, writeFile, readdir, mkdir, cp, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = path.join(ROOT, "content");
const DECKS_DIR = path.join(CONTENT_DIR, "decks");
const SITE_DIR = path.join(ROOT, "site");
const DIST_DIR = path.join(ROOT, "dist");

const OTHER_CHAPTER = { id: "other", title: "そのほか", description: "ロードマップの章が決まっていないスライド。" };

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

async function readTemplate(name) {
  return readFile(path.join(SITE_DIR, name), "utf8");
}

async function listDeckSlugs() {
  const entries = await readdir(DECKS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function readSlideHtmlList(deckDir, order) {
  return Promise.all(
    order.map((id) => readFile(path.join(deckDir, "slides", `${id}.html`), "utf8")),
  );
}

async function loadDeck(slug) {
  const deckDir = path.join(DECKS_DIR, slug);
  const meta = await readJson(path.join(deckDir, "meta.json"));
  const deck = await readJson(path.join(deckDir, "deck.json"));
  const assetMap = await readJsonIfExists(path.join(deckDir, "assets.json"), {});
  const slides = await readSlideHtmlList(deckDir, deck.order);
  return { slug, deckDir, meta, deck, assetMap, slides };
}

async function loadRoadmap() {
  return readJsonIfExists(path.join(CONTENT_DIR, "roadmap.json"), { title: "学習ロードマップ", lead: "", chapters: [] });
}

// ---------- 学ぶ順の決定 ----------

function compareWithinChapter(a, b) {
  const orderA = a.meta.order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.meta.order ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return String(a.meta.date ?? "").localeCompare(String(b.meta.date ?? ""));
}

function chapterListWithOther(roadmap, decks) {
  const known = new Set(roadmap.chapters.map((c) => c.id));
  const hasOther = decks.some((d) => !known.has(d.meta.chapter));
  return hasOther ? [...roadmap.chapters, OTHER_CHAPTER] : roadmap.chapters;
}

function chapterIdOf(deck, knownIds) {
  return knownIds.has(deck.meta.chapter) ? deck.meta.chapter : OTHER_CHAPTER.id;
}

/** 章ごとにデッキを並べ、通し番号（step）を振る。 */
function buildLearningPath(roadmap, decks) {
  const chapters = chapterListWithOther(roadmap, decks);
  const knownIds = new Set(roadmap.chapters.map((c) => c.id));
  let step = 0;
  return chapters
    .map((chapter, chapterIndex) => ({
      chapter,
      number: chapterIndex + 1,
      entries: decks
        .filter((d) => chapterIdOf(d, knownIds) === chapter.id)
        .sort(compareWithinChapter)
        .map((deck) => ({ deck, step: ++step, chapter })),
    }))
    .filter((group) => group.entries.length > 0);
}

function flattenPath(groups) {
  return groups.flatMap((g) => g.entries);
}

// ---------- HTML 部品 ----------

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stepLabel(step) {
  return `STEP ${String(step).padStart(2, "0")}`;
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

function renderTagList(tags = []) {
  return tags.map((tag) => `<li class="tag">${escapeHtml(tag)}</li>`).join("");
}

function deckHref(slug, fromDepth) {
  return `${"../".repeat(fromDepth)}decks/${slug}/`;
}

// ---------- ビューア ----------

function renderNeighborLink(entry, direction) {
  if (!entry) return "";
  const arrow = direction === "prev" ? "←" : "→";
  const label = direction === "prev" ? "前" : "次";
  const text = direction === "prev"
    ? `${arrow} ${label}：${escapeHtml(entry.deck.meta.title)}`
    : `${label}：${escapeHtml(entry.deck.meta.title)} ${arrow}`;
  return `<a class="toolbar__btn toolbar__neighbor" href="../${entry.deck.slug}/">${text}</a>`;
}

async function renderViewerPage(entry, prev, next) {
  const { deck: loaded } = entry;
  const template = await readTemplate("viewer.template.html");
  const slidesHtml = loaded.slides
    .map((html) => rewriteAssetUrls(html, loaded.assetMap))
    .map(wrapSlide)
    .join("\n");
  return template
    .replaceAll("{{TITLE}}", escapeHtml(loaded.meta.title))
    .replace("{{STEP}}", stepLabel(entry.step))
    .replace("{{FONT_LINKS}}", fontLinkTags(loaded.deck.faces))
    .replace("{{PREV_LINK}}", renderNeighborLink(prev, "prev"))
    .replace("{{NEXT_LINK}}", renderNeighborLink(next, "next"))
    .replace("{{SLIDES}}", slidesHtml);
}

// ---------- 一覧ページ ----------

function renderDeckCard(entry) {
  const { deck: { slug, meta, slides }, step, chapter } = entry;
  const href = deckHref(slug, 0);
  const searchText = [meta.title, meta.description, meta.category, chapter.title, ...(meta.tags ?? [])].join(" ");
  return `<article class="card" data-search="${escapeHtml(searchText)}">
  <a class="card__thumb" href="${href}" aria-label="${escapeHtml(meta.title)} を開く">
    <iframe src="${href}?thumb" title="${escapeHtml(meta.title)} の表紙" loading="lazy" tabindex="-1"></iframe>
    <span class="card__step">${stepLabel(step)}</span>
  </a>
  <div class="card__body">
    <p class="card__eyebrow">${escapeHtml(chapter.title)} · ${slides.length}枚</p>
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

async function renderIndexPage(entries) {
  const template = await readTemplate("index.template.html");
  return template
    .replace("{{DECK_COUNT}}", String(entries.length))
    .replace("{{CARDS}}", entries.map(renderDeckCard).join("\n"));
}

// ---------- ロードマップ ----------

function renderRoadmapNode(entry) {
  const { deck: { slug, meta, slides }, step } = entry;
  const href = deckHref(slug, 1);
  return `<li class="node">
  <div class="node__marker"><span>${String(step).padStart(2, "0")}</span></div>
  <a class="node__card" href="${href}">
    <div class="node__thumb"><iframe src="${href}?thumb" title="${escapeHtml(meta.title)} の表紙" loading="lazy" tabindex="-1"></iframe></div>
    <div class="node__body">
      <p class="node__step">${stepLabel(step)} · ${slides.length}枚</p>
      <h3 class="node__title">${escapeHtml(meta.title)}</h3>
      <p class="node__desc">${escapeHtml(meta.description ?? "")}</p>
      ${meta.goal ? `<p class="node__goal"><span>できるようになること</span>${escapeHtml(meta.goal)}</p>` : ""}
    </div>
  </a>
</li>`;
}

function renderRoadmapChapter(group) {
  return `<section class="chapter">
  <header class="chapter__head">
    <p class="chapter__num">CHAPTER ${group.number}</p>
    <h2 class="chapter__title">${escapeHtml(group.chapter.title)}</h2>
    <p class="chapter__desc">${escapeHtml(group.chapter.description ?? "")}</p>
  </header>
  <ol class="chapter__nodes">
${group.entries.map(renderRoadmapNode).join("\n")}
  </ol>
</section>`;
}

async function renderRoadmapPage(roadmap, groups) {
  const template = await readTemplate("roadmap.template.html");
  return template
    .replaceAll("{{ROADMAP_TITLE}}", escapeHtml(roadmap.title))
    .replace("{{ROADMAP_LEAD}}", escapeHtml(roadmap.lead ?? ""))
    .replace("{{CHAPTERS}}", groups.map(renderRoadmapChapter).join("\n"));
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

async function writeDeck(entry, prev, next) {
  const outDir = path.join(DIST_DIR, "decks", entry.deck.slug);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), await renderViewerPage(entry, prev, next));
  await cp(path.join(entry.deck.deckDir, "assets"), path.join(outDir, "assets"), { recursive: true });
}

async function writeAllDecks(entries) {
  await Promise.all(entries.map((entry, i) => writeDeck(entry, entries[i - 1], entries[i + 1])));
}

async function writeIndex(entries) {
  await writeFile(path.join(DIST_DIR, "index.html"), await renderIndexPage(entries));
}

async function writeRoadmap(roadmap, groups) {
  const outDir = path.join(DIST_DIR, "roadmap");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "index.html"), await renderRoadmapPage(roadmap, groups));
}

// ---------- 実行 ----------

async function build() {
  await resetDist();
  await copySharedFiles();
  const roadmap = await loadRoadmap();
  const decks = await Promise.all((await listDeckSlugs()).map(loadDeck));
  const groups = buildLearningPath(roadmap, decks);
  const entries = flattenPath(groups);
  await writeAllDecks(entries);
  await writeIndex(entries);
  await writeRoadmap(roadmap, groups);
  console.log(`built ${entries.length} deck(s) in ${groups.length} chapter(s) → ${path.relative(ROOT, DIST_DIR)}/`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
