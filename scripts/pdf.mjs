// dist/ のビューアを印刷モード（?print）で開き、デッキごとに PDF を書き出す。
//
//   npm run build && node scripts/pdf.mjs
//
// 出力: pdf/<slug>.pdf（1枚＝1ページ、1920×1080px）
// 必要: playwright（npm i --no-save playwright && npx playwright install chromium）
// CHROMIUM_PATH を指定すると、そのブラウザを使う。

import http from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = path.join(ROOT, "dist");
const PDF_DIR = path.join(ROOT, "pdf");
const PORT = Number(process.env.PDF_PORT ?? 8787);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

// ---------- dist/ を配信する小さなサーバー ----------

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const filePath = path.normalize(path.join(DIST_DIR, relative));
  return filePath.startsWith(DIST_DIR) ? filePath : null;
}

function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    const filePath = resolveRequestPath(req.url);
    try {
      if (!filePath) throw new Error("outside dist");
      const body = await readFile(filePath);
      res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

// ---------- PDF 化 ----------

async function listBuiltDecks() {
  const entries = await readdir(path.join(DIST_DIR, "decks"), { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function launchBrowser() {
  const { chromium } = await import("playwright");
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  return chromium.launch({ executablePath });
}

async function waitForSlideAssets(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(images.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  });
}

async function renderDeckPdf(browser, slug) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`http://localhost:${PORT}/decks/${slug}/?print`, { waitUntil: "networkidle" });
  await waitForSlideAssets(page);
  const outPath = path.join(PDF_DIR, `${slug}.pdf`);
  await page.pdf({ path: outPath, width: "1920px", height: "1080px", printBackground: true });
  await page.close();
  return outPath;
}

async function main() {
  await mkdir(PDF_DIR, { recursive: true });
  const server = await startStaticServer();
  const browser = await launchBrowser();
  try {
    for (const slug of await listBuiltDecks()) {
      const outPath = await renderDeckPdf(browser, slug);
      console.log(`pdf: ${path.relative(ROOT, outPath)}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
