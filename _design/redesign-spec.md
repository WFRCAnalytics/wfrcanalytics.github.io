# WFRC Analytics site redesign — spec (draft for discussion)

Baseline: tags `v0.1.0` (original) and `v0.2.0` (wfrc-brand 0.1.0 migration). Nothing in the site has been changed; this folder is `_design/` so Quarto ignores it.

## 1. Purpose and audience
A front door to WFRC Analytics' work: models, apps, maps, reports, data, code.
Audience: partner agencies and consultants first, curious public second, WFRC staff third.
Principle: **this site explains and points; each tool keeps living in its own repo/site; `wfrc.utah.gov/wftdm-docs` stays the TDM documentation of record.**

## 2. Facts that drive the design
- 188 repos (140 public, 48 private); 185 after excluding `.github`, this site and `wfrc-brand`. Naming prefixes (TDM-, REMM-, APP-, MAP-, DATA-, GIS-, TOOL-…) are the existing taxonomy.
- 27 have a reachable live site (GitHub Pages, shinyapps.io, wfrc.org). The rest are repo-only.
- Current sidebars hard-code ~100 links; ~35 return 404 (repos with no Pages site, private repos, or renamed: `Viz-Tool` is `vizTool`). All "Previous Releases" links point at a private repo.
- Status: TDM 9.2.0 current / 10.0.0 beta; REMM 3.0.0 current / 3.0.2 beta.

## 3. Information architecture

| Page | Path | Purpose |
|---|---|---|
| Home | `/` | Hero, key facts, featured tools, "choose your path", latest updates |
| Explore | `/explore/` | Filterable grid of live apps and maps (catalog kinds `app`, `map`) |
| Models | `/models/` + `tdm/`, `remm/`, `bdm/` | One rich page per model; releases, method, validation, components, links out |
| Reports & methods | `/reports/` | Estimation, calibration, validation, input and analysis write-ups (live sites first) |
| Data | `/data/` | Datasets and releases (TAZ, SE, observed data), pointer to WFRC data portal and map gallery |
| Code | `/code/` | Full searchable catalog table of all repos, with status and Internal chips |
| Updates | `/updates/` | Quarto blog listing: releases, new tools, changelog |
| About | `/about/` | Team, region, approach (rewritten, facts verified) |
| Contact | `/contact/` | Email, address, GitHub issues; no form |

Navbar: Explore · Models ▾ (TDM, REMM, BDM) · Reports · Data · Code · Updates · About. Contact in the footer and About. Mode toggle and social menu come from `wfrc-brand`.
Sidebars are removed from top-level pages and kept only on the three model sections, where they are short and auto-built from the folder contents.

## 4. Page designs

### Home (`toc: false`, full-bleed)
1. `.wfrc-hero`: "Data and models behind **Wasatch Front planning.**" Buttons: Explore tools, See the models.
2. `.wfrc-keyfacts`: models maintained (3), public tools live (computed from catalog), current TDM, current REMM, last updated. Numbers come from `releases.yml` and the catalog, not typed by hand.
3. Featured tools: `.wfrc-blocks`, six items from `featured: true`.
4. Choose your path: "I want to…" cards (explore a map, understand the models, get data, read the methods, see the code).
5. `.wfrc-updates`: latest 4 posts from the Updates listing.

### Explore
Quarto listing, `type: grid`, source `catalog.yml` (filtered to `kind in {app, map}`, `include: true`), categories from `area`, `kind` and topic, search on. Card: title, description, chip(s) (Live / Internal / Archived), Open button (url) and Repo link. Internal entries show a lock chip, text "Requires WFRC GitHub access", and link only to the repo.

### Models
- **Hub** page with three color blocks and a release table fed by `releases.yml` (current, beta, archive).
- **TDM** page: lighter; what it is, current/beta, calibration and run-result links, dashboard, and prominent links to `wftdm-docs`. Components grouped by stage (inputs, estimation, calibration, validation, post-processing) pulled from catalog `kind`.
- **REMM** and **BDM** pages: rich — purpose, inputs, method (Mermaid pipeline diagram), outputs, releases, validation, components, FAQ, "go deeper" link.
- Release history table per model from `releases.yml`; archived release links go to `wftdm-docs` (public), not the private releases repo.

### Reports, Data, Code
Listings over the same catalog with different filters. Code is a table listing (`type: table`) with columns: name, description, area, kind, status, last push. Sorting and search on. Archived and demo repos are hidden by default, with a "show archived" filter.

### Updates
`updates/` folder of short posts with `date`, `categories`; listing on the page, feed enabled (`feed: true`), latest 4 reused on Home.

### About / Contact
Rewrite About with verified facts only (drop unverified numbers such as TAZ count unless sourced). Contact: `analytics@wfrc.utah.gov` mailto, address, GitHub Issues links per tool. Form removed. Phone and office hours only if the team confirms.

## 5. Data model

Files at the site root (sources of truth): `catalog.yml`, `releases.yml`.

`catalog.yml` entry (see `catalog.draft.yml`, 185 entries pre-filled):

| Field | Meaning |
|---|---|
| `id` | Repo name, unique |
| `title`, `description` | Display text; **82 entries need a description** (`review: needs-description`) |
| `kind` | app, map, model, estimation, calibration, validation, input, post-process, scenario, geography, development, analysis, data, tool, library, demo, archive, other |
| `area` | tdm, remm, bdm, general |
| `status` | live, repo-only, archived |
| `internal` | true for private repos (Internal chip, access-gated link) |
| `url` | Live site, only if it returned 200 |
| `repo` | GitHub URL |
| `featured`, `include` | Home placement; hidden entries |
| `last-push`, `review` | Maintained by sync; `review` is editorial |

`releases.yml`: per model, a list of `{version, status: current|beta|archived, date, notes, docs-url}`.

Sync: a script (`scripts/sync-catalog.py` using `gh`) refreshes `status`, `url` reachability, `last-push` and appends new repos as `include: false, review: new`. It never overwrites hand-edited fields. Run on a schedule via GitHub Action that opens a PR.

## 6. Quarto implementation notes
- Listings: `listing: {contents: catalog.yml, type: grid | table, fields: [...], categories: true, sort: ..., filter-ui: true}`. Filtering by kind/area is done with separate listing pages or `include`/`exclude` via a small pre-render script that writes per-page YAML (`scripts/build-lists.py`) since listings can't filter by arbitrary field natively. Pre-render runs from `project: pre-render:`.
- Home counts and the release table use a Python or OJS cell reading the YAML.
- Updates: `listing` over `updates/*.qmd`, `feed: true`, `page-layout: full`.
- Components: `.wfrc-hero`, `.wfrc-band`, `.wfrc-blocks`, `.wfrc-keyfacts`, `.wfrc-updates`, `.wfrc-chip` from `wfrc-brand`.
- Checks: `axe: true` (already), plus a link-check CI step on the rendered `docs/` for internal links and the catalog `url` values.
- Share previews: `open-graph`, `twitter-card`, per-tool images optional (later).
- Freeze stays `auto`; no executing cells beyond catalog reads.

## 7. `wfrc-brand` additions (optional, later)
1. Status chips: `.wfrc-chip.live`, `.internal`, `.archived`.
2. A card-grid variant tuned for catalog listings (equal height, chip row, footer buttons).
3. A filter bar style for listing UI.
4. Lock icon for Internal entries.

## 8. Rollout phases
1. **Foundations:** catalog + releases data, sync script, listing pipeline, nav, footer, Contact.
2. **Core pages:** Home, Explore, Code, Reports, Data.
3. **Models:** TDM hub, REMM and BDM rich pages, release tables.
4. **Content:** About rewrite, first 3 Updates posts, fill missing descriptions.
5. **Quality:** link check CI, accessibility pass, mobile pass, redirects for old URLs (`/1-tdm/current/` etc.) using `aliases`.
6. Tag `v0.3.0` at the end of phase 2 and `v1.0.0` at launch.

## 9. Open items for you
1. Review `catalog.draft.yml`: featured set (11 pre-picked), `include: false` for demo/archive, and kind/area guesses.
2. Supply or approve descriptions for the 82 entries with none (I can draft them from READMEs).
3. Confirm release dates/notes for `releases.yml`.
4. Phone/office hours on Contact?
5. Old URLs: which existing paths must keep working?
