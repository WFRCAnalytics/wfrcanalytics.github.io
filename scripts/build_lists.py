"""Pre-render step: turn catalog.yml into Quarto listing data files.

Quarto listings cannot filter by arbitrary fields, so each page that shows a
slice of the catalog gets its own generated `items.yml` next to its .qmd.
Run automatically via `project: pre-render` in _quarto.yml, or by hand:
    python scripts/build_lists.py
"""
from pathlib import Path
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

# page folder -> predicate over a catalog entry (include: true is always required)
PAGES = {
    "explore": lambda e: e["kind"] in {"app", "map"},
    "reports": lambda e: e["kind"] in {
        "estimation", "calibration", "validation", "input", "post-process",
        "scenario", "analysis", "geography", "development"},
    "data": lambda e: e["kind"] == "data",
    "code": lambda e: True,
}


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
        "path": e.get("url") or e["repo"],
        "categories": cats,
        "date": e["last-push"],
    }


def sort_key(e):
    # live first, featured first, then most recently pushed
    return (e["status"] != "live", not e["featured"], _neg(e["last-push"]))


def _neg(d):
    return "".join(chr(255 - ord(c)) for c in str(d))


NL = chr(10)
FEATURED_ORDER = [  # home page shows the first eight that are public, live and featured
    "WF-TDM-Runs", "APP-wftdm-dashboard", "WF-TDM-Calibration",
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
        (len(live), "live apps and maps"),
        (len(shown), "repositories catalogued"),
        (current(releases, "tdm"), "current travel demand model"),
        (current(releases, "remm"), "current real-estate market model"),
    ]
    out = ["::: {.wfrc-keyfacts}"]
    for num, label in facts:
        out += ["::: {}", f"**{num}**", label, ":::"]
    out += [":::", ""]
    (ROOT / "_home-facts.md").write_text(NL.join(out), encoding="utf-8")

    by_id = {e["id"]: e for e in shown}
    picks = [by_id[i] for i in FEATURED_ORDER
             if i in by_id and by_id[i]["featured"] and not by_id[i]["internal"] and by_id[i].get("url")][:8]
    out = ['::: {.wfrc-blocks}']
    for n, e in enumerate(picks):
        out += [f"::: {{.wfrc-block{BLOCK_CLASS[n % 4]}}}", f"### {e['title']}", "",
                short(e["description"]), "",
                f"[Open]({e['url']}){{.btn .btn-sm target=\"_blank\"}} "
                f"[Source]({e['repo']}){{.btn .btn-sm .btn-outline-secondary target=\"_blank\"}}", ":::", ""]
    out += [":::", ""]
    (ROOT / "_home-featured.md").write_text(NL.join(out), encoding="utf-8")
    print(f"home: {len(facts)} facts, {len(picks)} featured")


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
    shown = sorted((e for e in catalog if e["include"]), key=sort_key)
    for page, pred in PAGES.items():
        rows = [item(e) for e in shown if pred(e)]
        out = ROOT / page / "items.yml"
        out.parent.mkdir(exist_ok=True)
        header = "# GENERATED by scripts/build_lists.py from catalog.yml -- do not edit.\n"
        out.write_text(header + yaml.safe_dump(rows, sort_keys=False, allow_unicode=True),
                       encoding="utf-8")
        print(f"{page}/items.yml: {len(rows)} items")


if __name__ == "__main__":
    main()
