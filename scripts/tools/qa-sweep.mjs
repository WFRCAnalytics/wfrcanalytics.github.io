// Accessibility and layout sweep of the rendered site (docs/).
//
//   cd scripts/tools && npm ci
//   node qa-sweep.mjs            # every page in sitemap.xml + a made-up 404 address, light and dark, desktop and phone
//   node qa-sweep.mjs --quick    # light mode only (half the runs)
//
// Serves docs/ locally with GitHub Pages' 404 behaviour, runs axe-core (WCAG 2.1 A/AA), and checks for
// horizontal overflow and JavaScript errors. Exit code 1 if anything is found; a Markdown report goes to
// qa-report.md next to this file (the weekly workflow puts it in the pull request).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, "..", "..", "docs");
const quick = process.argv.includes("--quick");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(p => p && fs.existsSync(p));
if (!chrome) throw new Error("Chrome not found. Set CHROME_PATH.");

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".xml": "application/xml",
  ".woff2": "font/woff2", ".woff": "font/woff" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(docs, p);
  if (!file.startsWith(docs)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  const ok = fs.existsSync(file);
  if (!ok) file = path.join(docs, "404.html");
  res.writeHead(ok ? 200 : 404, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const sitemap = fs.readFileSync(path.join(docs, "sitemap.xml"), "utf8");
const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname)
  .filter(p => !/^\/(404|search)/.test(p));
pages.push("/no/such/page");                       // exercises the 404 page

const views = [["desktop", 1300, 900, false], ["phone", 390, 844, true]];
const schemes = quick ? ["light"] : ["light", "dark"];
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const wait = ms => new Promise(r => setTimeout(r, ms));
const problems = [];
let runs = 0;
for (const p of pages) for (const [name, w, h, mobile] of views) for (const scheme of schemes) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e).slice(0, 120)));
  await page.setViewport({ width: w, height: h, isMobile: mobile });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  try { await page.goto(base + p, { waitUntil: "networkidle0", timeout: 60000 }); } catch { errors.push("load timeout"); }
  await wait(900);
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }))
    .violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(" ").slice(0, 80)}`));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const label = `${p} [${name}/${scheme}]`;
  for (const v of violations) problems.push(`${label} axe ${v}`);
  if (overflow) problems.push(`${label} horizontal overflow`);
  for (const e of errors) problems.push(`${label} script error: ${e}`);
  runs++;
  await page.close();
}
await browser.close();
server.close();

const report = [`# Site QA sweep`, ``, `${pages.length} pages, ${runs} checks (${quick ? "light mode only" : "light and dark"}, desktop and phone).`, ``,
  problems.length ? `**${problems.length} problem(s):**\n\n` + problems.map(x => `- ${x}`).join("\n") : "No accessibility violations, overflow or script errors."].join("\n");
fs.writeFileSync(path.join(here, "qa-report.md"), report + "\n");
console.log(report);
process.exit(problems.length ? 1 : 0);
