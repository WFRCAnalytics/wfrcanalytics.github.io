// Capture a screenshot of every live public tool in catalog.yml for the Explore and Home cards.
//
//   cd scripts/tools && npm ci
//   node capture-screenshots.mjs              # only new tools, tools pushed since the last capture, or older than 30 days
//   node capture-screenshots.mjs --force      # everything
//   node capture-screenshots.mjs --only=APP-Commute-Explorer,GIS_SE2025_H3
//   node capture-screenshots.mjs --only=TDM-EST-Bus-Speeds --settle=20000   # slow Shiny apps
//
// A tool with `no-shot: true` in catalog.yml is skipped and keeps the brand banner.
//
// Before the picture is taken, splash screens, terms pop-ups and cookie banners are dismissed: any visible
// button inside a modal or overlay whose label looks like "I agree", "Continue", "Get started", "OK",
// "Reject all" is clicked (up to three rounds). For a site where that is not enough, put the CSS selector of
// the button in `shot-click:` on that tool in catalog.yml. A slow app can set `shot-wait:` (milliseconds).
//
// Images go to assets/shots/<id>.jpg (about 770x480) with assets/shots/manifest.json recording what was captured.
// Uses the system Chrome: set CHROME_PATH, or the usual Windows / Linux / macOS locations are tried.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const shots = path.join(root, "assets", "shots");
const manifestPath = path.join(shots, "manifest.json");
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = (args.find(a => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const settle = Number((args.find(a => a.startsWith("--settle=")) || "--settle=4500").slice(9));
const maxAgeDays = Number((args.find(a => a.startsWith("--max-age=")) || "--max-age=30").slice(10));

const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(p => p && fs.existsSync(p));
if (!chrome) throw new Error("Chrome not found. Set CHROME_PATH.");

fs.mkdirSync(shots, { recursive: true });
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const catalog = yaml.load(fs.readFileSync(path.join(root, "catalog.yml"), "utf8"));
// Runs inside the page: click the first visible dismiss-style button that sits in an overlay.
const DISMISS_LABELS = "^(i acknowledge and agree|acknowledge|i agree|agree|continue|get started|start|ok|okay|got it|close|dismiss|accept all|accept|reject all|reject|decline|no thanks|skip|enter|proceed|let's go|begin)$";
async function dismissOverlays(page, selector) {
  const clicked = [];
  for (let round = 0; round < 3; round++) {
    const label = await page.evaluate((labels, custom) => {
      const visible = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight && cs.visibility !== "hidden" && cs.display !== "none"; };
      const inOverlay = el => {
        if (el.closest('[role=dialog],[role=alertdialog],[aria-modal=true],dialog,.modal,.modal-dialog,.shiny-modal,[class*=modal],[class*=splash],[class*=cookie],[class*=consent],[class*=welcome],[class*=overlay],[class*=popup],[id*=splash],[id*=cookie],[id*=consent],[id*=modal]')) return true;
        for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true;
        return false;
      };
      const re = new RegExp(labels, "i");
      let target = null;
      if (custom) { target = document.querySelector(custom); if (target && !visible(target)) target = null; }
      if (!target) target = [...document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit], .btn')]
        .find(el => visible(el) && re.test((el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ")) && inOverlay(el));
      if (!target) return null;
      const text = (target.innerText || target.value || target.getAttribute("aria-label") || "").trim();
      target.click();
      return text || "(button)";
    }, DISMISS_LABELS, selector || null);
    if (!label) break;
    clicked.push(label);
    await wait(1200);                                     // let the overlay fade out and the app redraw
  }
  return clicked;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

const live = catalog.filter(e => e.include && !e.internal && e.status === "live" && e.url && e.url.startsWith("https://") && !e["no-shot"]);
const candidates = live.filter(e => !only.length || only.includes(e.id));
const due = candidates.filter(e => {
  const m = manifest[e.id], file = path.join(shots, `${e.id}.jpg`);
  if (force || only.length || !m || !fs.existsSync(file)) return true;
  const ageDays = (Date.now() - Date.parse(m.captured)) / 864e5;
  return e["last-push"] > m.lastPush || ageDays > maxAgeDays;
});
console.log(`${candidates.length} live public tools; ${due.length} due for a new screenshot`);

const launch = () => puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
let browser = await launch();
const report = [];
async function capture(e) {
  let page;
  try {
    if (!browser.connected) browser = await launch();        // a heavy page can take Chrome down; start a fresh one
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 0.6 });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    let note = "";
    // Map apps never stop loading tiles, so wait for "load" and then a fixed settle time, not for network idle.
    try { await page.goto(e.url, { waitUntil: "load", timeout: 30000 }); } catch { note = "slow page (captured anyway)"; }
    await wait(Number(e["shot-wait"]) || settle);
    const dismissed = await dismissOverlays(page, e["shot-click"]);
    if (dismissed.length) { note = (note ? note + "; " : "") + `dismissed: ${dismissed.join(", ")}`; await wait(2000); }
    const content = await page.evaluate(() => (document.body?.innerText || "").trim().length + document.querySelectorAll("canvas, svg, img").length);
    if (content < 5) note = "page looks blank";
    await page.screenshot({ path: path.join(shots, `${e.id}.jpg`), type: "jpeg", quality: 76 });
    manifest[e.id] = { captured: new Date().toISOString(), lastPush: e["last-push"], url: e.url };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");   // save progress after every capture
    report.push(`${e.id.padEnd(44)} ${note || "ok"}`);
  } catch (err) {
    report.push(`${e.id.padEnd(44)} FAILED: ${String(err.message).slice(0, 80)}`);
  } finally { await page?.close().catch(() => {}); }
}
const queue = [...due];                       // one at a time: some of these apps are heavy (WebAssembly, WebGL)
await Promise.all(Array.from({ length: 1 }, async () => { while (queue.length) await capture(queue.shift()); }));
await browser.close().catch(() => {});

for (const id of Object.keys(manifest)) if (!live.some(e => e.id === id)) {   // tool no longer live: drop its image
  fs.rmSync(path.join(shots, `${id}.jpg`), { force: true }); delete manifest[id];
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
console.log(report.join("\n") || "nothing to do");
