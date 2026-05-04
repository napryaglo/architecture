#!/usr/bin/env python3
"""drawio (mxGraphModel) renderer.

Reads a compiled scene graph (output of `markup_compiler`) plus the compiled
architecture YAML (the model), and emits a `.drawio` file. The drawio format
is mxgraph XML — an `mxfile` wrapping an `mxGraphModel` of `mxCell` records.
Each composite element (location, building-block, component, actor) becomes
one vertex cell; each connector becomes one edge cell. Bounding boxes are
extracted from the scene graph's `border` rects; labels are pulled from the
model so the drawio file is editable with sensible names.

What's preserved:
  - Every component/actor/block/location as a vertex with x/y/w/h.
  - Every connector as an edge between source and target ids.
  - Connector waypoints (the polyline's intermediate points).
  - Per-kind styling (different fill/stroke for actor vs component vs location).

What's lossy:
  - Animated pulses, the orange highlight class, scenario-filter machinery —
    these are viewer-side, not part of the static export.
  - The custom stealth chevron arrowheads (drawio uses its own arrow shapes).
  - Component icons (drawio shape-set is different; we use plain rects with
    labels for portability).

Usage:
    python visual_engine/drawio_renderer/render.py <compiled-scene>.markup \
        --model <compiled-arch>.yaml -o <output>.drawio
"""
from __future__ import annotations
import argparse
import base64
import re
import sys
import urllib.parse
import xml.sax.saxutils as saxutils
from pathlib import Path

import yaml


# ── Style registry ──────────────────────────────────────────────────
# One drawio style per element kind. Colors mirror the topology
# renderer's palette so a drawio export feels like a sibling of the
# SVG it was derived from.
#
# Components and actors are rendered as `shape=image` cells so the
# scene-graph icons survive the export. The icon style is built per
# cell (the URL-encoded SVG goes into `image=...`), so the entry below
# is the prefix everything else shares. `verticalLabelPosition=bottom`
# plus `verticalAlign=top` puts the component label directly below the
# icon — same shape as the architecture view's component template.
ICON_STYLE_PREFIX = (
    "shape=image;imageAspect=0;"
    "verticalLabelPosition=bottom;verticalAlign=top;"
    "labelPosition=center;align=center;"
    "fontSize=10;fontFamily=Helvetica;fontColor=#22211E;"
)

# Fallback styles (no icon found) and styles for kinds that don't carry
# icons in the architecture (locations, blocks).
KIND_STYLES_FALLBACK = {
    "component": (
        "rounded=0;whiteSpace=wrap;html=1;"
        "fillColor=#FFFFFF;strokeColor=#8A8780;strokeWidth=1;"
        "fontSize=10;fontFamily=Helvetica;align=center;verticalAlign=bottom;"
        "spacingBottom=4;"
    ),
    "actor": (
        "rounded=4;whiteSpace=wrap;html=1;"
        "fillColor=#E2F1F4;strokeColor=#3AA6B9;strokeWidth=1;"
        "fontSize=10;fontFamily=Helvetica;align=center;verticalAlign=bottom;"
        "spacingBottom=4;"
    ),
    "building-block": (
        "rounded=0;whiteSpace=wrap;html=1;"
        "fillColor=none;strokeColor=#8A8780;strokeWidth=1;"
        "fontSize=11;fontFamily=Helvetica;fontStyle=1;align=left;verticalAlign=top;"
        "spacingLeft=8;spacingTop=4;"
    ),
    "location": (
        "rounded=0;whiteSpace=wrap;html=1;"
        "fillColor=none;strokeColor=#3AA6B9;strokeWidth=1;dashed=0;"
        "fontSize=12;fontFamily=Helvetica;fontStyle=1;align=left;verticalAlign=top;"
        "spacingLeft=12;spacingTop=6;fontColor=#3AA6B9;"
    ),
}

EDGE_STYLE_STRAIGHT = (
    "endArrow=classic;html=1;rounded=0;"
    "strokeColor=#8A8780;strokeWidth=1;"
    "edgeStyle=none;"
)
EDGE_STYLE_ORTHOGONAL = (
    "endArrow=classic;html=1;rounded=0;"
    "strokeColor=#8A8780;strokeWidth=1;"
    "edgeStyle=orthogonalEdgeStyle;"
)

# Composite element kinds the scene graph uses. Drawio cells are emitted
# only for these; other `from-element` values (stack-panel, border,
# items-presenter, …) are skeletal and not first-class.
COMPOSITE_KINDS = {"location", "building-block", "component", "actor"}


def esc(s):
    return saxutils.escape(str(s), {'"': '&quot;', "'": '&apos;'})


# ── Model lookup ─────────────────────────────────────────────────────

def normalise_label(raw, fallback):
    """Labels may be a string or list-of-strings. Returns the label as
    PLAIN TEXT — possibly with embedded HTML `<br/>` for multi-line.
    The caller XML-escapes before injecting into the `value="..."`
    attribute, so the `<br/>` becomes `&lt;br/&gt;` in the file.
    Drawio decodes that back to literal `<br/>` and (because the cell
    style sets `html=1`) renders it as an HTML line break."""
    if isinstance(raw, list):
        return "<br/>".join(str(x) for x in raw if x is not None)
    if isinstance(raw, str):
        return raw
    return fallback


def build_id_index(arch):
    """Flat lookup `id -> (kind, label)` covering everything the drawio
    cells need — actors, locations, blocks, components."""
    idx = {}
    for aid, a in (arch.get("actors") or {}).items():
        if isinstance(a, dict):
            idx[aid] = ("actor", normalise_label(a.get("label"), aid))
    for lid, l in (arch.get("locations") or {}).items():
        if isinstance(l, dict):
            idx[lid] = ("location", normalise_label(l.get("label"), lid))
    for bid, b in (arch.get("blocks") or {}).items():
        if not isinstance(b, dict):
            continue
        idx[bid] = ("building-block", normalise_label(b.get("label"), bid))
        for cid, c in (b.get("components") or {}).items():
            if isinstance(c, dict):
                idx[cid] = ("component", normalise_label(c.get("label"), cid))
    for loc, comps in (arch.get("components") or {}).items():
        for cid, c in (comps or {}).items():
            if isinstance(c, dict):
                idx[cid] = ("component", normalise_label(c.get("label"), cid))
    return idx


# ── Bounding-box extraction from scene graph ─────────────────────────

def first_border_bbox(node):
    """A composite element's outer rectangle is its first `border` child's
    `rect`. Walk the canvas children until we find one. Returns (x, y, w, h)
    or None if there's no border (rare — every composite template emits one)."""
    if isinstance(node, dict):
        if "border" in node:
            b = node["border"]
            r = b.get("rect")
            if r is not None:
                return (r["x"], r["y"], r["width"], r["height"])
        # Recurse only into containers (canvas/group), not into leaf primitives —
        # the border we want is the OUTER one for this composite, so we stop at
        # the first match in document order rather than scanning every descendant.
        for kind in ("canvas", "group"):
            if kind in node:
                container = node[kind]
                for child in container.get("children", []) or []:
                    bbox = first_border_bbox(child)
                    if bbox is not None:
                        # Stop at the first border we see — it bounds this
                        # composite, not anything nested inside.
                        return bbox
                return None
    return None


def union_bbox(node):
    """Fallback when there's no border: union of all leaf primitives'
    rectangles. Used for actors (which have no border in their template,
    only an icon + label stack)."""
    boxes = []

    def walk(n):
        if not isinstance(n, dict):
            return
        if "rect" in n:
            r = n["rect"]
            boxes.append((r["x"], r["y"], r["x"] + r["width"], r["y"] + r["height"]))
        elif "image" in n:
            i = n["image"]
            boxes.append((i["x"], i["y"], i["x"] + i["width"], i["y"] + i["height"]))
        elif "text" in n:
            t = n["text"]
            x, y = t.get("x", 0), t.get("y", 0)
            w, h = t.get("width") or 0, t.get("height") or 0
            anchor = t.get("text-anchor", "start")
            x0 = x - w / 2 if anchor == "middle" else (x - w if anchor == "end" else x)
            boxes.append((x0, y, x0 + w, y + h))
        for kind in ("canvas", "group", "border"):
            if kind in n:
                container = n[kind]
                for child in container.get("children", []) or []:
                    walk(child)

    walk(node)
    if not boxes:
        return None
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes)
    y1 = max(b[3] for b in boxes)
    return (x0, y0, x1 - x0, y1 - y0)


def composite_bbox(node):
    """Best-effort bbox for a composite element. Try the first border first
    (fastest, most accurate for boxed composites); fall back to union of
    leaf primitives for unboxed ones (actors, anything with no border)."""
    return first_border_bbox(node) or union_bbox(node)


def first_image(node):
    """Walk a composite's tree and return the first `image` child as
    `(x, y, width, height, href)`. Components and actors carry their icon
    in this position (a single image inside the data-template's stack).
    Returns None for composites with no icon (locations, building-blocks)."""
    if isinstance(node, dict):
        if "image" in node:
            i = node["image"]
            return (i.get("x", 0), i.get("y", 0),
                    i.get("width", 0), i.get("height", 0),
                    i.get("href"))
        for kind in ("canvas", "group", "border"):
            if kind in node:
                container = node[kind]
                for child in container.get("children", []) or []:
                    found = first_image(child)
                    if found is not None:
                        return found
    return None


def base64_data_uri_to_drawio_image(data_uri):
    """Drawio's style strings split on `;`, so a base64 SVG data URI of the
    form `data:image/svg+xml;base64,<b64>` can't be embedded verbatim in
    `image=...` — the parser would treat `base64,<b64>` as a separate
    style key. Decode the base64, URL-encode the SVG, and produce the
    semicolon-free form `data:image/svg+xml,<percent-encoded-svg>` that
    drawio's image-shape parser accepts.

    Returns None if the data URI isn't a base64 SVG (other formats fall
    through to the no-icon path)."""
    if not isinstance(data_uri, str):
        return None
    m = re.match(r"^data:image/svg\+xml;base64,(.+)$", data_uri)
    if not m:
        return None
    try:
        svg_text = base64.b64decode(m.group(1)).decode("utf-8")
    except Exception:
        return None
    return "data:image/svg+xml," + urllib.parse.quote(svg_text)


def style_for_kind(kind, icon_drawio_uri):
    """Pick the right style string for a composite cell. Components and
    actors with an extractable icon get the image-shape style; everything
    else falls back to a plain rectangle styled per-kind."""
    if icon_drawio_uri and kind in ("component", "actor"):
        return ICON_STYLE_PREFIX + f"image={icon_drawio_uri};"
    return KIND_STYLES_FALLBACK.get(kind, KIND_STYLES_FALLBACK["component"])


# ── Scene walk ──────────────────────────────────────────────────────

def walk_composites(scene):
    """Yield `(element_id, kind, node)` for every composite element in the
    scene tree. Recurses through canvas containers; stops descending into
    a leaf composite's content but DOES descend into containers (locations,
    building-blocks) so their inner components are reached. The caller
    extracts bbox / icon info from the node directly."""
    def walk(node):
        if not isinstance(node, dict):
            return
        for kind in ("canvas", "group"):
            if kind not in node:
                continue
            container = node[kind]
            from_element = container.get("from-element")
            if from_element in COMPOSITE_KINDS:
                yield (container.get("id"), from_element, node)
                # Locations and blocks contain other composites in their
                # items-presenter — descend. Leaf composites (component,
                # actor) carry only template bodies inside, so stop.
                if from_element in ("location", "building-block"):
                    for child in container.get("children", []) or []:
                        yield from walk(child)
            else:
                for child in container.get("children", []) or []:
                    yield from walk(child)

    for entry in scene:
        yield from walk(entry)


def walk_connectors(scene):
    """Yield (source_id, target_id, polyline_points) for every connector
    group at the top level of the scene. Connectors live as flat `group`
    entries after the canvas containers."""
    for entry in scene:
        if not isinstance(entry, dict) or "group" not in entry:
            continue
        g = entry["group"]
        src = g.get("source")
        dst = g.get("target")
        if not src or not dst:
            continue
        # Find the polyline child for waypoints. Lines (2-point) yield two
        # points; polylines yield N>2.
        points = []
        for child in g.get("children", []) or []:
            if "polyline" in child:
                pts = child["polyline"].get("points") or []
                points = [(p[0], p[1]) for p in pts]
                break
            if "line" in child:
                line = child["line"]
                points = [(line["x1"], line["y1"]), (line["x2"], line["y2"])]
                break
        yield (src, dst, points)


# ── XML emit ────────────────────────────────────────────────────────

def cell_id(eid: str) -> str:
    """Drawio reserves cell ids '0' (root) and '1' (default parent). Prefix
    everything with `cell-` to keep ours out of that namespace."""
    return f"cell-{eid}"


def render_drawio(scene_graph, arch, name=None):
    canvas   = scene_graph.get("canvas") or {}
    width    = int(canvas.get("width") or 1500)
    height   = int(canvas.get("height") or 1000)
    scene    = scene_graph.get("scene") or []
    id_index = build_id_index(arch)

    parts = []
    parts.append('<?xml version="1.0" encoding="UTF-8"?>')
    # `id` should be id-shaped (no slashes); `name` is just display text.
    diagram_id = re.sub(r"[^A-Za-z0-9_-]+", "-", name or "view").strip("-") or "view"
    parts.append(
        f'<mxfile host="app.diagrams.net" agent="architecture-toolchain" version="1.0">'
    )
    parts.append(
        f'  <diagram id="arch-{esc(diagram_id)}" name="{esc(name or "View")}">'
    )
    parts.append(
        f'    <mxGraphModel dx="{width}" dy="{height}" grid="1" gridSize="10" '
        f'guides="1" tooltips="1" connect="1" arrows="1" fold="1" '
        f'page="1" pageScale="1" pageWidth="{width}" pageHeight="{height}" '
        f'math="0" shadow="0">'
    )
    parts.append('      <root>')
    parts.append('        <mxCell id="0"/>')
    parts.append('        <mxCell id="1" parent="0"/>')

    # ── Vertices ────────────────────────────────────────────────────
    seen_ids = set()
    for eid, kind, node in walk_composites(scene):
        if eid in seen_ids or eid is None:
            # The same composite could appear twice if our walker descends a
            # container and re-encounters an id — guard against that.
            continue
        seen_ids.add(eid)

        # For components and actors: try to use the scene-graph icon
        # (a base64 SVG data URI inside an `image` child). When found,
        # the cell is rendered as `shape=image` with the icon, and its
        # geometry shrinks to the icon's natural rect — the label sits
        # below via `verticalLabelPosition=bottom`. When the icon can't
        # be extracted (or for non-iconographic kinds like locations
        # and building-blocks), fall back to a plain styled rectangle
        # at the composite's full bbox.
        icon_uri = None
        bbox = None
        if kind in ("component", "actor"):
            img = first_image(node)
            if img is not None:
                ix, iy, iw, ih, href = img
                icon_uri = base64_data_uri_to_drawio_image(href)
                if icon_uri:
                    bbox = (ix, iy, iw, ih)
        if bbox is None:
            bbox = composite_bbox(node)
        if bbox is None:
            continue   # nothing to position; skip rather than emit garbage
        x, y, w, h = bbox

        # Label: prefer the model's authored label; fall back to the id.
        # The lookup returns plain text — possibly with embedded HTML
        # `<br/>` for line breaks — and we XML-escape on the way in so
        # that becomes `&lt;br/&gt;` in the file. Drawio decodes back to
        # `<br/>` and renders it as a line break.
        _, label = id_index.get(eid, (kind, eid))
        style = style_for_kind(kind, icon_uri)
        parts.append(
            f'        <mxCell id="{esc(cell_id(eid))}" value="{esc(label)}" '
            f'style="{esc(style)}" vertex="1" parent="1">'
        )
        parts.append(
            f'          <mxGeometry x="{x:.1f}" y="{y:.1f}" '
            f'width="{w:.1f}" height="{h:.1f}" as="geometry"/>'
        )
        parts.append('        </mxCell>')

    # ── Edges ───────────────────────────────────────────────────────
    edge_n = 0
    for src, dst, points in walk_connectors(scene):
        edge_n += 1
        # Pick straight vs orthogonal style based on whether the polyline
        # has interior bends. Drawio renders both correctly.
        is_orthogonal = len(points) > 2
        style = EDGE_STYLE_ORTHOGONAL if is_orthogonal else EDGE_STYLE_STRAIGHT
        # source/target are mxCell refs by id. If the source or target
        # doesn't appear as a vertex (rare; would mean we skipped it),
        # the edge still lands but drawio renders it as a floating edge
        # with no anchored endpoint.
        attrs = (
            f'id="edge-{edge_n}" style="{esc(style)}" edge="1" parent="1" '
            f'source="{esc(cell_id(src))}" target="{esc(cell_id(dst))}"'
        )
        parts.append(f'        <mxCell {attrs}>')
        parts.append('          <mxGeometry relative="1" as="geometry">')
        # Emit interior waypoints (the bend points between source and target).
        # Drawio respects the array even when edgeStyle is orthogonal — useful
        # to preserve hand-tuned routing from the .view source.
        if len(points) > 2:
            interior = points[1:-1]
            parts.append('            <Array as="points">')
            for px, py in interior:
                parts.append(f'              <mxPoint x="{px:.1f}" y="{py:.1f}"/>')
            parts.append('            </Array>')
        parts.append('          </mxGeometry>')
        parts.append('        </mxCell>')

    parts.append('      </root>')
    parts.append('    </mxGraphModel>')
    parts.append('  </diagram>')
    parts.append('</mxfile>')
    return "\n".join(parts) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("scene", help="Path to the compiled scene-graph YAML.")
    parser.add_argument("--model", required=True,
                        help="Path to the compiled architecture YAML — used to "
                             "look up element labels.")
    parser.add_argument("-o", "--output", required=True,
                        help="Path to write the .drawio XML.")
    parser.add_argument("--name",
                        help="Optional diagram name shown in drawio's "
                             "page tab. Defaults to the output stem.")
    args = parser.parse_args()

    scene_path = Path(args.scene).resolve()
    model_path = Path(args.model).resolve()
    if not scene_path.exists():
        print(f"ERROR: scene graph not found: {scene_path}", file=sys.stderr)
        return 2
    if not model_path.exists():
        print(f"ERROR: compiled model not found: {model_path}", file=sys.stderr)
        return 2

    scene_graph = yaml.safe_load(scene_path.read_text(encoding="utf-8")) or {}
    arch        = yaml.safe_load(model_path.read_text(encoding="utf-8")) or {}

    out = Path(args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    name = args.name or out.stem
    out.write_text(render_drawio(scene_graph, arch, name=name), encoding="utf-8")
    print(f"Wrote: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
