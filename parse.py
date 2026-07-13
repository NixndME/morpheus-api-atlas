#!/usr/bin/env python3
"""Parse a Morpheus apidocs scrape (markdown) into the Atlas endpoint data.

Usage:
    python3 parse.py [SOURCE.md] [OUT_DIR]

Defaults:
    SOURCE.md = ./morpheus_api_full.md
    OUT_DIR   = ./app/data      (writes endpoints.json and endpoints.js)
"""
import json, re, sys, os, collections

SRC = sys.argv[1] if len(sys.argv) > 1 else "morpheus_api_full.md"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "app", "data")

if not os.path.isfile(SRC):
    sys.exit(f"Source file not found: {SRC}\nUsage: python3 parse.py [SOURCE.md] [OUT_DIR]")
os.makedirs(OUT_DIR, exist_ok=True)

text = open(SRC, encoding="utf-8", errors="replace").read()
blocks = re.split(r"\n(?=# )", text)

hdr_re = re.compile(r"^# (.+?)\n+\*\*`(\w+) (/[^\s`]+)`\*\*", re.M)
src_re = re.compile(r"^> Source: (\S+)", re.M)
curl_method_re = re.compile(r"curl --request (\w+)")

def clean_curl(block_text, path):
    m = re.search(r"## Request Samples\n+```\n(.*?)```", block_text, re.S)
    if not m:
        return None
    lines = [ln for ln in m.group(1).splitlines() if not re.fullmatch(r"\d+", ln.strip())]
    curl = "\n".join(lines).strip()
    curl = re.sub(r"https://changeme", "{{BASE_URL}}", curl, flags=re.I)
    curl = re.sub(r"(--url )\{\{BASE_URL\}\}\S+", r"\1{{BASE_URL}}" + path, curl)
    if "authorization" not in curl.lower():
        n = re.sub(r"(--url [^\n]+\\\n)", r"\1  --header 'authorization: Bearer {{TOKEN}}' \\\n", curl, count=1)
        if "authorization" not in n.lower():
            n = re.sub(r"(--url [^\n]+)$", r"\1 \\\n  --header 'authorization: Bearer {{TOKEN}}'", n, count=1, flags=re.M)
        curl = n
    return curl

def story(method, path):
    verbs = {"GET": "Read-only, safe to run.", "POST": "Creates or triggers something new.",
             "PUT": "Updates existing state.", "DELETE": "Permanently removes it. No undo."}
    extra = verbs.get(method, "")
    if re.search(r"\{\w*[iI]d\}", path):
        extra += " Grab the ID from the matching list call first."
    return extra.strip()

endpoints, seen = [], set()
for b in blocks:
    h = hdr_re.match(b)
    if not h:
        continue
    title, hdr_method, path = h.group(1).strip(), h.group(2), h.group(3)
    cm = curl_method_re.search(b)
    method = (cm.group(1) if cm else hdr_method).upper()
    src = src_re.search(b)
    key = (method, path, title)
    if key in seen:
        continue
    seen.add(key)
    seg = path.split("/")
    group = seg[2] if len(seg) > 2 else "misc"
    endpoints.append({
        "t": title, "m": method, "p": path, "g": group,
        "s": story(method, path),
        "u": (src.group(1) if src else ""),
        "c": clean_curl(b, path) or f"curl --request {method} \\\n  --url {{{{BASE_URL}}}}{path} \\\n  --header 'authorization: Bearer {{{{TOKEN}}}}' \\\n  --header 'accept: application/json'"
    })

groups = collections.Counter(e["g"] for e in endpoints)
data = {"meta": {"count": len(endpoints), "groups": len(groups), "version": "9.0"},
        "endpoints": sorted(endpoints, key=lambda e: (e["g"], e["p"], e["m"]))}

json_path = os.path.join(OUT_DIR, "endpoints.json")
js_path = os.path.join(OUT_DIR, "endpoints.js")
json.dump(data, open(json_path, "w"), separators=(",", ":"))
open(js_path, "w").write("window.ATLAS_DATA=" + json.dumps(data, separators=(",", ":")) + ";")
print(f"endpoints={len(endpoints)} groups={len(groups)}")
print(f"wrote {json_path} and {js_path}")
