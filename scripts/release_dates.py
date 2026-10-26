"""Show the GitHub evidence for TDM release dates next to the dates in releases.yml.

    python scripts/release_dates.py

Needs the `gh` CLI with access to the (private) WF-TDM repositories. It only prints; update
releases.yml by hand, because the two repositories disagree for some versions (a release can be
published in one repo months after it was first tagged in the other).
"""
import json
import re
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
ORG = "WFRCAnalytics"


def releases(repo):
    out = subprocess.run(["gh", "api", f"repos/{ORG}/{repo}/releases?per_page=100"],
                         capture_output=True, text=True, encoding="utf-8")
    if out.returncode:
        raise SystemExit(f"gh failed for {repo}: {out.stderr}")
    return json.loads(out.stdout)


def version_of(tag):
    m = re.match(r"v(\d+\.\d+\.\d+)", tag)
    return m.group(1) if m else tag


def main():
    official = {version_of(r["tag_name"]): r["published_at"][:10] for r in releases("WF-TDM-Official-Releases")}
    dev = {}
    for r in releases("WF-TDM-Development"):       # created_at = date of the tagged commit
        dev.setdefault(version_of(r["tag_name"]), (r["created_at"][:10], r["tag_name"]))
    ours = {str(e["version"]): e["date"] for e in
            yaml.safe_load((ROOT / "releases.yml").read_text(encoding="utf-8"))["tdm"]["releases"]}
    print(f"{'version':9} {'official published':19} {'dev tag commit':15} {'releases.yml':12}")
    for v in sorted(set(official) | set(dev) | set(ours), key=lambda x: [int(p) for p in x.split(".")], reverse=True):
        d = dev.get(v, ("", ""))[0]
        print(f"{v:9} {official.get(v, '-'):19} {d or '-':15} {ours.get(v) or '-':12}")


if __name__ == "__main__":
    main()
