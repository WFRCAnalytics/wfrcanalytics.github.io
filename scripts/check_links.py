"""Check links in the rendered site (default: _site). Exit code 1 if any internal link is broken.

    python scripts/check_links.py [site-dir] [--external]

Internal links are resolved against the rendered files. With --external, every unique
http(s) link is requested once (GET, 30 s timeout, one retry); failures are reported
but only internal breaks fail the run, since third-party sites flake.
"""
import concurrent.futures as cf
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urldefrag, urljoin, urlparse

SITE_HOST = "wfrcanalytics.github.io"
# Private repos answer 404 to anonymous requests; sites below block automated clients.
SKIP_EXTERNAL_HOSTS = {"www.linkedin.com", "twitter.com", "x.com", "www.facebook.com", "www.instagram.com"}


def private_repo_urls():
    import yaml
    catalog = yaml.safe_load(Path(__file__).resolve().parent.parent.joinpath("catalog.yml").read_text(encoding="utf-8"))
    return {e["repo"] for e in catalog if e["internal"]}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ("href", "src"):
            if a.get(key) and tag in {"a", "img", "script", "link", "source", "iframe"}:
                self.links.append(a[key])


def resolve(site, page, link):
    """Return (kind, target) where kind is 'skip', 'internal' or 'external'."""
    link, _ = urldefrag(link.strip())
    if not link or link.startswith(("mailto:", "tel:", "javascript:", "data:")):
        return "skip", None
    parsed = urlparse(link)
    if parsed.scheme in ("http", "https"):
        if parsed.netloc != SITE_HOST:
            return "external", link
        path = unquote(parsed.path).lstrip("/")
        local = site / path
        if not (local.is_dir() and (local / "index.html").exists() or local.exists() or path == ""):
            return "external", link  # another repo's GitHub Pages site under the same host
    elif parsed.scheme:
        return "skip", None
    else:
        path = urljoin("/" + page.relative_to(site).as_posix(), parsed.path or ".")
    path = unquote(path).lstrip("/")
    target = site / path
    if target.is_dir() or path == "" or path.endswith("/"):
        target = target / "index.html"
    return "internal", target


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    site = Path(args[0] if args else "_site").resolve()
    check_external = "--external" in sys.argv
    broken, external = [], {}
    private = private_repo_urls()
    for page in site.rglob("*.html"):
        if "site_libs" in page.parts:
            continue
        text = page.read_text(encoding="utf-8", errors="ignore")
        parser = Links()
        parser.feed(text)
        for link in parser.links:
            kind, target = resolve(site, page, link)
            if kind == "internal" and not target.exists():
                broken.append((page.relative_to(site).as_posix(), link))
            elif (kind == "external" and target not in private
                  and urlparse(target).netloc not in SKIP_EXTERNAL_HOSTS):
                external.setdefault(target, set()).add(page.relative_to(site).as_posix())
    print(f"internal broken: {len(broken)}")
    for page, link in sorted(set(broken)):
        print(f"  {page}: {link}")

    if check_external:
        def probe(url):
            for _ in range(2):
                code = subprocess.run(["curl", "-sL", "-m", "30", "-o", "/dev/null", "-w", "%{http_code}", url],
                                      capture_output=True, text=True).stdout
                if code.startswith(("2", "3")):
                    return url, code
            return url, code
        with cf.ThreadPoolExecutor(10) as ex:
            bad = [(u, c) for u, c in ex.map(probe, sorted(external)) if not c.startswith(("2", "3"))]
        print(f"external checked: {len(external)}; failing: {len(bad)}")
        for url, code in bad:
            print(f"  {code} {url}  <- {', '.join(sorted(external[url])[:3])}")
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
