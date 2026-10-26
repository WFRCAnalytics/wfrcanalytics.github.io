"""Refresh catalog.yml from GitHub (needs the `gh` CLI, logged in with org access).

Updates only machine-owned fields on existing entries:
    internal, last-push, status, url (live-site reachability)
New repos are appended with `include: false, review: new` for a human to curate.
Hand-edited fields (title, description, kind, area, featured, include, review) are never touched.

    python scripts/sync_catalog.py            # write catalog.yml
    python scripts/sync_catalog.py --dry-run  # report only
"""
import argparse
import concurrent.futures as cf
import json
import re
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
ORG = "WFRCAnalytics"
SKIP = {".github", "wfrcanalytics.github.io", "wfrc-brand"}
HEADER = """# WFRC Analytics catalog -- source of truth for Explore, Reports, Data, Code pages.
# Machine-owned (scripts/sync_catalog.py): internal, last-push, status, url.
# Hand-owned: title, description, kind, area, featured, include, review, live-url, no-shot, shot-click, shot-wait, shot-url.
# no-shot: true keeps the brand banner instead of a screenshot (for sites that need a sign-in, say).
# shot-click: CSS selector of a button to click before the screenshot (a splash screen the script cannot dismiss itself).
# shot-wait: milliseconds to wait before the screenshot, for apps that load slowly.
# shot-url: photograph this address instead of url (when the official page wraps the app in a frame).
# live-url: a live site that GitHub does not know about (for example one hosted on wfrc.utah.gov).
#   The sync checks it is reachable and copies it to url; otherwise url comes from the repo's
#   homepage setting or its GitHub Pages site.
# include: false hides an entry; review: new means a human has not curated it yet.
"""
FIELDS = ["id", "title", "description", "kind", "area", "status", "internal", "repo",
          "live-url", "no-shot", "shot-click", "shot-wait", "shot-url", "url", "featured", "include", "last-push", "review"]

KIND_BY_TDM = {"EST": "estimation", "CAL": "calibration", "VAL": "validation", "INP": "input",
               "PP": "post-process", "SCN": "scenario", "GEO": "geography", "DEV": "development"}
KIND_BY_PREFIX = {"APP": "app", "MAP": "map", "DATA": "data", "GIS": "analysis", "Housing": "analysis",
                  "TOOL": "tool", "PY": "library", "ATO": "analysis", "DEMO": "demo",
                  "ARCHIVE": "archive", "FORECAST": "analysis", "ABM": "input", "WF": "model"}


def run(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")


def guess(name):
    parts = name.replace("_", "-").split("-")
    prefix, second = parts[0], parts[1] if len(parts) > 1 else ""
    if prefix == "TDM":
        return KIND_BY_TDM.get(second, "other"), "tdm"
    if prefix.startswith("REMM"):
        return "model", "remm"
    if prefix == "BDM":
        return "model", "bdm"
    return KIND_BY_PREFIX.get(prefix, "other"), "general"


def title_of(name):
    t = name.replace("_", "-")
    t = re.sub(r"^(APP|MAP|TDM|REMM|BDM|DATA|GIS|TOOL|PY|DEMO|ARCHIVE|WF)-", "", t)
    t = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", t)
    return t.replace("-", " ")


def reachable(url, tries=2):
    for _ in range(tries):  # one retry: cold-starting apps (e.g. shinyapps.io) can time out
        code = run("curl", "-sL", "-m", "30", "-o", "/dev/null", "-w", "%{http_code}", url).stdout
        if code.startswith(("2", "3")):
            return True
    return False


def live_url(repo, manual=None):
    """The hand-entered live-url, else the repo homepage, else its Pages URL; None if none is reachable."""
    home = repo.get("homepageUrl")
    pages = run("gh", "api", f"repos/{ORG}/{repo['name']}/pages", "--jq", ".html_url")
    for url in filter(None, [manual, home, pages.stdout.strip() if pages.returncode == 0 else None]):
        if reachable(url):
            return url
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    out = run("gh", "repo", "list", ORG, "--limit", "500", "--json",
              "name,visibility,description,homepageUrl,isArchived,pushedAt")
    if out.returncode:
        raise SystemExit(f"gh failed: {out.stderr}")
    repos = {r["name"]: r for r in json.loads(out.stdout) if r["name"] not in SKIP}
    path = ROOT / "catalog.yml"
    catalog = yaml.safe_load(path.read_text(encoding="utf-8"))
    by_id = {e["id"]: e for e in catalog}

    with cf.ThreadPoolExecutor(12) as ex:
        urls = dict(zip(repos, ex.map(lambda r: live_url(r, by_id.get(r["name"], {}).get("live-url")), repos.values())))

    changed, added = [], []
    for name, r in repos.items():
        e = by_id.get(name)
        if e is None:
            kind, area = guess(name)
            e = {"id": name, "title": title_of(name), "description": r["description"] or "",
                 "kind": kind, "area": area, "featured": False, "include": False, "review": "new",
                 "repo": f"https://github.com/{ORG}/{name}"}
            catalog.append(e)
            added.append(name)
        before = (e.get("internal"), e.get("last-push"), e.get("status"), e.get("url"))
        e["internal"] = r["visibility"] == "PRIVATE"
        e["last-push"] = r["pushedAt"][:10]
        url = urls[name]
        e.pop("url", None)
        if url:
            e["url"] = url
        e["status"] = "archived" if r["isArchived"] or e["kind"] == "archive" else \
                      ("live" if url else "repo-only")
        if name not in added and before[0] != e["internal"] or before[2:] != (e["status"], e.get("url")):
            changed.append(f"{name}: {before[2]} -> {e['status']}")

    missing = sorted(set(by_id) - set(repos))
    print(f"{len(repos)} repos; {len(added)} new; {len(changed)} status/url/visibility changes; "
          f"{len(missing)} in catalog but not on GitHub")
    for line in changed:
        print("  changed:", line)
    for n in added:
        print("  new (hidden, review: new):", n)
    for n in missing:
        print("  missing on GitHub:", n)
    if args.dry_run:
        return
    catalog.sort(key=lambda e: e["id"].lower())
    rows = [{k: e[k] for k in FIELDS if k in e} for e in catalog]
    path.write_text(HEADER + yaml.safe_dump(rows, sort_keys=False, allow_unicode=True, width=1000),
                    encoding="utf-8")


if __name__ == "__main__":
    main()
