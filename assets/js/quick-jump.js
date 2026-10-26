// Quick jump: Ctrl/Cmd+K, "/" or the navbar search icon opens one search over pages, page sections and
// every catalogued tool and repository. Replaces Quarto's page-text-only search, which cannot hold
// external tool links. Data: /assets/data/site-index.json (from catalog.yml) and /search.json (Quarto).

const KIND_RANK = { Page: 0, App: 1, Map: 1, Model: 2, Section: 3 };
let dataPromise, items = [], dialog, input, list, status, opener, active = -1, shown = [];

const load = () => dataPromise ??= Promise.all([
  fetch("/assets/data/site-index.json").then(r => r.json()),
  fetch("/search.json").then(r => r.json()).catch(() => []),
]).then(([idx, sections]) => {
  items = idx.map(d => ({ title: d.title, url: d.url, kind: d.kind, id: d.id, desc: d.desc || "", f: !!d.f, ext: /^https?:/.test(d.url) }));
  const seen = new Set();
  for (const s of sections) {
    if (!s.section || s.href.startsWith("404") || s.href.startsWith("tools/") || seen.has(s.href)) continue;
    seen.add(s.href);
    items.push({ title: `${s.title} › ${s.section}`, url: "/" + s.href, kind: "Section", id: "", desc: (s.text || "").replace(/\s+/g, " ").slice(0, 170), f: false, ext: false });
  }
});

const lev = (a, b) => {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
};
const words = s => s.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);

// Every query word must match somewhere; title matches count most, a one-letter typo still matches.
function score(item, tokens) {
  const title = item.title.toLowerCase(), id = item.id.toLowerCase(), desc = item.desc.toLowerCase();
  const tw = words(item.title + " " + item.id);
  let total = 0;
  for (const t of tokens) {
    let s = 0;
    if (tw.some(w => w.startsWith(t))) s = Math.max(s, title.startsWith(t) ? 6 : 4);
    if (title.includes(t)) s = Math.max(s, 3);
    if (id.includes(t)) s = Math.max(s, 2.5);
    if (desc.includes(t)) s = Math.max(s, 1);
    if (!s && t.length >= 4 && tw.some(w => w.length >= 4 && lev(w.slice(0, t.length + 1), t) <= 1)) s = 1.5;
    if (!s) return 0;
    total += s;
  }
  return total + (item.f ? 0.5 : 0);
}

const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mark = (text, tokens) => {
  let out = esc(text);
  // Highlight only where a word starts, so "ato" does not light up the middle of "Calculator".
  for (const t of tokens) out = out.replace(new RegExp(`(?<![a-z0-9])(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "<mark>$1</mark>");
  return out;
};

function results(q) {
  const tokens = words(q);
  if (!tokens.length) {
    const pages = items.filter(i => i.kind === "Page"), featured = items.filter(i => i.f && i.kind !== "Page");
    return [...pages.slice(0, 7), ...featured.slice(0, 5)].map(i => ({ ...i, tokens: [], group: i.kind === "Page" ? "Go to" : "Featured tools" }));
  }
  return items.map(i => ({ ...i, s: score(i, tokens) })).filter(i => i.s > 0)
    .sort((a, b) => b.s - a.s || (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9)).slice(0, 12)
    .map(i => ({ ...i, tokens, group: "" }));
}

function render() {
  shown = results(input.value);
  let last = null, html = "";
  shown.forEach((r, i) => {
    if (r.group && r.group !== last) { html += `<li role="presentation" class="qj-group">${r.group}</li>`; last = r.group; }
    html += `<li role="option" id="qj-${i}" data-i="${i}" aria-selected="false">
      <span class="qj-title">${mark(r.title, r.tokens)}${r.ext ? '<span class="qj-ext" aria-hidden="true"> ↗</span><span class="visually-hidden"> (opens in a new tab)</span>' : ""}</span>
      <span class="wfrc-chip">${esc(r.kind)}</span>
      ${r.desc ? `<span class="qj-desc">${mark(r.desc.length > 110 ? r.desc.slice(0, 109) + "…" : r.desc, r.tokens)}</span>` : ""}</li>`;
  });
  list.innerHTML = html || `<li role="presentation" class="qj-empty">Nothing matches “${esc(input.value)}”. Try fewer letters.</li>`;
  status.textContent = shown.length ? `${shown.length} results` : "No results";
  setActive(shown.length ? 0 : -1);
}

function setActive(i) {
  active = i;
  list.querySelectorAll("[role=option]").forEach(el => el.setAttribute("aria-selected", String(+el.dataset.i === i)));
  const el = list.querySelector(`#qj-${i}`);
  input.setAttribute("aria-activedescendant", el ? el.id : "");
  el?.scrollIntoView({ block: "nearest" });
}

function go(i, newTab) {
  const r = shown[i]; if (!r) return;
  if (newTab || r.ext) window.open(r.url, "_blank", "noopener"); else location.href = r.url;
  if (newTab || r.ext) close();
}

function build() {
  dialog = document.createElement("dialog");
  dialog.className = "qj";
  dialog.setAttribute("aria-label", "Search the site");
  dialog.innerHTML = `<div class="qj-box">
    <input class="qj-input" type="search" role="combobox" aria-expanded="true" aria-controls="qj-list" aria-autocomplete="list"
      aria-label="Search tools, models, reports and pages" placeholder="Search tools, models, reports and pages" autocomplete="off" spellcheck="false">
    <ul id="qj-list" role="listbox" aria-label="Results"></ul>
    <p class="qj-foot"><kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> new tab · <kbd>Esc</kbd> close</p>
    <p class="qj-status visually-hidden" role="status" aria-live="polite"></p></div>`;
  document.body.append(dialog);
  input = dialog.querySelector("input"); list = dialog.querySelector("ul"); status = dialog.querySelector(".qj-status");
  input.addEventListener("input", render);
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(Math.min(shown.length - 1, active + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(Math.max(0, active - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(active, e.ctrlKey || e.metaKey); }
  });
  list.addEventListener("click", e => { const li = e.target.closest("[role=option]"); if (li) go(+li.dataset.i, e.ctrlKey || e.metaKey); });
  list.addEventListener("mousemove", e => { const li = e.target.closest("[role=option]"); if (li && +li.dataset.i !== active) setActive(+li.dataset.i); });
  dialog.addEventListener("click", e => { if (e.target === dialog) close(); });   // click on the backdrop
  dialog.addEventListener("close", () => opener?.focus?.());
}

export async function open() {
  if (!dialog) build();
  opener = document.activeElement;
  await load();
  if (!dialog.open) dialog.showModal();
  input.value = ""; render(); input.focus();
}
function close() { dialog?.open && dialog.close(); }

document.addEventListener("keydown", e => {
  const typing = /^(input|textarea|select)$/i.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
    e.preventDefault(); open();
  }
});
document.addEventListener("click", e => {
  const a = e.target.closest('a[href$="#quick-jump"]');
  if (a) { e.preventDefault(); open(); }
});
// Warm the data while the browser is idle, so the first open is instant.
(window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => load());
