"""Pre-render step: turn catalog.yml into Quarto listing data files.

Quarto listings cannot filter by arbitrary fields, so each page that shows a
slice of the catalog gets its own generated `items.yml` next to its .qmd.
Run automatically via `project: pre-render` in _quarto.yml, or by hand:
    python scripts/build_lists.py
"""
from pathlib import Path
import json
import yaml

ROOT = Path(__file__).resolve().parent.parent

KIND_LABEL = {
    "app": "App", "map": "Map", "model": "Model", "estimation": "Estimation",
    "calibration": "Calibration", "validation": "Validation", "input": "Input data",
    "post-process": "Post-processing", "scenario": "Scenario", "geography": "Geography",
    "development": "Development", "analysis": "Analysis", "data": "Data",
    "tool": "Tool", "library": "Library", "demo": "Demo", "archive": "Archive",
    "other": "Other",
}
AREA_LABEL = {"tdm": "TDM", "remm": "REMM", "bdm": "BDM", "general": "General"}
STATUS_LABEL = {"live": "Live", "repo-only": "Repository", "archived": "Archived"}

# output file (relative to project root, no extension) -> predicate over a catalog entry.
# include: true is always required.
PAGES = {
    "explore/items": lambda e: e["kind"] in {"app", "map"},
    "reports/items": lambda e: e["kind"] in {
        "estimation", "calibration", "validation", "input", "post-process",
        "scenario", "analysis", "geography", "development"},
    "data/items": lambda e: e["kind"] == "data",
    "code/items": lambda e: True,
    # components listed at the bottom of each model page
    "models/tdm-items": lambda e: e["area"] == "tdm",
    "models/remm-items": lambda e: e["area"] == "remm",
    "models/bdm-items": lambda e: e["area"] == "bdm",
}


# Card banner per kind. The images ship with the wfrc-brand extension (assets/cards/).
KIND_BANNER = {
    "app": "navy", "map": "teal", "model": "mid", "data": "brick", "tool": "bright", "library": "bright",
    "estimation": "mid", "calibration": "bright", "validation": "teal", "input": "navy",
    "post-process": "mid", "scenario": "teal", "geography": "bright", "development": "navy",
    "analysis": "brick", "demo": "bright", "archive": "mid", "other": "mid",
}
DETAILS = yaml.safe_load((ROOT / "tool-details.yml").read_text(encoding="utf-8")) or {}


def card_image(e, prefix):
    """Screenshot of the live tool when one has been captured, otherwise the brand banner for its kind."""
    shot = ROOT / "assets" / "shots" / f"{e['id']}.jpg"
    if shot.exists() and not e.get("no-shot"):
        return f"{prefix}assets/shots/{e['id']}.jpg"
    return f"{prefix}_extensions/wfrc-brand/assets/cards/{KIND_BANNER[e['kind']]}.svg"


def item(e):
    """One Quarto listing item. Live site wins; otherwise link to the repo."""
    cats = [STATUS_LABEL[e["status"]]]
    if e["internal"]:
        cats.append("Internal")
    cats.append(KIND_LABEL[e["kind"]])
    if e["area"] != "general":
        cats.append(AREA_LABEL[e["area"]])
    desc = e["description"] or "No description yet."
    if e["internal"]:
        desc = desc.rstrip(".") + ". Requires WFRC GitHub access."
    return {
        "title": e["title"],
        "description": desc,
        "path": f"../tools/{e['id']}.html" if e["id"] in DETAILS else (e.get("url") or e["repo"]),
        "categories": cats,
        "date": e["last-push"],
        "image": card_image(e, "../"),
    }


def sort_key(e):
    # live first, featured first, then most recently pushed
    return (e["status"] != "live", not e["featured"], _neg(e["last-push"]))


def _neg(d):
    return "".join(chr(255 - ord(c)) for c in str(d))


NL = chr(10)
FEATURED_ORDER = [  # home page shows the first eight that are public, live and featured
    "WF-TDM-Runs", "APP-wftdm-dashboard", "vizTool", "WF-TDM-Calibration",
    "APP-Commute-Explorer", "MAP-Housing-ATO-Calculator-Updated", "GIS_SE2025_H3",
    "MAP-Statewide-ATO-VMT", "APP-WFRC-Commute-Patterns", "REMM-Result-Review-Tool",
]
BLOCK_CLASS = ["", " .mid", " .teal", " .brick"]


def short(text, limit=150):
    """First sentence, trimmed to `limit` characters on a word boundary."""
    first = text.split(". ")[0].rstrip(".")
    if len(first) > limit:
        first = first[:limit].rsplit(" ", 1)[0] + "..."
    return first + ("." if not first.endswith("...") else "")


def current(releases, model):
    cur = [r["version"] for r in releases[model]["releases"] if r["status"] == "current"]
    return cur[0] if cur else "n/a"


def home_snippets(catalog, releases):
    """Markdown includes for the Home page: key facts and the featured-tools blocks."""
    shown = [e for e in catalog if e["include"]]
    live = [e for e in shown if e["kind"] in {"app", "map"} and e["status"] == "live"]
    facts = [
        (len(live), "cataloged webapps"),
        (len(shown), "repositories cataloged"),
        (current(releases, "tdm"), "current travel demand model"),
        (current(releases, "remm"), "current real-estate market model"),
    ]
    out = ["::: {.wfrc-blocks .glance}"]
    for n, (num, label) in enumerate(facts):
        out += [f"::: {{.wfrc-block{BLOCK_CLASS[n % 4]}}}", f"[{num}]{{.glance-num}}", "", label, ":::", ""]
    out += [":::", ""]
    (ROOT / "_home-facts.md").write_text(NL.join(out), encoding="utf-8")

    by_id = {e["id"]: e for e in shown}
    picks = [by_id[i] for i in FEATURED_ORDER
             if i in by_id and by_id[i]["featured"] and not by_id[i]["internal"] and by_id[i].get("url")][:8]
    out = ["::: {.feature-grid}"]
    for e in picks:
        banner = KIND_BANNER[e["kind"]]
        shot = ROOT / "assets" / "shots" / f"{e['id']}.jpg"
        if e.get("no-shot"):
            shot = ROOT / "assets" / "shots" / "__none__.jpg"
        style = f' style="background-image:url(\'assets/shots/{e["id"]}.jpg\')"' if shot.exists() else ""
        out += [f"::: {{.feature-card .banner-{banner}}}", f"::: {{.feature-banner{' .has-shot' if shot.exists() else ''}{style}}}", ":::", "",
                "::: {.feature-body}", f"[{KIND_LABEL[e['kind']]}]{{.wfrc-chip}}", "",
                f"### {e['title']}", "",
                short(e["description"]), "",
                "::: {.feature-actions}",
                f"[Open]({e['url']}){{.btn .btn-primary .btn-sm target=\"_blank\"}} " +
                (f"[Details](tools/{e['id']}.qmd){{.btn .btn-outline-primary .btn-sm}}" if e["id"] in DETAILS
                 else f"[Source]({e['repo']}){{.btn .btn-outline-primary .btn-sm target=\"_blank\"}}"),
                ":::", ":::", ":::", ""]
    out += [":::", ""]
    (ROOT / "_home-featured.md").write_text(NL.join(out), encoding="utf-8")
    print(f"home: {len(facts)} facts, {len(picks)} featured")


SITE_PAGES = [  # (title, path) -- the pages every visitor might be looking for
    ("Home", "/"), ("Explore apps and maps", "/explore/"), ("Models", "/models/"),
    ("Travel Demand Model", "/models/tdm.html"), ("Real-Estate Market Model", "/models/remm.html"),
    ("Bike Demand Model", "/models/bdm.html"), ("Get the model", "/models/get-the-model.html"), ("Reports and methods", "/reports/"), ("Data", "/data/"),
    ("Code", "/code/"), ("Updates", "/updates/"), ("About", "/about.html"),
    ("Contact", "/contact/"), ("Terms of use", "/terms/"),
]


def site_index(catalog):
    """Small JSON used by the 404 page to suggest where a mistyped URL was meant to go."""
    rows = [{"title": t, "url": u, "id": u.strip("/") or "home", "kind": "Page"} for t, u in SITE_PAGES]
    for e in catalog:
        if not e["include"] or e["internal"]:
            continue
        suffix = " (archived)" if e["status"] == "archived" else ""
        rows.append({"title": e["title"] + suffix, "url": e.get("url") or e["repo"], "id": e["id"],
                     "kind": KIND_LABEL[e["kind"]], "desc": (e["description"] or "")[:160],
                     **({"f": 1} if e["featured"] and e["status"] == "live" else {})})
    out = ROOT / "assets" / "data" / "site-index.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")
    print(f"site-index.json: {len(rows)} entries")


def pretty_month(date, note=None):
    """'2025-11' -> 'Nov 2025' (plus an optional note); missing dates show a dash."""
    if not date:
        return "&mdash;"
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    year, month = str(date).split("-")[:2]
    return f"{months[int(month) - 1]} {year}" + (f" ({note.lower()})" if note else "")


def long_date(iso):
    months = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
              "October", "November", "December"]
    y, m, d = str(iso).split("-")
    return f"{months[int(m) - 1]} {int(d)}, {y}"


def tool_pages(catalog):
    """tools/<id>.qmd for every tool in tool-details.yml: facts are hand-written, the rest comes from the catalog."""
    out_dir = ROOT / "tools"
    out_dir.mkdir(exist_ok=True)
    by_id = {e["id"]: e for e in catalog}
    wanted = set()
    for tid, d in DETAILS.items():
        e = by_id[tid]
        assert e.get("url") and not e["internal"], f"{tid}: detail pages are for live public tools"
        wanted.add(f"{tid}.qmd")
        shot = ROOT / "assets" / "shots" / f"{tid}.jpg"
        has_shot = shot.exists() and not e.get("no-shot")
        year = str(e["last-push"])[:4]
        lines = ["---", f"title: {json.dumps(e['title'])}", f"description: {json.dumps(d['question'])}", "toc: false"]
        if has_shot:
            lines.append(f"image: ../assets/shots/{tid}.jpg")
        lines += ["---", ""]
        if has_shot:
            lines += [f"[![](../assets/shots/{tid}.jpg){{.tool-shot fig-alt=\"Screenshot of {e['title']}; opens the tool in a new tab\"}}]({e['url']}){{target=_blank}}", ""]
        lines += [f"[Open the tool]({e['url']}){{.btn .btn-primary target=_blank}} "
                  f"[Source code]({e['repo']}){{.btn .btn-outline-primary target=_blank}}", "",
                  "## What it answers", "", f"**{d['question']}**", "", f"*For:* {d['audience']}", "",
                  "## What is inside", ""]
        lines += [f"- {x}" for x in d["inside"]] + ["", "## Where the data comes from", ""]
        lines += [f"- {x}" for x in d["data"]] + ["", "## About this tool", "",
                  "| | |", "|---|---|",
                  f"| Type | {KIND_LABEL[e['kind']]} |", f"| Status | Live |",
                  f"| Last updated | {long_date(e['last-push'])} (latest change to the source code) |",
                  "| Terms | WFRC's material is licensed CC BY 4.0; data from other sources keeps its own terms. "
                  "See the [terms of use](../terms/index.qmd). |", "",
                  "## How to cite", "", "::: {.cite}",
                  f"Wasatch Front Regional Council. ({year}). *{e['title']}* [Online tool]. {e['url']}", ":::", "",
                  "## Questions or problems?", "",
                  f"Email [analytics@wfrc.utah.gov](mailto:analytics@wfrc.utah.gov) or [open an issue]({e['repo']}/issues){{target=_blank}} "
                  "on the source repository. See also [all apps and maps](../explore/index.qmd).", ""]
        (out_dir / f"{tid}.qmd").write_text(NL.join(lines), encoding="utf-8")
    for old in out_dir.glob("*.qmd"):          # a tool dropped from tool-details.yml loses its page
        if old.name not in wanted:
            old.unlink()
    print(f"tools/: {len(wanted)} detail pages")


def release_tables(releases):
    """One markdown table per model, included by the model pages."""
    for key, model in releases.items():
        rows = ["| Version | Status | Released | Documentation |", "|---|---|---|---|"]
        for r in model["releases"]:
            doc = f"[Open]({r['docs-url']}){{target=_blank}}" if r["docs-url"] else "&mdash;"
            rows.append(f"| {str(r['version']).capitalize()} | {r['status'].capitalize()} | "
                        f"{pretty_month(r['date'], r.get('note'))} | {doc} |")
        out = ROOT / "models" / f"_releases-{key}.md"
        out.parent.mkdir(exist_ok=True)
        out.write_text(NL.join(rows) + NL, encoding="utf-8")
    # directory metadata: lets pages write {{< meta tdm-current >}}
    meta = {f"{key}-current": current(releases, key) for key in releases}
    (ROOT / "models" / "_metadata.yml").write_text(
        "# GENERATED by scripts/build_lists.py from releases.yml" + NL + yaml.safe_dump(meta),
        encoding="utf-8")


def home_updates():
    """Latest published posts as a Home page include; empty file when there are none."""
    posts = []
    for f in sorted((ROOT / "updates" / "posts").glob("*.qmd")):
        head = yaml.safe_load(f.read_text(encoding="utf-8").split("---")[1])
        if head.get("draft"):
            continue
        posts.append((str(head["date"]), head["title"], f.stem))
    posts.sort(reverse=True)
    lines = []
    if posts:
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        lines = ["## Latest updates", "", "::: {.wfrc-updates}"]
        for date, title, stem in posts[:4]:
            _, m, d = date.split("-")
            lines += [f"[{months[int(m) - 1]} {d}]{{.wfrc-date}} [{title}](updates/posts/{stem}.qmd)", ""]
        lines += [":::", "", "::: {.mt-4}", "[All updates](updates/index.qmd){.btn .btn-primary}", ":::", ""]
    (ROOT / "_home-updates.md").write_text(NL.join(lines), encoding="utf-8")
    print(f"home: {len(posts)} published updates")


def main():
    catalog = yaml.safe_load((ROOT / "catalog.yml").read_text(encoding="utf-8"))
    ids = [e["id"] for e in catalog]
    assert len(ids) == len(set(ids)), "duplicate ids in catalog.yml"
    for e in catalog:
        assert e["kind"] in KIND_LABEL, f"{e['id']}: unknown kind {e['kind']}"
        assert e["area"] in AREA_LABEL, f"{e['id']}: unknown area {e['area']}"
        assert e["status"] in STATUS_LABEL, f"{e['id']}: unknown status {e['status']}"
    releases = yaml.safe_load((ROOT / "releases.yml").read_text(encoding="utf-8"))
    home_snippets(catalog, releases)
    home_updates()
    site_index(catalog)
    tool_pages(catalog)
    shown = sorted((e for e in catalog if e["include"]), key=sort_key)
    release_tables(releases)
    for page, pred in PAGES.items():
        rows = [item(e) for e in shown if pred(e)]
        out = ROOT / f"{page}.yml"
        out.parent.mkdir(exist_ok=True)
        header = "# GENERATED by scripts/build_lists.py from catalog.yml -- do not edit.\n"
        out.write_text(header + yaml.safe_dump(rows, sort_keys=False, allow_unicode=True),
                       encoding="utf-8")
        print(f"{page}.yml: {len(rows)} items")


if __name__ == "__main__":
    main()
