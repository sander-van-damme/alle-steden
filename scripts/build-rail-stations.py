#!/usr/bin/env python3
"""Regenerate the small CC0 Belgian passenger-station catalog from iRail CSV."""
import csv
import json
import re
import sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit("usage: build-rail-stations.py stations.csv upstream-commit")
file, commit = sys.argv[1:]
if not re.fullmatch(r"[0-9a-f]{40}", commit):
    raise SystemExit("Expected an exact upstream commit SHA")
rows = []
ids = set()
with open(file, encoding="utf-8-sig", newline="") as src:
    for row in csv.DictReader(src):
        if row["country-code"] != "be" or float(row["avg_stop_times"] or 0) <= 0:
            continue
        match = re.fullmatch(r"http://irail\.be/stations/NMBS/(\d{9})", row["URI"])
        lon, lat = (round(float(row[key]), 6) for key in ("longitude", "latitude"))
        name = (row["alternative-nl"] or row["name"]).strip()
        original = row["name"].strip()
        local = original.removeprefix(name + "/")
        if not match or match[1] in ids or not name or not original or not (2 <= lon <= 7 and 49 <= lat <= 52):
            raise SystemExit(f"Unexpected active Belgian CSV record: {row!r}")
        ids.add(match[1])
        rows.append([match[1], name, local if local != name else "", lon, lat])

if not 500 <= len(rows) <= 700:
    raise SystemExit("Unexpected number of Belgian stations; verify the upstream schema")
rows.sort(key=lambda x:x[0])
as_json = ",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows)
output = Path(__file__).resolve().parents[1] / "site/assets/rail-stations.generated.js"
output.write_text(f"// iRail/stations, CC0-1.0. Generated from {commit}/stations.csv.\n"
                  f"// Refresh with scripts/build-rail-stations.py; do not edit manually.\n"
                  f"export const railStations = [\n{as_json}\n];\n", encoding="utf-8")
