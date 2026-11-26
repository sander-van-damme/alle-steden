#!/usr/bin/env python3
"""Regenerate the offline Belgian boundary subset from a verified AdminVector GeoPackage.
Requires Python stdlib and GDAL/GEOS ogr2ogr. See docs/route-city-boundaries.md.
"""
from argparse import ArgumentParser
import json
from pathlib import Path
import re
from subprocess import run
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]


def polygons(geometry):
    if not geometry:
        return []
    kind = geometry["type"]
    if kind == "Polygon":
        return [geometry["coordinates"]]
    if kind == "MultiPolygon":
        return geometry["coordinates"]
    if kind == "GeometryCollection":
        return [poly for member in geometry["geometries"] for poly in polygons(member)]
    return []  # Degenerate line remnants after inset have zero area.


def delta(number):
    value = number * 2 if number >= 0 else -number * 2 - 1
    chars = []
    while value >= 32:
        chars.append(chr((value & 31 | 32) + 63))
        value >>= 5
    return "".join(chars) + chr(value + 63)


def encode(ring):
    if len(ring) < 4 or ring[0] != ring[-1]:
        raise ValueError("Unclosed source ring")
    previous, parts = (0, 0), []
    for lon, lat in ring[:-1]:
        point = (round(lon * 100_000), round(lat * 100_000))
        if point != previous:
            parts += [delta(point[0] - previous[0]), delta(point[1] - previous[1])]
        previous = point
    if len(parts) < 6:
        raise ValueError("Degenerate source ring")
    return "".join(parts)


def subset(source, temp, layer, codes):
    metric, out = temp / f"{layer}.gpkg", temp / f"{layer}.geojson"
    run(["ogr2ogr", "-f", "GPKG", str(metric), str(source), layer, "-select", "niscode",
         "-dim", "XY", "-makevalid", "-t_srs", "EPSG:3812"], check=True)
    run(["ogr2ogr", "-f", "GeoJSON", str(out), str(metric), "-dialect", "SQLITE", "-sql",
         f"SELECT niscode, ST_SimplifyPreserveTopology(ST_Buffer(shape,-35),12) AS geometry FROM {layer}",
         "-t_srs", "EPSG:4326", "-lco", "RFC7946=YES", "-lco", "COORDINATE_PRECISION=5"], check=True)
    result = {}
    for feature in json.loads(out.read_text())["features"]:
        code = feature["properties"]["niscode"]
        if code not in codes:
            continue
        selected = polygons(feature["geometry"])
        if code in result or not selected:
            raise ValueError(f"Invalid or duplicate shape: {code}")
        result[code] = [[encode(ring) for ring in poly] for poly in selected]
    if set(result) != codes:
        raise ValueError(f"Unmatched NIS: {codes - set(result)}")
    return dict(sorted(result.items()))


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("gpkg", type=Path)
    parser.add_argument("--revision", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.revision):
        parser.error("Expected ISO revision date")
    codes = []
    for path in (ROOT / "cities").glob("*.ttl"):
        matches = re.findall(r'wdt:P1567 "(\d{5})"\s*;', path.read_text())
        if len(matches) != 1:
            raise ValueError(f"{path.name}: expected one NIS code")
        codes.append(matches[0])
    if not codes or len(set(codes)) != len(codes):
        raise ValueError("Missing or duplicate city codes")
    with TemporaryDirectory(prefix="alle-steden-adminvector-") as temp:
        data = dict(version=1, sourceDate=args.revision,
                    municipalities=subset(args.gpkg.resolve(), Path(temp), "municipality", set(codes)),
                    regions=subset(args.gpkg.resolve(), Path(temp), "region", {"02000", "03000", "04000"}))
    (ROOT / "data" / "route-boundaries.json").write_text(json.dumps(data, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
