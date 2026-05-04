#!/usr/bin/env python3
"""Markup compiler. Reads markup YAML, resolves styles/templates/bindings,
emits a compiled scene-graph YAML for the renderer."""
from __future__ import annotations
import argparse
import base64
import sys
from pathlib import Path

import yaml

def _find_project_root():
    """Walk up from this script's location until we find the project root,
    identified by the presence of `visual_libraries/` and `visual_engine/`."""
    cur = Path(__file__).resolve().parent
    for _ in range(10):
        if (cur / "visual_libraries").exists() and (cur / "visual_engine").exists():
            return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    return Path.cwd()


ROOT = _find_project_root()
_tlib_path_global = None  # set by main() before recursion uses it



_auto_id_counter = 0
def _ensure_id(el, type_hint="el"):
    """Return el['id'] if present, otherwise mint and assign one."""
    global _auto_id_counter
    if "id" not in el or not el["id"]:
        _auto_id_counter += 1
        el["id"] = f"{type_hint}-{_auto_id_counter}"
    return el["id"]


def load_yaml(path: Path):
    with open(path) as f:
        return yaml.safe_load(f)


def load_visual_library(vlib_root: Path):
    vlib = {"styles": {}, "data-templates": {}, "_root": vlib_root}
    for name in ("location", "building-block", "component", "actor", "connector"):
        f = vlib_root / f"{name}.yaml"
        if f.exists():
            vlib["styles"][name] = load_yaml(f)
    dt_dir = vlib_root / "data-templates"
    if dt_dir.exists():
        for f in dt_dir.glob("*.yaml"):
            dt = load_yaml(f)
            key = dt.get("target-category")
            if key:
                vlib["data-templates"][key] = dt
    return vlib


def _resolve_icon_path(icon, vlib):
    """Resolve an icon string to an absolute Path. Strings starting with
    'resources/' are library-relative; other relative strings are project-
    root-relative. Already-Path values pass through unchanged."""
    if not icon or isinstance(icon, Path):
        return icon
    p = Path(icon)
    if p.is_absolute():
        return p
    vroot = vlib.get("_root") if vlib else None
    if str(icon).startswith("resources/") and vroot is not None:
        return vroot / icon
    return ROOT / icon


# ─────────────────────────────────────────────────────────────────
# Anchor primitive (placement layer for stage 3 — see wiki/03-anchors.md)
# ─────────────────────────────────────────────────────────────────
# Two pure functions:
#   compute_anchor(node, name) -> (x, y)
#       Coordinate of the named anchor on a node's arranged bbox.
#   anchor_offset(w, h, name)  -> (dx, dy)
#       Offset from a placed element's top-left corner to its named anchor.
#       Used for own-anchor placement: the element is positioned so that its
#       named anchor lands on the target anchor coord.
#
# Anchors live on the outer border rect (uniformity rule). 9 named points:
#   north, south, east, west          - edge midpoints
#   north-east, north-west,           - corners
#   south-east, south-west
#   center                            - centroid

ANCHOR_NAMES = (
    "north", "south", "east", "west",
    "north-east", "north-west", "south-east", "south-west",
    "center",
)


def _anchor_on_bbox(x, y, w, h, name):
    if name == "north":      return (x + w / 2, y)
    if name == "south":      return (x + w / 2, y + h)
    if name == "east":       return (x + w,     y + h / 2)
    if name == "west":       return (x,         y + h / 2)
    if name == "north-east": return (x + w,     y)
    if name == "north-west": return (x,         y)
    if name == "south-east": return (x + w,     y + h)
    if name == "south-west": return (x,         y + h)
    if name == "center":     return (x + w / 2, y + h / 2)
    raise ValueError(f"unknown anchor name: {name!r}. valid: {ANCHOR_NAMES}")


def compute_anchor(node, name):
    """Return the (x, y) coordinate of the named anchor on a layout-tree
    node's arranged bbox. Raises if the node hasn't been arranged yet."""
    a = node.get("arranged")
    if a is None:
        raise ValueError(f"compute_anchor: node {node.get('id') or node.get('type')!r} "
                         f"has not been arranged yet")
    return _anchor_on_bbox(a.get("x", 0), a.get("y", 0),
                           a.get("w") or 0, a.get("h") or 0, name)


def anchor_offset(width, height, name):
    """Return the (dx, dy) offset from a placed element's top-left corner
    to its named anchor point. For own-anchor placement."""
    return _anchor_on_bbox(0, 0, width or 0, height or 0, name)


def _ray_exit_from_center(cx, cy, hw, hh, dx, dy):
    """From the center of an axis-aligned bbox (half-widths hw, hh),
    cast a ray in direction (dx, dy) and return the point where it
    exits the bbox border. Used for connector border-crossing."""
    if dx == 0 and dy == 0:
        return (cx, cy)
    inf = float("inf")
    tx = inf if dx == 0 else (hw if dx > 0 else -hw) / dx   # >= 0
    ty = inf if dy == 0 else (hh if dy > 0 else -hh) / dy   # >= 0
    t = min(tx, ty)
    return (cx + t * dx, cy + t * dy)


def _connector_endpoint(bbox, anchor, toward_x, toward_y):
    """Resolve one end of a connector. If `anchor` is given, return that
    named anchor on the bbox. Otherwise, compute border-crossing toward
    (toward_x, toward_y) — the line from this bbox's center toward that
    point exits its border at the returned coordinate."""
    cx = bbox["x"] + bbox["width"]  / 2
    cy = bbox["y"] + bbox["height"] / 2
    if anchor:
        return _anchor_on_bbox(bbox["x"], bbox["y"],
                               bbox["width"], bbox["height"], anchor)
    dx = toward_x - cx
    dy = toward_y - cy
    return _ray_exit_from_center(cx, cy, bbox["width"] / 2, bbox["height"] / 2, dx, dy)


def _side_of_bbox(bbox, pt, eps=0.5):
    """Return which side of `bbox` the point lies on: 'east' / 'west' /
    'north' / 'south', or None if it's not on the border (interior or off).
    Corners are classified by the side that matches first (east/west tested
    before north/south) — the picked side determines the axis along which
    other connector endpoints will be distributed."""
    bx, by, bw, bh = bbox["x"], bbox["y"], bbox["width"], bbox["height"]
    if abs(pt[0] - (bx + bw)) < eps: return "east"
    if abs(pt[0] - bx) < eps:        return "west"
    if abs(pt[1] - by) < eps:        return "north"
    if abs(pt[1] - (by + bh)) < eps: return "south"
    return None


CONNECTOR_ENDPOINT_GAP = 12  # min pixel spacing between connectors sharing an edge


def _resolve_routing_mode(routing, src_bbox, dst_bbox, src_cx, src_cy, dst_cx, dst_cy):
    """Resolve `orthogonal-auto` to HV or VH and apply the overlap-aware
    correctness override. Mirrors the logic in compile_connector so the
    distribution pre-pass classifies endpoint sides the same way the
    final compile will route them."""
    src_in_dst_y = dst_bbox["y"] < src_cy < dst_bbox["y"] + dst_bbox["height"]
    src_in_dst_x = dst_bbox["x"] < src_cx < dst_bbox["x"] + dst_bbox["width"]
    if routing == "orthogonal-auto":
        if src_in_dst_y and not src_in_dst_x:
            routing = "orthogonal-vh"
        elif src_in_dst_x and not src_in_dst_y:
            routing = "orthogonal-hv"
        else:
            routing = "orthogonal-vh" if abs(dst_cy - src_cy) > abs(dst_cx - src_cx) else "orthogonal-hv"
    if routing == "orthogonal-vh" and src_in_dst_x and not src_in_dst_y:
        routing = "orthogonal-hv"
    elif routing == "orthogonal-hv" and src_in_dst_y and not src_in_dst_x:
        routing = "orthogonal-vh"
    return routing


def _orthogonal_endpoint_side(routing, end, src_bbox, dst_bbox, src_cx, src_cy, dst_cx, dst_cy):
    """Which side of the *end's* bbox does the connector land on?
    HV's final leg is vertical → dst lands on N/S; src exits E/W (or N/S
    when src is in dst's column). VH is the mirror."""
    if routing == "orthogonal-hv":
        if end == "dst":
            return "north" if src_cy < dst_cy else "south"
        # src side: degenerate (corner sits on src.cx) → exit N/S
        if dst_bbox["x"] <= src_cx <= dst_bbox["x"] + dst_bbox["width"]:
            return "south" if dst_cy > src_cy else "north"
        return "east" if dst_cx > src_cx else "west"
    if routing == "orthogonal-vh":
        if end == "dst":
            return "west" if src_cx < dst_cx else "east"
        if dst_bbox["y"] <= src_cy <= dst_bbox["y"] + dst_bbox["height"]:
            return "east" if dst_cx > src_cx else "west"
        return "south" if dst_cy > src_cy else "north"
    return None


def _channel_distribute(n, lo, hi, min_gap):
    """Place n channel positions inside [lo, hi] symmetrically around the
    midpoint, with `min_gap` spacing where possible (compresses to fit when
    the window is too narrow). Returns the list of n positions in order."""
    edge_len = hi - lo
    margin = min(min_gap, edge_len * 0.1)
    usable = max(0.0, edge_len - 2 * margin)
    span_wanted = (n - 1) * min_gap
    if span_wanted > usable:
        g = usable / max(1, n - 1)
    else:
        g = min_gap
    center = (lo + hi) / 2
    start = center - (n - 1) * g / 2
    return [start + i * g for i in range(n)]


def _distribute_endpoints(markup, registry, vlib=None, min_gap=CONNECTOR_ENDPOINT_GAP):
    """Two distribution strategies, applied separately:

    1. Straight connectors: group by (component, side), distribute
       symmetrically along the shared edge.

    2. Orthogonal connector pairs: group connectors by the unordered pair of
       endpoints (`frozenset((src_id, dst_id))`). When 2+ orthogonal
       connectors run between the same two components, compute the overlap
       window of the two opposing edges (e.g., src.east ∩ dst.west for VH
       routing), then place each connector at a channel position symmetric
       around the overlap midpoint. Both ends get the same channel
       coordinate, so the path collapses to a single straight segment
       (no L-shape, no source-side kinks).

    Returns {id(connector_dict): {'src': pt, 'dst': pt}} overrides."""
    style = (vlib or {}).get("styles", {}).get("connector")
    overrides = {}

    # ── Pass 1: orthogonal pair-overlap distribution ──────────────────
    pair_groups = {}  # frozenset((src_id, dst_id)) -> list of dicts
    for el in markup.get("elements", []) or []:
        if not isinstance(el, dict) or "connector" not in el:
            continue
        conn = el["connector"]
        resolved = apply_style(style, dict(conn)) if style else dict(conn)
        routing_setter = resolved.get("routing", "straight")
        if routing_setter == "straight":
            continue
        src_id = (conn.get("from") or {}).get("target") if isinstance(conn.get("from"), dict) else conn.get("from")
        dst_id = (conn.get("to")   or {}).get("target") if isinstance(conn.get("to"),   dict) else conn.get("to")
        if not src_id or not dst_id or src_id == dst_id or src_id not in registry or dst_id not in registry:
            continue
        src_anchor = (conn.get("from") or {}).get("anchor") if isinstance(conn.get("from"), dict) else None
        dst_anchor = (conn.get("to")   or {}).get("anchor") if isinstance(conn.get("to"),   dict) else None
        if src_anchor or dst_anchor:
            continue  # explicit anchors opt out
        src_bbox = registry[src_id]
        dst_bbox = registry[dst_id]
        src_cx = src_bbox["x"] + src_bbox["width"]  / 2
        src_cy = src_bbox["y"] + src_bbox["height"] / 2
        dst_cx = dst_bbox["x"] + dst_bbox["width"]  / 2
        dst_cy = dst_bbox["y"] + dst_bbox["height"] / 2
        actual = _resolve_routing_mode(routing_setter, src_bbox, dst_bbox,
                                        src_cx, src_cy, dst_cx, dst_cy)
        pair_key = frozenset((src_id, dst_id))
        pair_groups.setdefault(pair_key, []).append({
            "conn": conn, "src_id": src_id, "dst_id": dst_id,
            "src_bbox": src_bbox, "dst_bbox": dst_bbox,
            "src_cx": src_cx, "src_cy": src_cy,
            "dst_cx": dst_cx, "dst_cy": dst_cy,
            "routing": actual,
        })

    for pair_key, members in pair_groups.items():
        if len(members) < 2:
            continue  # singletons keep beam projection
        # All members in a pair should have the same resolved routing
        # (geometry-driven). Skip if mixed (rare — would require explicit -| / |-
        # in opposing directions on the same pair).
        routings = {m["routing"] for m in members}
        if len(routings) != 1:
            continue
        routing = routings.pop()

        if routing == "orthogonal-vh":
            # Connector flows horizontally between left.east and right.west.
            m0 = members[0]
            if m0["src_cx"] < m0["dst_cx"]:
                left_bbox, right_bbox = m0["src_bbox"], m0["dst_bbox"]
            else:
                left_bbox, right_bbox = m0["dst_bbox"], m0["src_bbox"]
            lo = max(left_bbox["y"], right_bbox["y"])
            hi = min(left_bbox["y"] + left_bbox["height"],
                     right_bbox["y"] + right_bbox["height"])
            if hi - lo < min_gap:
                continue  # no useful overlap window
            channels = _channel_distribute(len(members), lo, hi, min_gap)
            for m, channel_y in zip(members, channels):
                left_x = m["src_bbox"]["x"] + m["src_bbox"]["width"] if m["src_cx"] < m["dst_cx"] else m["src_bbox"]["x"]
                right_x = m["dst_bbox"]["x"] if m["src_cx"] < m["dst_cx"] else m["dst_bbox"]["x"] + m["dst_bbox"]["width"]
                overrides.setdefault(id(m["conn"]), {})["src"] = (left_x,  channel_y)
                overrides.setdefault(id(m["conn"]), {})["dst"] = (right_x, channel_y)
        elif routing == "orthogonal-hv":
            # Vertical flow between top.south and bottom.north.
            m0 = members[0]
            if m0["src_cy"] < m0["dst_cy"]:
                top_bbox, bot_bbox = m0["src_bbox"], m0["dst_bbox"]
            else:
                top_bbox, bot_bbox = m0["dst_bbox"], m0["src_bbox"]
            lo = max(top_bbox["x"], bot_bbox["x"])
            hi = min(top_bbox["x"] + top_bbox["width"],
                     bot_bbox["x"] + bot_bbox["width"])
            if hi - lo < min_gap:
                continue
            channels = _channel_distribute(len(members), lo, hi, min_gap)
            for m, channel_x in zip(members, channels):
                src_y = m["src_bbox"]["y"] + m["src_bbox"]["height"] if m["src_cy"] < m["dst_cy"] else m["src_bbox"]["y"]
                dst_y = m["dst_bbox"]["y"] if m["src_cy"] < m["dst_cy"] else m["dst_bbox"]["y"] + m["dst_bbox"]["height"]
                overrides.setdefault(id(m["conn"]), {})["src"] = (channel_x, src_y)
                overrides.setdefault(id(m["conn"]), {})["dst"] = (channel_x, dst_y)

    # ── Pass 2: straight-connector edge distribution (existing) ────────
    items = []  # (conn, src_pt, dst_pt, src_side, dst_side, src_id, dst_id)
    for el in markup.get("elements", []) or []:
        if not isinstance(el, dict) or "connector" not in el:
            continue
        conn = el["connector"]
        resolved = apply_style(style, dict(conn)) if style else dict(conn)
        if resolved.get("routing", "straight") != "straight":
            continue
        src_id = (conn.get("from") or {}).get("target") if isinstance(conn.get("from"), dict) else conn.get("from")
        dst_id = (conn.get("to")   or {}).get("target") if isinstance(conn.get("to"),   dict) else conn.get("to")
        if not src_id or not dst_id or src_id not in registry or dst_id not in registry:
            continue
        src_bbox = registry[src_id]
        dst_bbox = registry[dst_id]
        src_anchor = (conn.get("from") or {}).get("anchor") if isinstance(conn.get("from"), dict) else None
        dst_anchor = (conn.get("to")   or {}).get("anchor") if isinstance(conn.get("to"),   dict) else None
        src_cx = src_bbox["x"] + src_bbox["width"]  / 2
        src_cy = src_bbox["y"] + src_bbox["height"] / 2
        dst_cx = dst_bbox["x"] + dst_bbox["width"]  / 2
        dst_cy = dst_bbox["y"] + dst_bbox["height"] / 2
        src_pt = _connector_endpoint(src_bbox, src_anchor, dst_cx, dst_cy)
        dst_pt = _connector_endpoint(dst_bbox, dst_anchor, src_cx, src_cy)
        items.append((conn, src_pt, dst_pt,
                      _side_of_bbox(src_bbox, src_pt), _side_of_bbox(dst_bbox, dst_pt),
                      src_id, dst_id))

    groups = {}  # (component_id, side) -> [(item_index, kind, other_pt)]
    for idx, (conn, src_pt, dst_pt, src_side, dst_side, src_id, dst_id) in enumerate(items):
        if src_side:
            groups.setdefault((src_id, src_side), []).append((idx, "src", dst_pt))
        if dst_side:
            groups.setdefault((dst_id, dst_side), []).append((idx, "dst", src_pt))

    for (cid, side), endpoints in groups.items():
        if len(endpoints) <= 1:
            continue
        bbox = registry[cid]
        # Sort by the position of the OTHER endpoint along the edge's axis
        # so connectors coming from above land above, from below land below.
        if side in ("east", "west"):
            endpoints.sort(key=lambda e: e[2][1])
            edge_min, edge_max = bbox["y"], bbox["y"] + bbox["height"]
            edge_pos = bbox["x"] + (bbox["width"] if side == "east" else 0)
        else:
            endpoints.sort(key=lambda e: e[2][0])
            edge_min, edge_max = bbox["x"], bbox["x"] + bbox["width"]
            edge_pos = bbox["y"] + (bbox["height"] if side == "south" else 0)
        positions = _channel_distribute(len(endpoints), edge_min, edge_max, min_gap)
        for (item_idx, kind, _), pos in zip(endpoints, positions):
            new_pt = (edge_pos, pos) if side in ("east", "west") else (pos, edge_pos)
            overrides.setdefault(id(items[item_idx][0]), {})[kind] = new_pt

    # ── Pass 3: orthogonal endpoint distribution per (component, side) ───
    # For orthogonal connectors NOT handled by Pass 1 (i.e. not multi-connector
    # pairs between the same two components), distribute endpoints symmetrically
    # along the shared edge when 2+ connectors land on the same (component, side)
    # from / to different opposite components. Without this, each endpoint sits
    # at its natural border-crossing (a ray from the bbox center toward the
    # other end's center), which leaves a wide gap when sources are at very
    # different y-positions on the same edge.
    ortho_items = []
    for el in markup.get("elements", []) or []:
        if not isinstance(el, dict) or "connector" not in el:
            continue
        conn = el["connector"]
        resolved = apply_style(style, dict(conn)) if style else dict(conn)
        routing_setter = resolved.get("routing", "straight")
        if routing_setter == "straight":
            continue
        src_id = (conn.get("from") or {}).get("target") if isinstance(conn.get("from"), dict) else conn.get("from")
        dst_id = (conn.get("to")   or {}).get("target") if isinstance(conn.get("to"),   dict) else conn.get("to")
        if not src_id or not dst_id or src_id == dst_id or src_id not in registry or dst_id not in registry:
            continue
        src_anchor = (conn.get("from") or {}).get("anchor") if isinstance(conn.get("from"), dict) else None
        dst_anchor = (conn.get("to")   or {}).get("anchor") if isinstance(conn.get("to"),   dict) else None
        if src_anchor or dst_anchor:
            continue
        src_bbox = registry[src_id]
        dst_bbox = registry[dst_id]
        src_cx = src_bbox["x"] + src_bbox["width"]  / 2
        src_cy = src_bbox["y"] + src_bbox["height"] / 2
        dst_cx = dst_bbox["x"] + dst_bbox["width"]  / 2
        dst_cy = dst_bbox["y"] + dst_bbox["height"] / 2
        actual = _resolve_routing_mode(routing_setter, src_bbox, dst_bbox,
                                        src_cx, src_cy, dst_cx, dst_cy)
        src_side = _orthogonal_endpoint_side(actual, "src", src_bbox, dst_bbox,
                                              src_cx, src_cy, dst_cx, dst_cy)
        dst_side = _orthogonal_endpoint_side(actual, "dst", src_bbox, dst_bbox,
                                              src_cx, src_cy, dst_cx, dst_cy)
        ortho_items.append({
            "conn": conn,
            "src_id": src_id, "dst_id": dst_id,
            "src_bbox": src_bbox, "dst_bbox": dst_bbox,
            "src_cx": src_cx, "src_cy": src_cy,
            "dst_cx": dst_cx, "dst_cy": dst_cy,
            "src_side": src_side, "dst_side": dst_side,
        })

    ortho_groups = {}  # (component_id, side) → [(item, "src"|"dst")]
    for item in ortho_items:
        cid_conn = id(item["conn"])
        src_done = cid_conn in overrides and "src" in overrides[cid_conn]
        dst_done = cid_conn in overrides and "dst" in overrides[cid_conn]
        if not src_done and item["src_side"]:
            ortho_groups.setdefault((item["src_id"], item["src_side"]), []).append((item, "src"))
        if not dst_done and item["dst_side"]:
            ortho_groups.setdefault((item["dst_id"], item["dst_side"]), []).append((item, "dst"))

    for (cid, side), members in ortho_groups.items():
        if len(members) < 2:
            continue
        bbox = registry[cid]
        # Sort by the OTHER end's center along the edge axis, so connectors
        # entering from above land above, from below land below.
        if side in ("east", "west"):
            members.sort(key=lambda m: m[0]["src_cy"] if m[1] == "dst" else m[0]["dst_cy"])
            edge_min, edge_max = bbox["y"], bbox["y"] + bbox["height"]
            edge_pos = bbox["x"] + (bbox["width"] if side == "east" else 0)
        else:
            members.sort(key=lambda m: m[0]["src_cx"] if m[1] == "dst" else m[0]["dst_cx"])
            edge_min, edge_max = bbox["x"], bbox["x"] + bbox["width"]
            edge_pos = bbox["y"] + (bbox["height"] if side == "south" else 0)
        positions = _channel_distribute(len(members), edge_min, edge_max, min_gap)
        for (item, kind), pos in zip(members, positions):
            new_pt = (edge_pos, pos) if side in ("east", "west") else (pos, edge_pos)
            overrides.setdefault(id(item["conn"]), {})[kind] = new_pt

    return overrides


def _shorten_endpoint(p_prev, p_end, offset):
    """Pull p_end back along the segment from p_prev by `offset` units. Returns
    p_end unchanged if the segment is shorter than offset (which would otherwise
    flip the segment)."""
    import math
    dx = p_end[0] - p_prev[0]
    dy = p_end[1] - p_prev[1]
    length = math.sqrt(dx * dx + dy * dy)
    if length <= offset:
        return p_end
    k = offset / length
    return (p_end[0] - k * dx, p_end[1] - k * dy)


def _arrow_polygon(p_prev, p_end, size, color):
    """PowerPoint-style 'stealth' arrow head: 4-point concave shape with a
    notch on the back edge that produces swept-back wings. The arrow is
    slightly elongated (length > width) and the notch sits well forward of
    the base so the stealth shape stays legible at small sizes."""
    import math
    dx = p_end[0] - p_prev[0]
    dy = p_end[1] - p_prev[1]
    length = math.sqrt(dx * dx + dy * dy)
    if length == 0:
        return None
    ux, uy = dx / length, dy / length     # unit direction (toward tip)
    px, py = -uy, ux                       # perpendicular
    arrow_length = size * 1.4              # taller than wide for the stealth profile
    base_cx = p_end[0] - arrow_length * ux
    base_cy = p_end[1] - arrow_length * uy
    half = size / 2                        # full base width = `size`
    p1 = (base_cx + half * px, base_cy + half * py)
    p2 = (base_cx - half * px, base_cy - half * py)
    # Stealth notch: sits on the centreline a fraction of the arrow length
    # forward of the base (toward the tip). 0 = flat-back triangle; 1 = tip.
    notch_frac = 0.55
    nx = base_cx + notch_frac * arrow_length * ux
    ny = base_cy + notch_frac * arrow_length * uy
    return {"polygon": {
        "points": [list(p_end), list(p1), [nx, ny], list(p2)],
        "fill":   color,
        "stroke": color,
        "stroke-width": 1,
    }}


def load_technology(tlib_root: Path, tech_id: str):
    idx = load_yaml(tlib_root / "index.yaml")
    if tech_id not in idx.get("technologies", {}):
        return {"id": tech_id, "label": tech_id, "icon": None}
    t = idx["technologies"][tech_id]
    icon_rel = t.get("icon", "")
    if icon_rel.startswith("resources/"):
        icon_path = tlib_root / icon_rel
    elif icon_rel:
        icon_path = ROOT / icon_rel
    else:
        icon_path = None
    return {"id": tech_id, "label": t.get("label", tech_id), "icon": icon_path}


def resolve(value, ctx):
    if isinstance(value, str) and value.startswith("$"):
        parts = value[1:].split(".")
        obj = ctx.get(parts[0])
        for p in parts[1:]:
            if obj is None:
                return None
            obj = obj.get(p) if isinstance(obj, dict) else getattr(obj, p, None)
        return obj
    return value


def icon_data_uri(path):
    if path is None or not path.exists():
        return ""
    suffix = path.suffix.lower().lstrip(".")
    mime = {"svg": "image/svg+xml", "png": "image/png"}.get(suffix, "image/svg+xml")
    b64 = base64.b64encode(path.read_bytes()).decode()
    return f"data:{mime};base64,{b64}"


def _make_axis_ref(inst, axis):
    """Per-axis anchor-ref record. Legacy syntax `at $a.east [anchor=west]`
    populates both axes with identical records; the new per-axis syntax may
    set only one axis (or two with different targets). Returns None for the
    axis if no anchor-ref is declared on this axis."""
    # Pass 1 (legacy): only the unified inst.get("anchor-ref") + inst.get("anchor")
    # form is produced by the view-compiler. Both axes share it.
    legacy = inst.get("anchor-ref")
    if legacy:
        return {
            "target": legacy["target"],
            "target_anchor": legacy["anchor"],
            "own_anchor": inst.get("anchor", "center"),
        }
    # Per-axis form (Pass 2 will populate these from the new parser):
    per_axis = inst.get(f"{axis}-anchor-ref")
    if per_axis:
        rec = {
            "target": per_axis["target"],
            "target_anchor": per_axis.get("anchor", "center"),
            "own_anchor": per_axis.get("own_anchor", "center"),
        }
        if "distance" in per_axis:
            rec["distance"] = per_axis["distance"]
        return rec
    return None


def _is_anchored(node):
    """True if the node has any anchor-ref (h, v, or both)."""
    d = node.get("declared") or {}
    return bool(d.get("h-anchor-ref") or d.get("v-anchor-ref"))


def _is_full_anchored(node):
    """True if both axes are anchored — child is fully out of flow."""
    d = node.get("declared") or {}
    return bool(d.get("h-anchor-ref") and d.get("v-anchor-ref"))


def edges(value, default=0):
    """Normalise an edges record. Accepts:
       - None / missing      -> all sides default
       - int or float         -> uniform on all sides
       - dict                 -> partial override of (top, right, bottom, left)"""
    base = {"top": default, "right": default, "bottom": default, "left": default}
    if value is None:
        return base
    if isinstance(value, (int, float)):
        return {k: value for k in base}
    return {**base, **value}





import functools as _functools
try:
    from PIL import ImageFont as _ImageFont
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False


@_functools.lru_cache(maxsize=64)
def _get_font(font_size: int, weight: str = "normal", style: str = "normal"):
    """Resolve a TTF for the requested weight/style. Falls back to DejaVu Sans;
    returns None if PIL or fonts aren't available (caller falls back to estimate)."""
    if not _PIL_AVAILABLE:
        return None
    base = "/usr/share/fonts/truetype/dejavu/"
    if weight == "bold" and style == "italic":
        path = base + "DejaVuSans-BoldOblique.ttf"
    elif weight == "bold":
        path = base + "DejaVuSans-Bold.ttf"
    elif style == "italic":
        path = base + "DejaVuSans-Oblique.ttf"
    else:
        path = base + "DejaVuSans.ttf"
    try:
        return _ImageFont.truetype(path, size=int(font_size))
    except Exception:
        return None


def _wrap_text(content, max_width, font_size=12, font_weight="normal", font_style="normal"):
    """Greedy word-wrap a string to fit `max_width` pixels using the same
    font metrics as `measure_text`. Returns the input unchanged if it's not
    a string, if `max_width` is None, or if the full string already fits.
    Otherwise returns a list of lines.

    A single word longer than `max_width` is left on its own line (we don't
    hyphenate); the line will overflow visually but the layout pipeline at
    least sees the correct measured width via the wider-than-cap line."""
    if max_width is None or not isinstance(content, str) or not content.strip():
        return content
    full_w, _ = measure_text(content, font_size, font_weight, font_style)
    if full_w <= max_width:
        return content
    words = content.split()
    if len(words) <= 1:
        return content
    lines = []
    cur = words[0]
    for w in words[1:]:
        cand = cur + " " + w
        cand_w, _ = measure_text(cand, font_size, font_weight, font_style)
        if cand_w <= max_width:
            cur = cand
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def _rotated_aabb(w, h, rotation):
    """Axis-aligned bounding box of a (w, h) rectangle rotated by
    `rotation` degrees (SVG clockwise convention). Fast paths for
    orthogonal angles avoid any floating-point computation — a 90°
    rotation is exact swap, no sub-pixel drift to layout positions."""
    angle = float(rotation) % 360
    if angle in (0.0, 180.0):
        return (w, h)
    if angle in (90.0, 270.0):
        return (h, w)
    import math
    a = math.radians(angle)
    return (abs(w * math.cos(a)) + abs(h * math.sin(a)),
            abs(w * math.sin(a)) + abs(h * math.cos(a)))


def measure_text(content, font_size=12, font_weight="normal", font_style="normal",
                 rotation=0):
    """Pixel (width, height) for a run of text. List content measures as
    multiple lines (max width across lines, sum of line heights). Uses PIL
    when available.

    `rotation` (degrees, SVG clockwise) returns the AABB of the rotated
    text — the size a parent layout panel should reserve. Default of 0
    preserves the historical behaviour. Internal callers that wrap text
    against a max-width pass rotation=0 because wrapping reasons about
    the unrotated line widths; the caller then re-measures with rotation
    once the line breaks are decided."""
    if not content:
        return (0, 0)
    lines = content if isinstance(content, list) else [content]
    line_h = font_size * 1.2
    font = _get_font(font_size, font_weight, font_style)
    if font is None:
        widths = [font_size * len(str(l)) * 0.6 for l in lines]
        w = max(widths) if widths else 0
    else:
        try:
            widths = []
            for l in lines:
                bb = font.getbbox(str(l))
                widths.append(bb[2] - bb[0])
            w = max(widths) if widths else 0
        except Exception:
            widths = [font_size * len(str(l)) * 0.6 for l in lines]
            w = max(widths) if widths else 0
    h = line_h * len(lines)
    return _rotated_aabb(w, h, rotation)


# ─────────────────────────────────────────────────────────────────
# Two-pass layout: MEASURE (stage 1) and ARRANGE (stage 2)
# ─────────────────────────────────────────────────────────────────
# Layout-tree node:
#   { type, id, layout, declared: {x,y,w,h}, padding, margin,
#     children: [...], measured: {w,h}, arranged: {x,y,w,h},
#     props: {...} }
#
# Layout strategies:
#   - canvas / absolute / root  : children at their declared (x, y); parent shrink-wraps
#   - stack-panel V (v-stack)   : children top-to-bottom; pinned children (with `at:`) keep their offset
#   - stack-panel H (h-stack)   : mirror
#
# Composite element types (location etc.) expand their ControlTemplates into
# the layout tree. The location's markup `children:` block is injected as the
# children of the template's `items-presenter` node.

def _expand_template_subtree(template_nodes, vlib, items_inject, ctx=None):
    """Walk a Style template AST, return layout-tree subtree.
    `items_inject` is the list of layout-tree nodes to inject as children of
    any items-presenter encountered."""
    out = []
    for node in template_nodes:
        if "border" in node:
            b = node["border"]
            r = b.get("rect")
            decl = {"x": None, "y": None, "w": None, "h": None}
            if r:
                # Border carries an explicit rect — usually $self.width / $self.height
                decl = {"x": r.get("x") if isinstance(r.get("x"), (int, float)) else None,
                        "y": r.get("y") if isinstance(r.get("y"), (int, float)) else None,
                        "w": None, "h": None}
            if b.get("stretch") is not None:
                decl["stretch"] = b["stretch"]
            kids = _expand_template_subtree(b.get("children", []), vlib, items_inject, ctx)
            out.append({
                "type": "border", "id": "", "layout": "canvas",
                "declared": decl, "padding": edges(b.get("padding")),
                "margin": edges(b.get("margin")), "children": kids,
                "measured": None, "arranged": None, "props": {"raw": b},
            })
        elif "stack-panel" in node or "stack" in node:
            sp = node.get("stack-panel") or node.get("stack")
            orient = sp.get("orientation", "vertical")
            layout = "stack-panel-vertical" if orient == "vertical" else "stack-panel-horizontal"
            sp_decl = {"x": None, "y": None, "w": None, "h": None}
            if sp.get("stretch") is not None:
                sp_decl["stretch"] = sp["stretch"]
            kids = _expand_template_subtree(sp.get("children", []), vlib, items_inject, ctx)
            out.append({
                "type": "stack-panel", "id": "", "layout": layout,
                "declared": sp_decl,
                "padding": edges(None), "margin": edges(None),
                "h-align": sp.get("h-align"),
                "v-align": sp.get("v-align"),
                "children": kids, "measured": None, "arranged": None, "props": {"raw": sp},
            })
        elif "text" in node:
            t = node["text"]
            at = t.get("at") or {}
            fs = t.get("font-size", 12)
            fw = t.get("font-weight", "normal")
            fst = t.get("font-style", "normal")
            # Resolve content against the composite-element instance context so
            # bindings like $self.title become real strings before measurement.
            resolved = resolve(t.get("content"), ctx) if ctx else None
            # `max-width` triggers greedy word-wrap during measure so the parent
            # stack sees the wrapped (narrower) bounding box. Same wrap is
            # re-applied at emit time below; both calls hit the same helper so
            # they always agree.
            max_w = t.get("max-width")
            if max_w is not None and isinstance(resolved, str):
                resolved = _wrap_text(resolved, max_w, fs, fw, fst)
            # Rotation flips the effective bounding box so the parent stack
            # allocates the right axis. Wrapping happened against the
            # unrotated line widths above (correct — wrap reasons about
            # natural text width); the rotation only affects what dimensions
            # the laid-out text occupies in the parent's coordinate space.
            rotation = t.get("rotation") or 0
            tw, th = (measure_text(resolved, fs, fw, fst, rotation=rotation)
                      if resolved else (0, 0))
            out.append({
                "type": "text", "id": "", "layout": "leaf",
                "declared": {"x": at.get("x"), "y": at.get("y"), "w": tw, "h": th},
                "padding": edges(None), "margin": edges(t.get("margin")),
                "children": [], "measured": None, "arranged": None, "props": {"raw": t},
            })
        elif "image" in node:
            i = node["image"]
            sz = i.get("size", {})
            out.append({
                "type": "image", "id": "", "layout": "leaf",
                "declared": {"x": None, "y": None, "w": sz.get("w", 38), "h": sz.get("h", 38)},
                "padding": edges(None), "margin": edges(i.get("margin")),
                "children": [], "measured": None, "arranged": None, "props": {"raw": i},
            })
        elif "content-presenter" in node:
            cp = node["content-presenter"] or {}
            parent_inst = (ctx or {}).get("self") or {}
            cat = parent_inst.get("category")
            dt = (vlib or {}).get("data-templates", {}).get(cat)                  or (vlib or {}).get("data-templates", {}).get("_default")
            if dt:
                kids = _expand_template_subtree(dt.get("template", []), vlib, [], ctx)
            else:
                kids = []
            out.append({
                "type": "content-presenter", "id": "", "layout": "canvas",
                "declared": {"x": None, "y": None, "w": None, "h": None},
                "padding": edges(None), "margin": edges(None),
                "children": kids, "measured": None, "arranged": None,
                "props": {"raw": cp},
            })
        elif "items-presenter" in node:
            ip = node["items-presenter"] or {}
            # Default layout from the template; markup-instance can override
            # via items-layout / items-cols / items-rows on the parent element.
            layout_hint = ip.get("layout") or "canvas"
            cols = ip.get("cols")
            rows = ip.get("rows")
            parent_inst = (ctx or {}).get("self") or {}
            if parent_inst.get("items-layout"):
                layout_hint = parent_inst["items-layout"]
            if parent_inst.get("items-cols") is not None:
                cols = parent_inst["items-cols"]
            if parent_inst.get("items-rows") is not None:
                rows = parent_inst["items-rows"]
            ip_decl = {"x": None, "y": None, "w": None, "h": None}
            if ip.get("stretch") is not None:
                ip_decl["stretch"] = ip["stretch"]
            ip_node = {
                "type": "items-presenter", "id": "", "layout": layout_hint,
                "declared": ip_decl,
                "padding": edges(None), "margin": edges(None),
                "children": list(items_inject), "measured": None, "arranged": None,
                "props": {"raw": ip},
            }
            if layout_hint == "ugrid":
                ip_node["cols"] = cols if cols is not None else 1
                ip_node["rows"] = rows if rows is not None else 1
                if parent_inst.get("items-autofit"):
                    ip_node["autofit"] = True
                if parent_inst.get("items-show-cells"):
                    ip_node["show-cells"] = True
            if parent_inst.get("items-h-align") is not None:
                ip_node["h-align"] = parent_inst["items-h-align"]
            if parent_inst.get("items-v-align") is not None:
                ip_node["v-align"] = parent_inst["items-v-align"]
            out.append(ip_node)
    return out


def _build_layout_tree(markup, vlib=None):
    def child_node(el_kind, inst):
        # Merge Style setters into the instance so defaults (e.g. actor.icon)
        # are present when $self bindings resolve. Then resolve any relative
        # icon path against the visual-library / project root.
        style = (vlib or {}).get("styles", {}).get(el_kind)
        if style:
            inst = apply_style(style, inst)
            inst.pop("__template__", None)
            if "icon" in inst:
                inst["icon"] = _resolve_icon_path(inst["icon"], vlib)
        n = {
            "type": el_kind, "id": inst.get("id", ""),
            "layout": inst.get("layout", "canvas"),
            "declared": {"x": inst.get("x"), "y": inst.get("y"),
                         "w": inst.get("width"), "h": inst.get("height"),
                         "min-w": inst.get("min-width"),
                         "min-h": inst.get("min-height"),
                         "max-w": inst.get("max-width"),
                         "max-h": inst.get("max-height"),
                         "cell": inst.get("cell"),
                         "colspan": inst.get("colspan", 1),
                         "rowspan": inst.get("rowspan", 1),
                         "stretch": inst.get("stretch"),
                         "alignment": inst.get("alignment", "center"),
                         "h-anchor-ref": _make_axis_ref(inst, "h"),
                         "v-anchor-ref": _make_axis_ref(inst, "v")},
            "padding": edges(inst.get("padding")),
            "margin":  edges(inst.get("margin")),
            "children": [], "measured": None, "arranged": None,
            "props": {"inst": inst},
        }
        nested = []
        for c in inst.get("children", []):
            for k in ("location", "building-block", "component", "actor", "stack", "stack-panel"):
                if k in c:
                    if k in ("stack", "stack-panel"):
                        nested.append(stack_node(c[k]))
                    else:
                        nested.append(child_node(k, c[k]))
                    break
        if style:
            tpl = style.get("setters", {}).get("template", [])
            # Component data templates reference $technology.icon — pre-resolve
            # the technology now so the build-time expansion can measure it.
            expand_ctx = {"self": inst}
            if el_kind == "component":
                embedded = inst.get("technology")
                if embedded:
                    icon = embedded.get("icon")
                    if isinstance(icon, str) and icon and not Path(icon).is_absolute():
                        icon = ROOT / icon
                    expand_ctx["technology"] = {**embedded, "icon": icon}
                else:
                    tech_id = inst.get("implemented-by")
                    if tech_id and _tlib_path_global is not None:
                        expand_ctx["technology"] = load_technology(_tlib_path_global, tech_id)
            n["children"] = _expand_template_subtree(tpl, vlib, nested, expand_ctx)
        else:
            n["children"] = nested
        return n

    def stack_node(sp):
        orient = sp.get("orientation", "vertical")
        layout = "stack-panel-vertical" if orient == "vertical" else "stack-panel-horizontal"
        n = {
            "type": "stack-panel-element", "id": sp.get("id", ""),
            "layout": layout,
            "h-align": sp.get("h-align"),
            "v-align": sp.get("v-align"),
            "wrap":    sp.get("wrap"),
            "declared": {"x": sp.get("x"), "y": sp.get("y"),
                         "w": sp.get("width"), "h": sp.get("height")},
            "padding": edges(sp.get("padding")),
            "margin":  edges(sp.get("margin")),
            "children": [], "measured": None, "arranged": None,
            "props": {"inst": sp},
        }
        for c in sp.get("children", []):
            for k in ("location", "building-block", "component", "actor", "stack", "stack-panel"):
                if k in c:
                    if k in ("stack", "stack-panel"):
                        n["children"].append(stack_node(c[k]))
                    else:
                        n["children"].append(child_node(k, c[k]))
                    break
        return n

    canvas_padding = edges((markup.get("canvas") or {}).get("padding"))
    root = {"type": "root", "id": "root", "layout": "canvas",
            "declared": {"x": 0, "y": 0, "w": None, "h": None},
            "padding": canvas_padding, "margin": edges(None),
            "children": [], "measured": None, "arranged": None}
    for el in markup.get("elements", []):
        for k in ("location", "building-block", "component", "actor", "stack", "stack-panel"):
            if k in el:
                if k in ("stack", "stack-panel"):
                    root["children"].append(stack_node(el[k]))
                else:
                    root["children"].append(child_node(k, el[k]))
                break
    return root


def _effective_ugrid_dims(node):
    """Return (cols, rows) for a ugrid node. If `autofit` is set, declared
    cols/rows are a LOWER bound — effective dims grow to fit all children's
    declared cells + colspan/rowspan."""
    cols = node.get("cols") or 1
    rows = node.get("rows") or 1
    if node.get("autofit"):
        for c in node.get("children", []):
            decl = c.get("declared") or {}
            cell = decl.get("cell")
            if not cell:
                continue
            ccol, crow = cell[0], cell[1]
            cs = decl.get("colspan", 1) or 1
            rs = decl.get("rowspan", 1) or 1
            cols = max(cols, ccol + cs - 1)
            rows = max(rows, crow + rs - 1)
    return cols, rows


def _ugrid_h_pos(cell_x, cell_w, child_w, alignment):
    """Horizontal placement of a non-stretched child inside its cell."""
    if alignment in ("left", "top-left", "bottom-left"):
        return cell_x
    if alignment in ("right", "top-right", "bottom-right"):
        return cell_x + (cell_w - child_w)
    return cell_x + (cell_w - child_w) / 2  # center / top / bottom -> centred horizontally


def _ugrid_v_pos(cell_y, cell_h, child_h, alignment):
    """Vertical placement of a non-stretched child inside its cell."""
    if alignment in ("top", "top-left", "top-right"):
        return cell_y
    if alignment in ("bottom", "bottom-left", "bottom-right"):
        return cell_y + (cell_h - child_h)
    return cell_y + (cell_h - child_h) / 2  # center / left / right -> centred vertically


def _default_size_for(node_type):
    """Per-type fallback size when neither declared nor measurable from children.
    Wrapper / layout-only types default to 0x0 so an *empty* items-presenter
    or stack-panel doesn't add phantom space to its parent's bbox."""
    return {
        "location": (200, 200), "building-block": (200, 200),
        "component": (100, 100), "actor": (100, 100),
        "text": (60, 16), "image": (38, 38),
        # Wrappers / layout-only nodes — empty means 0x0
        "items-presenter": (0, 0), "stack-panel": (0, 0), "border": (0, 0),
    }.get(node_type, (100, 100))


def _clamp_measured(node, w, h):
    """Clamp computed measured size to declared min/max range. Min wins over max
    on degenerate ranges where min > max (treat min as the floor)."""
    d = node["declared"]
    minw, minh = d.get("min-w"), d.get("min-h")
    maxw, maxh = d.get("max-w"), d.get("max-h")
    if maxw is not None: w = min(w, maxw)
    if minw is not None: w = max(w, minw)
    if maxh is not None: h = min(h, maxh)
    if minh is not None: h = max(h, minh)
    return w, h


def measure(node):
    """Bottom-up: assign node['measured']."""
    for c in node["children"]:
        measure(c)

    dw, dh = node["declared"].get("w"), node["declared"].get("h")
    if not node["children"] or node.get("layout") == "leaf":
        if dw is None or dh is None:
            fw, fh = _default_size_for(node["type"])
            dw = fw if dw is None else dw
            dh = fh if dh is None else dh
        cw, ch = _clamp_measured(node, dw, dh)
        node["measured"] = {"w": cw, "h": ch}
        return

    layout = node.get("layout", "canvas")
    pad = node["padding"]
    if layout in ("canvas", "absolute", "root"):
        # Canvas: bbox of children, computed with both min and max so the
        # container grows in any direction children spill (left/up overflow
        # included). For anchor-positioned children whose arranged position
        # is known (from a prior iteration), use the resolved local position;
        # otherwise fall back to declared.x/y. Pair with _content_offset_x/y
        # set by `_normalize_canvas_overflow` to shift children inside the
        # grown bounds.
        min_x = float("inf"); min_y = float("inf")
        max_x = float("-inf"); max_y = float("-inf")
        container_ax = (node.get("arranged") or {}).get("x", 0)
        container_ay = (node.get("arranged") or {}).get("y", 0)
        for c in node["children"]:
            ca = c.get("arranged")
            # Position: prefer arranged for all children — flow children get
            # shifted by `_content_offset_x/y` and their declared.x/y misses
            # that. Anchored children's positions only exist in arranged.
            # Size: ALWAYS use measured (intrinsic). Using arranged.w/h would
            # feed parent-constrained sizes back into the parent's measure
            # and create a stable-but-wrong fixed point when the parent uses
            # stretch to fill its own parent.
            if ca:
                local_x = ca["x"] - container_ax
                local_y = ca["y"] - container_ay
            else:
                local_x = c["declared"].get("x") or 0
                local_y = c["declared"].get("y") or 0
            cw = c["measured"]["w"] if c["measured"] else _default_size_for(c["type"])[0]
            ch = c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1]
            min_x = min(min_x, local_x); max_x = max(max_x, local_x + cw)
            min_y = min(min_y, local_y); max_y = max(max_y, local_y + ch)
        if min_x == float("inf"):
            min_x = max_x = min_y = max_y = 0
        # Width / height grows by (-min) when children are at negative
        # local coords; clamps to max otherwise.
        extent_w = max_x - min(0, min_x)
        extent_h = max_y - min(0, min_y)
        w = extent_w + pad["left"] + pad["right"]
        h = extent_h + pad["top"] + pad["bottom"]
    elif layout == "stack-panel-vertical":
        # Mirror the arrange flow so the measured height matches what arrange
        # produces: pinned children (with `at:`) push the cursor for following
        # flowed children, and child top/bottom margins add to the flow.
        wrap = node.get("wrap") and dh
        if wrap:
            col_x = 0
            cursor = 0
            col_w = 0
            max_x = 0
            for c in node["children"]:
                cw = c["measured"]["w"]; ch = c["measured"]["h"]
                cm = c.get("margin") or edges(None)
                step = cm["top"] + ch + cm["bottom"]
                if cursor > 0 and cursor + step > dh:
                    col_x += col_w
                    cursor = 0
                    col_w = 0
                cursor += step
                col_w = max(col_w, cw + cm["left"] + cm["right"])
                max_x = max(max_x, col_x + col_w)
            w = max_x + pad["left"] + pad["right"]
            h = dh + pad["top"] + pad["bottom"]
        else:
            cursor = 0
            max_pinned_bottom = 0
            max_w = 0
            for c in node["children"]:
                cw = c["measured"]["w"]
                ch = c["measured"]["h"]
                cm = c.get("margin") or edges(None)
                if c["declared"].get("y") is not None:
                    pb = c["declared"]["y"] + ch
                    max_pinned_bottom = max(max_pinned_bottom, pb)
                    pw = (c["declared"].get("x") or 0) + cw
                    max_w = max(max_w, pw)
                else:
                    cursor = max(cursor, max_pinned_bottom)
                    cursor += cm["top"] + ch + cm["bottom"]
                    max_w = max(max_w, cw + cm["left"] + cm["right"])
            h_total = max(cursor, max_pinned_bottom)
            w = max_w + pad["left"] + pad["right"]
            h = h_total + pad["top"] + pad["bottom"]
    elif layout == "stack-panel-horizontal":
        wrap = node.get("wrap") and dw
        if wrap:
            cursor = 0
            row_y = 0
            row_h = 0
            max_y = 0
            for c in node["children"]:
                cw = c["measured"]["w"]; ch = c["measured"]["h"]
                cm = c.get("margin") or edges(None)
                step = cm["left"] + cw + cm["right"]
                if cursor > 0 and cursor + step > dw:
                    row_y += row_h
                    cursor = 0
                    row_h = 0
                cursor += step
                row_h = max(row_h, ch + cm["top"] + cm["bottom"])
                max_y = max(max_y, row_y + row_h)
            w = dw + pad["left"] + pad["right"]
            h = max_y + pad["top"] + pad["bottom"]
        else:
            cursor = 0
            max_pinned_right = 0
            max_h = 0
            for c in node["children"]:
                cw = c["measured"]["w"]
                ch = c["measured"]["h"]
                cm = c.get("margin") or edges(None)
                if c["declared"].get("x") is not None:
                    pr = c["declared"]["x"] + cw
                    max_pinned_right = max(max_pinned_right, pr)
                    pinh = (c["declared"].get("y") or 0) + ch
                    max_h = max(max_h, pinh)
                else:
                    cursor = max(cursor, max_pinned_right)
                    cursor += cm["left"] + cw + cm["right"]
                    max_h = max(max_h, ch + cm["top"] + cm["bottom"])
            w_total = max(cursor, max_pinned_right)
            w = w_total + pad["left"] + pad["right"]
            h = max_h + pad["top"] + pad["bottom"]
    elif layout == "ugrid":
        # Uniform cell size — max((child.w + margin.lr) / colspan,
        #                        (child.h + margin.tb) / rowspan).
        # Margin is included so a child's gutter widens its cell instead of
        # leaking out of the grid bounds at arrange time.
        cols, rows = _effective_ugrid_dims(node)
        channels = node.get("channels") or []
        effective_cols = cols + sum(1 for c in channels if c["axis"] == "col")
        effective_rows = rows + sum(1 for c in channels if c["axis"] == "row")
        cell_w = 0
        cell_h = 0
        for c in node["children"]:
            cm = c.get("margin") or edges(None)
            cw = c["measured"]["w"] + cm["left"] + cm["right"]
            ch = c["measured"]["h"] + cm["top"] + cm["bottom"]
            cs = c["declared"].get("colspan") or 1
            rs = c["declared"].get("rowspan") or 1
            cell_w = max(cell_w, cw / cs if cs else cw)
            cell_h = max(cell_h, ch / rs if rs else ch)
        w = cell_w * effective_cols + pad["left"] + pad["right"]
        h = cell_h * effective_rows + pad["top"] + pad["bottom"]
    else:
        # Unknown layout — fall back to canvas bbox at declared positions.
        max_x = max_y = 0
        for c in node["children"]:
            cx = c["declared"].get("x") or 0
            cy = c["declared"].get("y") or 0
            max_x = max(max_x, cx + c["measured"]["w"])
            max_y = max(max_y, cy + c["measured"]["h"])
        w = max_x + pad["left"] + pad["right"]
        h = max_y + pad["top"] + pad["bottom"]

    # User-declared size wins; computed size only fills in what's missing.
    fw = dw if dw is not None else w
    fh = dh if dh is not None else h
    fw, fh = _clamp_measured(node, fw, fh)
    node["measured"] = {"w": fw, "h": fh}


def arrange(node, x, y, w, h):
    """Top-down: assign node['arranged'] = {x, y, w, h}; recurse into children."""
    node["arranged"] = {"x": x, "y": y, "w": w, "h": h}
    layout = node.get("layout", "canvas")
    pad = node["padding"]
    inner_x = x + pad["left"]
    inner_y = y + pad["top"]
    inner_w = max(0, w - pad["left"] - pad["right"])
    inner_h = max(0, h - pad["top"] - pad["bottom"])

    if layout in ("canvas", "absolute", "root"):
        # Composite elements' direct children are their template roots
        # (border, stack-panel, …) and must fill the composite's inner area —
        # they shouldn't shrink-wrap to their own template content when the
        # composite has declared bounds.
        is_composite = node["type"] in ("location", "building-block", "component", "actor")
        # Content offset shifts non-composite children to absorb leftward/upward
        # overflow detected by `_normalize_canvas_overflow`.
        coff_x = node.get("_content_offset_x", 0)
        coff_y = node.get("_content_offset_y", 0)
        inner_x_off = inner_x + coff_x
        inner_y_off = inner_y + coff_y
        for c in node["children"]:
            if _is_full_anchored(c):
                continue  # both axes deferred to anchor-ref pass
            if is_composite:
                # Fill-parent: child gets the parent's inner bounds
                arrange(c, inner_x, inner_y, inner_w, inner_h)
                continue
            cx = c["declared"].get("x")
            cy = c["declared"].get("y")
            cw = c["declared"].get("w")
            ch = c["declared"].get("h")
            cs = c["declared"].get("stretch")
            # Declared values win; measured/default only fill what's missing.
            # `stretch` lets a canvas child opt into filling its parent's inner
            # bounds — same vocabulary as ugrid (uniform / horizontal / vertical).
            if cx is None: cx = 0
            if cy is None: cy = 0
            if cw is None:
                cw = inner_w if cs in ("uniform", "horizontal") else (
                    c["measured"]["w"] if c["measured"] else _default_size_for(c["type"])[0])
            elif cs in ("uniform", "horizontal"):
                cw = inner_w
            if ch is None:
                ch = inner_h if cs in ("uniform", "vertical") else (
                    c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1])
            elif cs in ("uniform", "vertical"):
                ch = inner_h
            arrange(c, inner_x_off + cx, inner_y_off + cy, cw, ch)
    elif layout == "stack-panel-vertical":
        h_align = node.get("h-align")  # children's cross-axis alignment
        wrap = node.get("wrap") and inner_h > 0
        if wrap:
            # Children flow top-to-bottom; start a new column when the next
            # child would exceed inner_h.
            col_x = inner_x
            cursor = inner_y
            col_w = 0
            for c in node["children"]:
                if _is_anchored(c):
                    continue  # deferred to anchor-ref pass
                cw = c["measured"]["w"] if c["measured"] else _default_size_for(c["type"])[0]
                ch = c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1]
                cm = c.get("margin") or edges(None)
                step = cm["top"] + ch + cm["bottom"]
                if cursor > inner_y and cursor + step > inner_y + inner_h:
                    col_x += col_w
                    cursor = inner_y
                    col_w = 0
                arrange(c, col_x + cm["left"], cursor + cm["top"], cw, ch)
                cursor += step
                col_w = max(col_w, cw + cm["left"] + cm["right"])
        else:
            # Pinned children (declared y) consume a band starting at inner_y;
            # flow children begin after that band. Pre-compute the band so
            # stretch and v-align math both subtract it from inner_h.
            max_pinned_offset = 0
            for c in node["children"]:
                if _is_anchored(c):
                    continue
                cdy = c["declared"].get("y")
                if cdy is not None:
                    pch = c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1]
                    max_pinned_offset = max(max_pinned_offset, cdy + pch)

            # Main-axis stretch: a flow child with [stretch = vertical] claims
            # an equal share of the height left over after fixed children.
            # A child is "in y-axis flow" iff it isn't v-anchored and isn't
            # pinned (no cdy). Partial-h-anchored children DO consume y.
            flow_kids = [c for c in node["children"]
                         if not c["declared"].get("v-anchor-ref")
                         and c["declared"].get("y") is None
                         and not _is_full_anchored(c)]
            stretchy_h = [c for c in flow_kids
                          if c["declared"].get("stretch") == "vertical"]
            if stretchy_h:
                fixed_h = 0
                for c in flow_kids:
                    if c["declared"].get("stretch") == "vertical":
                        continue
                    cch = c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1]
                    ccm = c.get("margin") or edges(None)
                    fixed_h += ccm["top"] + cch + ccm["bottom"]
                available = max(0, inner_h - max_pinned_offset - fixed_h)
                stretch_share_h = available / len(stretchy_h)
            else:
                stretch_share_h = 0

            # Main-axis alignment: top (default), center, or bottom. Only kicks
            # in when there's no stretchy child consuming the spare height.
            v_align_main = node.get("v-align")
            if not stretchy_h and v_align_main in ("center", "bottom"):
                total_h = 0
                for c in flow_kids:
                    cch = c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1]
                    ccm = c.get("margin") or edges(None)
                    total_h += ccm["top"] + cch + ccm["bottom"]
                spare = max(0, inner_h - max_pinned_offset - total_h)
                cursor_start = inner_y + max_pinned_offset + (
                    spare / 2 if v_align_main == "center" else spare)
            else:
                cursor_start = inner_y

            cursor = cursor_start
            max_pinned_bottom = inner_y
            for c in node["children"]:
                if _is_full_anchored(c):
                    continue  # both axes deferred to anchor-ref pass
                cw = c["measured"]["w"] if c["measured"] else _default_size_for(c["type"])[0]
                ch = c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1]
                cm = c.get("margin") or edges(None)
                cdx = c["declared"].get("x")
                cdy = c["declared"].get("y")
                h_ar = c["declared"].get("h-anchor-ref")
                v_ar = c["declared"].get("v-anchor-ref")
                # Cross-axis (x) is overridden by phase B when h-anchored;
                # otherwise honour h-align.
                if h_ar:
                    cx_offset = 0  # placeholder; phase B sets x
                elif h_align == "stretch":
                    cw = max(0, inner_w - cm["left"] - cm["right"])
                    cx_offset = 0
                elif h_align == "center":
                    cx_offset = max(0, (inner_w - cw - cm["left"] - cm["right"]) // 2)
                elif h_align == "end":
                    cx_offset = max(0, inner_w - cw - cm["left"] - cm["right"])
                else:
                    cx_offset = 0
                # Main-axis stretch only for in-flow (non-anchored, non-pinned).
                if (cdy is None and not v_ar and stretchy_h
                        and c["declared"].get("stretch") == "vertical"):
                    ch = max(0, stretch_share_h - cm["top"] - cm["bottom"])
                # Cross-axis x: placeholder if h-anchored, else cross-axis offset.
                place_x_flow = inner_x if h_ar else inner_x + cx_offset + cm["left"]
                if v_ar:
                    # Partial v: y deferred to phase B; cursor unchanged.
                    arrange(c, place_x_flow, inner_y, cw, ch)
                elif cdy is not None:
                    # Pinned y. cdx wins on x for non-anchored children.
                    if h_ar:
                        place_x = inner_x  # placeholder
                    else:
                        place_x = inner_x + (cdx if cdx is not None else cx_offset)
                    place_y = inner_y + cdy
                    arrange(c, place_x, place_y, cw, ch)
                    max_pinned_bottom = max(max_pinned_bottom, place_y + ch)
                else:
                    # Flow y; cursor advances.
                    cursor = max(cursor, max_pinned_bottom)
                    cursor += cm["top"]
                    arrange(c, place_x_flow, cursor, cw, ch)
                    cursor += ch + cm["bottom"]
    elif layout == "stack-panel-horizontal":
        v_align = node.get("v-align")  # children's cross-axis alignment
        wrap = node.get("wrap") and inner_w > 0
        if wrap:
            cursor = inner_x
            row_y = inner_y
            row_h = 0
            for c in node["children"]:
                if _is_anchored(c):
                    continue  # deferred to anchor-ref pass
                cw = c["measured"]["w"] if c["measured"] else _default_size_for(c["type"])[0]
                ch = c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1]
                cm = c.get("margin") or edges(None)
                step = cm["left"] + cw + cm["right"]
                if cursor > inner_x and cursor + step > inner_x + inner_w:
                    row_y += row_h
                    cursor = inner_x
                    row_h = 0
                arrange(c, cursor + cm["left"], row_y + cm["top"], cw, ch)
                cursor += step
                row_h = max(row_h, ch + cm["top"] + cm["bottom"])
        else:
            # Main-axis stretch: a flow child with [stretch = horizontal]
            # claims an equal share of the width left over after fixed children.
            # A child is "in x-axis flow" iff it isn't h-anchored.
            flow_kids = [c for c in node["children"]
                         if not c["declared"].get("h-anchor-ref")
                         and not _is_full_anchored(c)]
            stretchy_w = [c for c in flow_kids
                          if c["declared"].get("stretch") == "horizontal"]
            if stretchy_w:
                fixed_w = 0
                for c in flow_kids:
                    if c["declared"].get("stretch") == "horizontal":
                        continue
                    ccw = c["measured"]["w"] if c["measured"] else _default_size_for(c["type"])[0]
                    ccm = c.get("margin") or edges(None)
                    fixed_w += ccm["left"] + ccw + ccm["right"]
                stretch_share_w = max(0, (inner_w - fixed_w) / len(stretchy_w))
            else:
                stretch_share_w = 0

            cursor = inner_x
            for c in node["children"]:
                if _is_full_anchored(c):
                    continue  # both axes deferred to anchor-ref pass
                cw = c["measured"]["w"] if c["measured"] else _default_size_for(c["type"])[0]
                ch = c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1]
                cm = c.get("margin") or edges(None)
                h_ar = c["declared"].get("h-anchor-ref")
                v_ar = c["declared"].get("v-anchor-ref")
                # Cross-axis (y) is overridden by phase B when v-anchored;
                # otherwise honour v-align.
                if v_ar:
                    cy_offset = 0  # placeholder; phase B sets y
                elif v_align == "stretch":
                    ch = max(0, inner_h - cm["top"] - cm["bottom"])
                    cy_offset = 0
                elif v_align == "center":
                    cy_offset = max(0, (inner_h - ch - cm["top"] - cm["bottom"]) // 2)
                elif v_align == "end":
                    cy_offset = max(0, inner_h - ch - cm["top"] - cm["bottom"])
                else:
                    cy_offset = 0
                # Main-axis stretch overrides natural width (in-flow only).
                if (not h_ar and stretchy_w
                        and c["declared"].get("stretch") == "horizontal"):
                    cw = max(0, stretch_share_w - cm["left"] - cm["right"])
                place_y_flow = inner_y if v_ar else inner_y + cy_offset + cm["top"]
                if h_ar:
                    # Partial h: x deferred to phase B; cursor unchanged.
                    arrange(c, inner_x, place_y_flow, cw, ch)
                else:
                    cursor += cm["left"]
                    arrange(c, cursor, place_y_flow, cw, ch)
                    cursor += cw + cm["right"]
    elif layout == "ugrid":
        # Strict: every child must declare its cell via `at (col, row)`.
        # No auto-cursor — silent placement is too easy a footgun.
        cols, rows = _effective_ugrid_dims(node)
        # Channel-aware effective grid: extra rows/cols inserted to host
        # connector paths that would otherwise cross components.
        channels = node.get("channels") or []
        col_channels = sorted([c["position"] for c in channels if c["axis"] == "col"])
        row_channels = sorted([c["position"] for c in channels if c["axis"] == "row"])
        effective_cols = cols + len(col_channels)
        effective_rows = rows + len(row_channels)
        cell_w = inner_w / effective_cols if effective_cols else inner_w
        cell_h = inner_h / effective_rows if effective_rows else inner_h

        # Cache the resolved grid on the node so the emit phase can render
        # dotted cell-boundary overlays when [show-cells = true] is set.
        node["_cell_grid"] = {
            "x0": inner_x, "y0": inner_y,
            "cell_w": cell_w, "cell_h": cell_h,
            "cols": effective_cols, "rows": effective_rows,
        }

        # Pixel x of each channel's centre (used by connectors that route
        # through the channel). Stored back on the channel record.
        for ch in channels:
            if ch["axis"] == "col":
                # Effective col index = floor(position) + 1 + count(col_channels with position < this position)
                preceding = sum(1 for p in col_channels if p < ch["position"])
                eff_col = int(ch["position"]) + preceding + 1  # 1-indexed effective
                ch["pixel_center"] = inner_x + (eff_col - 0.5) * cell_w
            else:  # row
                preceding = sum(1 for p in row_channels if p < ch["position"])
                eff_row = int(ch["position"]) + preceding + 1
                ch["pixel_center"] = inner_y + (eff_row - 0.5) * cell_h

        parent_id = node.get("id") or node.get("type", "ugrid")
        for c in node["children"]:
            cs = c["declared"].get("colspan") or 1
            rs = c["declared"].get("rowspan") or 1
            cell = c["declared"].get("cell")
            if not cell:
                child_id = c.get("id") or c.get("type", "<unknown>")
                raise ValueError(
                    f"ugrid placement: child '{child_id}' inside '{parent_id}' "
                    f"has no `at (col, row)`. Every ugrid child must declare "
                    f"its cell explicitly (1-indexed)."
                )
            col, row = cell[0], cell[1]
            # Effective indices shift by +1 per channel inserted before
            # the declared col/row.
            eff_col = col + sum(1 for p in col_channels if p < col)
            eff_row = row + sum(1 for p in row_channels if p < row)
            # The cell box this child is allotted (covers colspan x rowspan).
            cell_x = inner_x + (eff_col - 1) * cell_w
            cell_y = inner_y + (eff_row - 1) * cell_h
            cell_box_w = cs * cell_w
            cell_box_h = rs * cell_h
            # Inset the cell box by the child's margin so the child's
            # placement area excludes its gutter (mirrors how stack-arrange
            # advances by `cm["left"]` etc.). Stretch fills the inset box.
            cm = c.get("margin") or edges(None)
            cell_x      += cm["left"]
            cell_y      += cm["top"]
            cell_box_w   = max(0, cell_box_w - cm["left"] - cm["right"])
            cell_box_h   = max(0, cell_box_h - cm["top"]  - cm["bottom"])
            # Default: child renders at its measured intrinsic size, centered
            # in its cell. `stretch` opts back into filling the cell on one or
            # both axes; `alignment` chooses the edge for non-stretched axes.
            stretch   = c["declared"].get("stretch")
            alignment = c["declared"].get("alignment") or "center"
            mw = c["measured"]["w"] if c["measured"] else _default_size_for(c["type"])[0]
            mh = c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1]
            if stretch == "uniform":
                place_x, place_y = cell_x, cell_y
                place_w, place_h = cell_box_w, cell_box_h
            elif stretch == "horizontal":
                place_w, place_h = cell_box_w, mh
                place_x = cell_x
                place_y = _ugrid_v_pos(cell_y, cell_box_h, place_h, alignment)
            elif stretch == "vertical":
                place_w, place_h = mw, cell_box_h
                place_x = _ugrid_h_pos(cell_x, cell_box_w, place_w, alignment)
                place_y = cell_y
            else:
                place_w, place_h = mw, mh
                place_x = _ugrid_h_pos(cell_x, cell_box_w, place_w, alignment)
                place_y = _ugrid_v_pos(cell_y, cell_box_h, place_h, alignment)
            arrange(c, place_x, place_y, place_w, place_h)
    else:
        # Fall back to canvas semantics
        for c in node["children"]:
            if _is_anchored(c):
                continue  # deferred to anchor-ref pass
            cx = c["declared"].get("x") or 0
            cy = c["declared"].get("y") or 0
            cw = c["measured"]["w"] if c["measured"] else _default_size_for(c["type"])[0]
            ch = c["measured"]["h"] if c["measured"] else _default_size_for(c["type"])[1]
            arrange(c, inner_x + cx, inner_y + cy, cw, ch)


def find_items_presenter_y(node, parent_origin=(0, 0)):
    """Search the tree for an items-presenter, return its arranged (x, y)
    relative to the given origin, or None if not found."""
    if node["type"] == "items-presenter" and node.get("arranged"):
        return (node["arranged"]["x"] - parent_origin[0],
                node["arranged"]["y"] - parent_origin[1])
    for c in node["children"]:
        r = find_items_presenter_y(c, parent_origin)
        if r is not None:
            return r
    return None



def _ctx_for(node, vlib, tlib_root):
    """Build a $self / $technology context for a composite-element node.
    For components, prefer an inline `technology` dict embedded by the view
    compiler (used when the architecture declares the tech inline rather than
    via a tech library); fall back to load_technology otherwise."""
    inst = node.get("props", {}).get("inst") or {}
    ctx = {"self": inst}
    if node["type"] == "component":
        embedded = inst.get("technology")
        if embedded:
            icon = embedded.get("icon")
            if isinstance(icon, str) and icon and not Path(icon).is_absolute():
                icon = ROOT / icon
            ctx["technology"] = {**embedded, "icon": icon}
        else:
            tech_id = inst.get("implemented-by")
            if tech_id:
                ctx["technology"] = load_technology(tlib_root, tech_id)
    return ctx


def _emit_node(node, ctx, vlib, tlib_root, owner_inst=None):
    """Walk a layout-tree node, emit a list of scene primitives at arranged
    positions. `ctx` carries $self/$technology for binding resolution; it is
    swapped when the walk descends into a composite element."""
    a = node.get("arranged") or {}
    out = []

    if node["type"] == "root":
        for c in node["children"]:
            out.append(_emit_node(c, ctx, vlib, tlib_root, owner_inst))
        return {"_root_children": out}

    if node["type"] == "stack-panel-element":
        kids = [_emit_node(c, ctx, vlib, tlib_root, owner_inst) for c in node["children"]]
        return {"canvas": {"id": node.get("id") or "stack-panel",
                           "from-element": "stack-panel", "children": kids}}

    if node["type"] in ("location", "building-block", "actor"):
        # Composite element — switch context to this element instance, emit
        # children (its template + injected items), wrap in canvas group.
        new_ctx = _ctx_for(node, vlib, tlib_root)
        kids = []
        for c in node["children"]:
            kids.append(_emit_node(c, new_ctx, vlib, tlib_root, node["props"]["inst"]))
        return {"canvas": {"id": node["id"], "from-element": node["type"], "children": kids}}

    if node["type"] == "component":
        # Component: DataTemplate is already part of the layout tree (built at
        # stage 1, measured at stage 2, arranged at stage 3). Walk arranged
        # children the same way the other composite types do.
        new_ctx = _ctx_for(node, vlib, tlib_root)
        kids = []
        for c in node["children"]:
            kids.append(_emit_node(c, new_ctx, vlib, tlib_root, node["props"]["inst"]))
        return {"canvas": {"id": node.get("id") or "component",
                           "from-element": "component", "children": kids}}

    if node["type"] == "border":
        b = node["props"]["raw"]
        kids = []
        if b.get("rect"):
            # Visible bordered rect at arranged bounds
            rect = {
                "x": a["x"], "y": a["y"], "width": a["w"], "height": a["h"],
                "rx": resolve(b.get("rx"), ctx),
                "fill": resolve(b.get("fill"), ctx) or "none",
                "stroke": resolve(b.get("stroke"), ctx) or "#000",
                "stroke-width": resolve(b.get("stroke-width"), ctx) or 1,
            }
            das = resolve(b.get("stroke-dasharray"), ctx)
            if das:
                rect["stroke-dasharray"] = das
            kids.append({"rect": rect})
        for c in node["children"]:
            kids.append(_emit_node(c, ctx, vlib, tlib_root, owner_inst))
        return {"canvas": {"id": "border", "from-element": "border", "children": kids}}

    if node["type"] == "stack-panel":
        kids = [_emit_node(c, ctx, vlib, tlib_root, owner_inst) for c in node["children"]]
        return {"canvas": {"id": "stack-panel", "from-element": "stack-panel", "children": kids}}

    if node["type"] == "items-presenter":
        kids = [_emit_node(c, ctx, vlib, tlib_root, owner_inst) for c in node["children"]]
        if node.get("layout") == "ugrid" and node.get("show-cells") and node.get("_cell_grid"):
            g = node["_cell_grid"]
            x_end = g["x0"] + g["cols"] * g["cell_w"]
            y_end = g["y0"] + g["rows"] * g["cell_h"]
            line_attrs = {"stroke": "#888", "stroke-width": 0.7,
                          "stroke-dasharray": "3,3", "opacity": 0.55}
            for i in range(g["cols"] + 1):
                x = g["x0"] + i * g["cell_w"]
                kids.append({"line": {"x1": x, "y1": g["y0"], "x2": x, "y2": y_end,
                                      **line_attrs}})
            for j in range(g["rows"] + 1):
                y = g["y0"] + j * g["cell_h"]
                kids.append({"line": {"x1": g["x0"], "y1": y, "x2": x_end, "y2": y,
                                      **line_attrs}})
        return {"canvas": {"id": "items-presenter",
                           "from-element": "items-presenter", "children": kids}}

    if node["type"] == "content-presenter":
        kids = [_emit_node(c, ctx, vlib, tlib_root, owner_inst) for c in node["children"]]
        return {"canvas": {"id": "content-presenter",
                           "from-element": "content-presenter", "children": kids}}

    if node["type"] == "text":
        t = node["props"]["raw"]
        content = resolve(t.get("content"), ctx)
        when = t.get("when")
        if when and not resolve(when, ctx):
            return {"canvas": {"id": "text-skipped", "children": []}}
        if not content:
            return {"canvas": {"id": "text-empty", "children": []}}
        # SVG text-anchor controls what `x` means: 'start' = left edge,
        # 'middle' = horizontal centre, 'end' = right edge. Arrange placed
        # the text at its left edge (a.x); shift x to match the anchor.
        anchor = t.get("anchor", "start")
        if anchor == "middle":
            text_x = a["x"] + (a.get("w") or 0) / 2
        elif anchor == "end":
            text_x = a["x"] + (a.get("w") or 0)
        else:
            text_x = a["x"]
        # SVG <text y> is the baseline by default. We want y to mean the
        # top of the layout box, so we set dominant-baseline=hanging on the
        # rendered <text> element and pass arranged.y straight through.
        fs = t.get("font-size", 10)
        fw = t.get("font-weight", "normal")
        fst = t.get("font-style", "normal")
        # Re-apply word-wrap at emit time so the renderer receives a list of
        # lines (rendered as <tspan>s) when `max-width` is in play. Mirrors
        # the measure-phase wrap above; both must agree on the line breaks.
        max_w = t.get("max-width")
        if max_w is not None and isinstance(content, str):
            content = _wrap_text(content, max_w, fs, fw, fst)
        text_node = {
            "x": text_x, "y": a["y"],
            "width": a.get("w"), "height": a.get("h"),  # measured size, for inspection
            "content": content,
            "font-size": fs,
            "font-family": t.get("font-family", "sans-serif"),
            "text-anchor": anchor,
            "dominant-baseline": "hanging",
            "fill": resolve(t.get("fill"), ctx) or "#000",
        }
        if t.get("font-weight") and t["font-weight"] != "normal":
            text_node["font-weight"] = t["font-weight"]
        if t.get("font-style") and t["font-style"] != "normal":
            text_node["font-style"] = t["font-style"]
        return {"text": text_node}

    if node["type"] == "image":
        i = node["props"]["raw"]
        src_path = resolve(i.get("src"), ctx)
        href = icon_data_uri(src_path) if isinstance(src_path, Path) else (src_path or "")
        if not href:
            return {"canvas": {"id": "image-empty", "children": []}}
        return {"image": {
            "x": a["x"], "y": a["y"], "width": a["w"], "height": a["h"],
            "href": href, "preserve-aspect-ratio": "xMidYMid meet"}}

    # Unknown node type: silently empty group
    return {"canvas": {"id": f"unknown-{node['type']}", "children": []}}


def emit_from_tree(tree, vlib, tlib_root, registry):
    """Top-level emit: walks the arranged tree, returns a list of scene nodes
    suitable for the existing renderer."""
    def reg_descend(c):
        # Register the bounds of any composite-element node we encounter so
        # connectors can look them up. Walks through stack-panel wrappers too.
        if c.get("arranged") and c.get("id") and c["type"] in ("location", "building-block", "component", "actor"):
            ar = c["arranged"]
            registry[c["id"]] = {"x": ar["x"], "y": ar["y"],
                                 "width": ar["w"], "height": ar["h"],
                                 "type": c["type"],
                                 "margin": c.get("margin") or edges(None)}
        for cc in c.get("children", []):
            reg_descend(cc)

    scene = []
    if tree["type"] == "root":
        for c in tree["children"]:
            reg_descend(c)
            scene.append(_emit_node(c, {}, vlib, tlib_root, None))
    return scene


def measure_summary(node, indent=0):
    pad = "  " * indent
    label = f"{node['type']}/{node['id'] or '?'}"
    d = node["declared"]
    decl = f"declared=({d['x']},{d['y']},{d['w']},{d['h']})"
    m = node["measured"] or {}
    a = node.get("arranged") or {}
    meas = f"measured=({m.get('w')},{m.get('h')})"
    arr  = f"arranged=({a.get('x')},{a.get('y')},{a.get('w')},{a.get('h')})" if a else ""
    out = [f"{pad}{label:32s}  {decl:38s}  {meas:24s}  {arr}"]
    for c in node["children"]:
        out.append(measure_summary(c, indent + 1))
    return "\n".join(out)


# Per-location items-presenter offset, populated by run_layout() and consumed
# by compile_location for nested-child positioning.
_items_presenter_y_for = {}


def _collect_id_index(tree):
    """{id: node} over the whole layout tree. Used by anchor-ref resolution."""
    idx = {}
    def walk(n):
        if n.get("id"):
            idx[n["id"]] = n
        for c in n.get("children", []):
            walk(c)
    walk(tree)
    return idx


def _collect_anchor_refs(tree):
    """All layout-tree nodes whose declared.anchor-ref is set."""
    out = []
    def walk(n):
        for c in n.get("children", []):
            if _is_anchored(c):
                out.append(c)
            walk(c)
    walk(tree)
    return out


def _build_connector_constraints(markup, vlib):
    """Build {frozenset((src, dst)): {"min-w": value, "min-h": value}} from the
    markup's connector list. Each connector's style is resolved (so connector.yaml
    setters like min-width=50 apply). Constraints are undirected — the gap between
    two endpoints is the same regardless of arrow direction. Multiple connectors
    between the same pair contribute the strictest (max) min on each axis."""
    out = {}
    if not isinstance(markup, dict):
        return out
    elements = markup.get("elements") or []
    style = (vlib or {}).get("styles", {}).get("connector")
    for el in elements:
        if not isinstance(el, dict) or "connector" not in el:
            continue
        conn = el["connector"]
        src = (conn.get("from") or {}).get("target") if isinstance(conn.get("from"), dict) else conn.get("from")
        dst = (conn.get("to") or {}).get("target")   if isinstance(conn.get("to"), dict)   else conn.get("to")
        if not src or not dst or src == dst:
            continue
        resolved = apply_style(style, dict(conn)) if style else dict(conn)
        mw = resolved.get("min-width")
        mh = resolved.get("min-height")
        if not mw and not mh:
            continue
        key = frozenset((src, dst))
        slot = out.setdefault(key, {"min-w": 0, "min-h": 0})
        if mw: slot["min-w"] = max(slot["min-w"], mw)
        if mh: slot["min-h"] = max(slot["min-h"], mh)
    return out


def _arrange_anchor_refs(tree, connector_constraints=None):
    """Second arrange pass: place children whose `at` is an anchor-ref.
    Each axis is resolved independently: an h-anchor on n.h depends only on
    its target's h-axis being settled, not on the target's v-axis. This lets
    `n.h -> target.h` and `target.v -> n.v` co-exist (they form an
    element-level cycle but no per-axis cycle).

    `connector_constraints` (optional) widens placement gaps when the natural
    anchor-induced distance between r and its target is smaller than what the
    connectors between them require (min-width / min-height on the connector
    style)."""
    refs = _collect_anchor_refs(tree)
    if not refs:
        return
    id_index = _collect_id_index(tree)

    # Pre-seed each ref's arranged with measured size so that as we settle one
    # axis at a time, downstream `compute_anchor` calls can read the partially
    # populated bbox. Existing x/y (set by pass A for partial-anchored children
    # in canvas branches) is preserved as the fallback for the unanchored axis;
    # stack-panel partial-anchored children have no pass-A arranged and start at 0.
    for r in refs:
        mw = r["measured"]["w"] if r["measured"] else _default_size_for(r["type"])[0]
        mh = r["measured"]["h"] if r["measured"] else _default_size_for(r["type"])[1]
        a = r.get("arranged") or {}
        r["arranged"] = {
            "x": a.get("x", 0),
            "y": a.get("y", 0),
            "w": mw,
            "h": mh,
        }

    def _resolve_axis(axis):
        ar_key = "h-anchor-ref" if axis == "h" else "v-anchor-ref"
        axis_label = "horizontal" if axis == "h" else "vertical"
        axis_refs = [r for r in refs if r["declared"].get(ar_key)]
        if not axis_refs:
            return

        # Cross-deps only count when the target is itself anchored on THIS axis
        # — otherwise the target's coordinate on this axis is already settled
        # (either from pass A or because it isn't in the anchor-ref set).
        ar_id_set = {r["id"] for r in axis_refs if r.get("id")}
        keyfor = {id(r): (r.get("id") or f"@{id(r)}") for r in axis_refs}
        deps = {keyfor[id(r)]: set() for r in axis_refs}
        blocking = {keyfor[id(r)]: set() for r in axis_refs}
        for r in axis_refs:
            rk = keyfor[id(r)]
            tgt_id = r["declared"][ar_key]["target"]
            if tgt_id in ar_id_set:
                deps[rk].add(tgt_id)
                blocking[tgt_id].add(rk)

        ready = [r for r in axis_refs if not deps[keyfor[id(r)]]]
        order = []
        placed = set()
        while ready:
            r = ready.pop(0)
            rk = keyfor[id(r)]
            if rk in placed:
                continue
            placed.add(rk)
            order.append(r)
            for waiter_key in list(blocking.get(rk, ())):
                deps[waiter_key].discard(rk)
                if not deps[waiter_key] and waiter_key not in placed:
                    for cand in axis_refs:
                        if keyfor[id(cand)] == waiter_key and cand not in ready and cand not in order:
                            ready.append(cand)
                            break

        if len(order) != len(axis_refs):
            unresolved = [r.get("id") or "<unnamed>" for r in axis_refs if r not in order]
            raise ValueError(
                f"anchor-ref cycle detected on {axis_label} axis. Unresolved: {unresolved}. "
                f"Each element in the cycle references another (transitively) that "
                f"references it back on this axis."
            )

        for r in order:
            ar = r["declared"][ar_key]
            mw = r["arranged"]["w"]
            mh = r["arranged"]["h"]
            m = r.get("margin") or edges(None)

            target = id_index.get(ar["target"])
            if target is None:
                raise ValueError(
                    f"anchor-ref ({axis_label}): target '${ar['target']}' not found in layout tree"
                )
            if target.get("arranged") is None:
                raise ValueError(
                    f"anchor-ref ({axis_label}): target '${ar['target']}' has not been arranged "
                    f"(forward reference into a deferred subtree)"
                )

            tx, ty = compute_anchor(target, ar["target_anchor"])
            own_dx, own_dy = anchor_offset(mw, mh, ar["own_anchor"])
            own_name = ar["own_anchor"]
            # Explicit `distance` on the axis-anchor overrides both the
            # auto-margin gap AND the connector min-gap constraint — author
            # intent wins.
            distance = ar.get("distance")
            # Connector min-gap: if r and target are connected by a connector
            # carrying min-width / min-height, widen the placement when the
            # natural anchor offset puts them too close on this axis.
            con_min = 0
            if distance is None and connector_constraints and r.get("id"):
                con = connector_constraints.get(frozenset((r["id"], ar["target"])))
                if con:
                    con_min = con["min-w"] if axis == "h" else con["min-h"]
            if axis == "h":
                place_x = tx - own_dx
                directional = False
                if "east" in own_name:
                    place_x -= (distance if distance is not None else m["right"])
                    directional = True
                elif "west" in own_name:
                    place_x += (distance if distance is not None else m["left"])
                    directional = True
                # Connector min-gap only applies to directional placements; a
                # `center` anchor expresses centering intent and pushing it would
                # convert centering into an off-axis offset.
                if con_min and directional:
                    target_x = target["arranged"]["x"]
                    diff = place_x - target_x
                    if diff > 0 and diff < con_min:
                        place_x = target_x + con_min
                    elif diff < 0 and -diff < con_min:
                        place_x = target_x - con_min
                r["arranged"]["x"] = place_x
            else:
                place_y = ty - own_dy
                directional = False
                if "north" in own_name:
                    place_y += (distance if distance is not None else m["top"])
                    directional = True
                elif "south" in own_name:
                    place_y -= (distance if distance is not None else m["bottom"])
                    directional = True
                if con_min and directional:
                    target_y = target["arranged"]["y"]
                    diff = place_y - target_y
                    if diff > 0 and diff < con_min:
                        place_y = target_y + con_min
                    elif diff < 0 and -diff < con_min:
                        place_y = target_y - con_min
                r["arranged"]["y"] = place_y

    _resolve_axis("h")
    _resolve_axis("v")

    # Both axes are now settled on every ref. Materialise each ref's subtree
    # by re-arranging it at its computed top-left and measured size.
    for r in refs:
        a = r["arranged"]
        arrange(r, a["x"], a["y"], a["w"], a["h"])


# ─────────────────────────────────────────────────────────────────
# Connector-aware layout — Phase 1: detect conflicts only
# (See visual_engine/wiki/05-connector-aware-layout.md)
# ─────────────────────────────────────────────────────────────────

def _owned_cells(col, row, colspan=1, rowspan=1):
    """Set of (col, row) cells owned by a component placed at (col, row)
    with span (colspan x rowspan). 1-indexed."""
    cs = colspan or 1
    rs = rowspan or 1
    return {(col + i, row + j) for i in range(cs) for j in range(rs)}


def _orthogonal_path_cells(src_col, src_row, dst_col, dst_row, routing):
    """List of (col, row) cells the orthogonal connector path traverses,
    INCLUDING src and dst. Use src/dst as single-cell anchors (the central
    cells of the endpoints; multi-cell endpoints are handled by checking
    against owned-cell sets at conflict time)."""
    cells = []
    if routing == "orthogonal-hv":
        # Horizontal along src_row, src_col -> dst_col
        step = 1 if dst_col >= src_col else -1
        for c in range(src_col, dst_col + step, step):
            cells.append((c, src_row))
        # Vertical along dst_col, src_row -> dst_row (skip the corner — already added)
        step = 1 if dst_row >= src_row else -1
        for r in range(src_row + step, dst_row + step, step):
            cells.append((dst_col, r))
    elif routing == "orthogonal-vh":
        step = 1 if dst_row >= src_row else -1
        for r in range(src_row, dst_row + step, step):
            cells.append((src_col, r))
        step = 1 if dst_col >= src_col else -1
        for c in range(src_col + step, dst_col + step, step):
            cells.append((c, dst_row))
    return cells


def _build_ugrid_membership(tree):
    """Walk the layout tree. Return:
       - id_to_node: {id: layout-tree node}
       - id_to_ugrid: {component_id: ugrid_container_node}
       - ugrid_to_components: {id(ugrid): [(component_id, node), ...]}"""
    id_to_node = {}
    id_to_ugrid = {}
    ugrid_to_components = {}

    def walk(node, current_ugrid):
        if node.get("id"):
            id_to_node[node["id"]] = node
            if current_ugrid is not None and node["type"] in (
                "location", "building-block", "component", "actor"
            ):
                id_to_ugrid[node["id"]] = current_ugrid
                ugrid_to_components.setdefault(id(current_ugrid), []).append((node["id"], node))
        next_ugrid = current_ugrid
        # ugrid containers expose their layout through their items-presenter
        if node.get("layout") == "ugrid":
            next_ugrid = node
        for c in node.get("children", []):
            walk(c, next_ugrid)

    walk(tree, None)
    return id_to_node, id_to_ugrid, ugrid_to_components


def _find_or_insert_channel(ugrid_node, axis, position, connector):
    """Return the channel dict at (axis, position) on this ugrid node,
    inserting it if not already present. Mark `connector` as an owner."""
    channels = ugrid_node.setdefault("channels", [])
    for ch in channels:
        if ch["axis"] == axis and ch["position"] == position:
            ch.setdefault("owners", []).append(connector)
            return ch
    new = {"axis": axis, "position": position, "owners": [connector]}
    channels.append(new)
    return new


def _resolve_conflict(conflict, ugrid_node, components_in_ugrid):
    """Decide a channel position for a single conflict. Returns the channel
    dict if a valid position was found, None if not (caller surfaces error).
    The chosen position must NOT bisect any component (colspan/rowspan-aware).
    """
    cell = conflict["cell"]
    routing = conflict["routing"]
    src_node = None
    dst_node = None
    blocker_node = None
    for cid, node in components_in_ugrid:
        if cid == conflict["src_id"]:
            src_node = node
        elif cid == conflict["dst_id"]:
            dst_node = node
        elif cid == conflict["blocked_by"]:
            blocker_node = node

    # Determine if the conflict is on a horizontal or vertical segment.
    # For HV: horizontal at src.row, vertical at dst.col.
    # For VH: vertical at src.col, horizontal at dst.row.
    src_decl = src_node["declared"]
    dst_decl = dst_node["declared"]
    src_col, src_row = src_decl["cell"]
    dst_col, dst_row = dst_decl["cell"]

    if routing == "orthogonal-hv":
        on_horizontal = (cell[1] == src_row)
        on_vertical = (cell[0] == dst_col)
    else:  # orthogonal-vh
        on_vertical = (cell[0] == src_col)
        on_horizontal = (cell[1] == dst_row)

    # Channels for vertical-segment conflicts are columns; for horizontal,
    # they're rows. Position is a half-integer adjacent to the conflicting
    # column or row, biased toward the source side.
    candidates = []
    if on_vertical:
        col = cell[0]
        # Try left of the column first, then right
        candidates = [("col", col - 0.5), ("col", col + 0.5)]
    elif on_horizontal:
        row = cell[1]
        candidates = [("row", row - 0.5), ("row", row + 0.5)]
    else:
        # Conflict at the corner cell (HV elbow / VH elbow). Treat as
        # vertical-segment conflict for HV, horizontal for VH.
        if routing == "orthogonal-hv":
            candidates = [("col", cell[0] - 0.5), ("col", cell[0] + 0.5)]
        else:
            candidates = [("row", cell[1] - 0.5), ("row", cell[1] + 0.5)]

    # Validate each candidate against component owned-cell ranges.
    # A channel at half-integer position P sits BETWEEN two integer cells:
    # floor(P) and ceil(P). It bisects a component only when BOTH of those
    # cells are within the component's owned-cell range — i.e., the
    # component spans across the gap. Single-cell components (cs/rs=1) are
    # never bisected by an adjacent channel.
    def position_valid(axis, pos):
        import math
        floor_p = math.floor(pos)
        ceil_p = math.ceil(pos)
        if floor_p == ceil_p:
            return True  # integer position — not a real half-channel
        for cid, node in components_in_ugrid:
            decl = node["declared"]
            if not decl.get("cell"):
                continue
            ccol, crow = decl["cell"]
            cs = decl.get("colspan", 1) or 1
            rs = decl.get("rowspan", 1) or 1
            if axis == "col":
                if ccol <= floor_p and ceil_p <= ccol + cs - 1:
                    return False
            else:
                if crow <= floor_p and ceil_p <= crow + rs - 1:
                    return False
        return True

    for axis, pos in candidates:
        if position_valid(axis, pos):
            return _find_or_insert_channel(ugrid_node, axis, pos,
                                           conflict["connector"])
    return None


def detect_connector_conflicts(tree, markup):
    """Phase 1 conflict detection. For each orthogonal connector whose
    endpoints are in the same ugrid container, compute the path's
    declared-cell traversal and report cells that overlap a non-endpoint
    component (colspan/rowspan aware).

    Returns a list of dicts:
        {connector, src_id, dst_id, blocked_by, cell}"""
    id_to_node, id_to_ugrid, ugrid_to_components = _build_ugrid_membership(tree)
    conflicts = []

    # Build a set of connector dicts that have already been routed
    # through a channel — they no longer participate in conflict detection.
    resolved = set()
    def collect_resolved(node):
        for ch in (node.get("channels") or []):
            for owner in ch.get("owners", []):
                resolved.add(id(owner))
        for c in node.get("children", []):
            collect_resolved(c)
    collect_resolved(tree)

    for el in markup.get("elements", []):
        if "connector" not in el:
            continue
        conn = el["connector"]
        routing = conn.get("routing", "straight")
        if routing not in ("orthogonal-hv", "orthogonal-vh"):
            continue
        if conn.get("no-channel"):
            continue
        if id(conn) in resolved:
            continue

        src_id = (conn.get("from") or {}).get("target")
        dst_id = (conn.get("to") or {}).get("target")
        if not src_id or not dst_id:
            continue

        src_ugrid = id_to_ugrid.get(src_id)
        dst_ugrid = id_to_ugrid.get(dst_id)
        if src_ugrid is None or src_ugrid is not dst_ugrid:
            continue  # cross-container or non-ugrid -> skip

        src_node = id_to_node[src_id]
        dst_node = id_to_node[dst_id]
        src_cell = src_node["declared"].get("cell")
        dst_cell = dst_node["declared"].get("cell")
        if not src_cell or not dst_cell:
            continue

        src_owned = _owned_cells(src_cell[0], src_cell[1],
                                 src_node["declared"].get("colspan", 1),
                                 src_node["declared"].get("rowspan", 1))
        dst_owned = _owned_cells(dst_cell[0], dst_cell[1],
                                 dst_node["declared"].get("colspan", 1),
                                 dst_node["declared"].get("rowspan", 1))
        path = _orthogonal_path_cells(src_cell[0], src_cell[1],
                                      dst_cell[0], dst_cell[1], routing)
        intermediate = [c for c in path if c not in src_owned and c not in dst_owned]

        # Check against all other components in the same ugrid
        for other_id, other_node in ugrid_to_components.get(id(src_ugrid), []):
            if other_id == src_id or other_id == dst_id:
                continue
            other_cell = other_node["declared"].get("cell")
            if not other_cell:
                continue
            other_owned = _owned_cells(other_cell[0], other_cell[1],
                                       other_node["declared"].get("colspan", 1),
                                       other_node["declared"].get("rowspan", 1))
            for cell in intermediate:
                if cell in other_owned:
                    conflicts.append({
                        "connector": conn,
                        "src_id": src_id,
                        "dst_id": dst_id,
                        "blocked_by": other_id,
                        "cell": cell,
                        "routing": routing,
                    })
    return conflicts


MAX_LAYOUT_ITERATIONS = 10


def _normalize_canvas_overflow(tree):
    """Detect children of canvas containers whose arranged positions extend
    left/up of the container's origin, and accumulate that delta into the
    container's `_content_offset_x/y`. The next arrange pass shifts all
    flow children right/down by that offset so they fit inside the
    (also-grown) container bounds. Anchor-positioned siblings re-resolve
    against the shifted targets, so relative anchor relationships stay
    intact. Returns True when any container changed."""
    changed = False
    def walk(node):
        nonlocal changed
        for c in node["children"]:
            walk(c)
        if node.get("layout") not in ("canvas", "absolute", "root"):
            return
        if not node.get("arranged"):
            return
        ax = node["arranged"]["x"]
        ay = node["arranged"]["y"]
        kid_arranged = [c.get("arranged") for c in node["children"] if c.get("arranged")]
        if not kid_arranged:
            return
        min_x_abs = min(ca["x"] for ca in kid_arranged)
        min_y_abs = min(ca["y"] for ca in kid_arranged)
        delta_left = max(0, ax - min_x_abs)
        delta_top  = max(0, ay - min_y_abs)
        cur_off_x = node.get("_content_offset_x", 0)
        cur_off_y = node.get("_content_offset_y", 0)
        new_off_x = cur_off_x + delta_left if node["declared"].get("w") is None else cur_off_x
        new_off_y = cur_off_y + delta_top  if node["declared"].get("h") is None else cur_off_y
        if new_off_x != cur_off_x or new_off_y != cur_off_y:
            node["_content_offset_x"] = new_off_x
            node["_content_offset_y"] = new_off_y
            changed = True
    walk(tree)
    return changed


def run_layout(markup, vlib):
    """Run measure + arrange, then iterate to resolve connector-aware layout
    conflicts (channel insertion in ugrid containers)."""
    tree = _build_layout_tree(markup, vlib)
    connector_constraints = _build_connector_constraints(markup, vlib)
    measure(tree)
    arrange(tree, 0, 0, tree["measured"]["w"], tree["measured"]["h"])
    _arrange_anchor_refs(tree, connector_constraints)

    # Iterative shrink-wrap + overflow normalisation. Canvas measure uses
    # anchor-resolved arranged positions; normalise then absorbs leftward/
    # upward overflow into a container-level content offset. Iteration
    # converges when canvas sizes stop growing AND no new offset is added.
    # Anchor chains that reference the container itself diverge — bounded
    # by MAX_LAYOUT_ITERATIONS.
    prev_root = (tree["measured"]["w"], tree["measured"]["h"])
    for _ in range(MAX_LAYOUT_ITERATIONS):
        measure(tree)
        normalised = _normalize_canvas_overflow(tree)
        new_root = (tree["measured"]["w"], tree["measured"]["h"])
        if not normalised and new_root == prev_root:
            break
        arrange(tree, 0, 0, tree["measured"]["w"], tree["measured"]["h"])
        _arrange_anchor_refs(tree, connector_constraints)
        prev_root = new_root

    # Iterative connector-aware layout (Phase 2). Each pass: detect
    # conflicts, insert channels for any unresolved ones, re-arrange.
    for iteration in range(MAX_LAYOUT_ITERATIONS):
        conflicts = detect_connector_conflicts(tree, markup)
        if not conflicts:
            break

        # Build per-conflict resolution. Group by ugrid container so we
        # can find_or_insert into the right channel list.
        _, id_to_ugrid, ugrid_to_components = _build_ugrid_membership(tree)
        unresolved = []
        any_new = False
        for conflict in conflicts:
            ugrid_node = id_to_ugrid.get(conflict["src_id"])
            if ugrid_node is None:
                continue
            components = ugrid_to_components.get(id(ugrid_node), [])
            before_count = len(ugrid_node.get("channels") or [])
            ch = _resolve_conflict(conflict, ugrid_node, components)
            if ch is None:
                unresolved.append(conflict)
            else:
                after_count = len(ugrid_node.get("channels") or [])
                if after_count > before_count:
                    any_new = True

        if unresolved:
            details = "; ".join(
                f"{c['src_id']} -> {c['dst_id']} blocked by {c['blocked_by']} at {c['cell']}"
                for c in unresolved
            )
            raise ValueError(
                f"connector-aware layout: {len(unresolved)} unresolvable "
                f"conflict(s) — {details}. Use [no-channel] to opt out, or "
                f"restructure the layout."
            )

        if not any_new:
            # No new channels inserted but conflicts remain — sharing path
            # already covered them. Re-arrange and let next pass confirm
            # stability. Cap the loop by iteration count.
            pass

        # Re-arrange with the updated channels list
        measure(tree)
        arrange(tree, 0, 0, tree["measured"]["w"], tree["measured"]["h"])
        _arrange_anchor_refs(tree, connector_constraints)
    else:
        raise ValueError(
            f"connector-aware layout did not converge after "
            f"{MAX_LAYOUT_ITERATIONS} iterations"
        )
    # Record per-location items-presenter Y so compile_location can use it.
    for c in tree["children"]:
        if c["type"] == "location":
            ipos = find_items_presenter_y(c, (c["arranged"]["x"], c["arranged"]["y"]))
            if ipos is not None:
                _items_presenter_y_for[c["id"]] = ipos
    return tree


def measure_child_height(child):
    if "image" in child:
        m = edges(child["image"].get("margin"))
        return child["image"]["size"]["h"] + m["top"] + m["bottom"]
    if "text" in child:
        m = edges(child["text"].get("margin"))
        fs = child["text"].get("font-size", 10)
        return fs * 1.2 + m["top"] + m["bottom"]
    return 0


def grid_to_rect(grid, cell_size, default_w=100, default_h=100):
    if grid is None:
        return None
    if "rows" in grid and "cols" in grid:
        return {
            "x": grid["cols"][0] * cell_size,
            "y": grid["rows"][0] * cell_size,
            "width":  (grid["cols"][1] - grid["cols"][0]) * cell_size,
            "height": (grid["rows"][1] - grid["rows"][0]) * cell_size,
        }
    if "col" in grid and "row" in grid:
        cx = grid["col"] * cell_size - cell_size / 2
        cy = grid["row"] * cell_size - cell_size / 2
        return {"x": cx - default_w / 2, "y": cy - default_h / 2,
                "width":  default_w, "height": default_h}
    return None


def resolve_rect(spec, cell_size, default_w=100, default_h=100, default_x=0, default_y=0):
    """Resolve element rect from grid spec or direct x/y/width/height. Falls
    back to (default_x, default_y, default_w, default_h) if any axis missing."""
    grid = spec.get("grid")
    if grid:
        return grid_to_rect(grid, cell_size, default_w, default_h)
    return {"x": spec.get("x", default_x), "y": spec.get("y", default_y),
            "width":  spec.get("width",  default_w),
            "height": spec.get("height", default_h)}


def apply_style(style, instance):
    setters = {k: v for k, v in style.get("setters", {}).items() if k != "template"}
    for trig in style.get("triggers", []):
        when = trig.get("when", {})
        if all(instance.get(k) == v for k, v in when.items()):
            for k, v in trig.get("setters", {}).items():
                setters[k] = v
    merged = {**setters, **{k: v for k, v in instance.items() if v is not None and v != ""}}
    merged["__template__"] = style.get("setters", {}).get("template", [])
    return merged


def compile_stack(stack, container_x, container_y, container_w, container_h, ctx):
    out = []
    h_align = stack.get("h-align", "start")
    v_align = stack.get("v-align", "center")
    children = stack["children"]
    total = sum(measure_child_height(c) for c in children)
    if v_align == "center":
        cur_y = container_y + (container_h - total) / 2
    elif v_align == "end":
        cur_y = container_y + container_h - total
    else:
        cur_y = container_y
    for child in children:
        if "image" in child:
            img = child["image"]
            src_path = resolve(img["src"], ctx)
            m = edges(img.get("margin"))
            cur_y += m["top"]
            w, h = img["size"]["w"], img["size"]["h"]
            if h_align == "center":
                x = container_x + (container_w - w) / 2
            elif h_align == "end":
                x = container_x + container_w - w - m["right"]
            else:
                x = container_x + m["left"]
            href = icon_data_uri(src_path) if isinstance(src_path, Path) else (src_path or "")
            if href:
                out.append({"image": {
                    "x": round(x, 2), "y": round(cur_y, 2),
                    "width": w, "height": h, "href": href,
                    "preserve-aspect-ratio": "xMidYMid meet"}})
            cur_y += h + m["bottom"]
        elif "text" in child:
            txt = child["text"]
            content = resolve(txt["content"], ctx)
            m = edges(txt.get("margin"))
            cur_y += m["top"]
            fs = txt.get("font-size", 10)
            ff = txt.get("font-family", "sans-serif")
            fill = txt.get("fill", "#000")
            anchor = txt.get("anchor", "start")
            fw = txt.get("font-weight", "normal")
            fst = txt.get("font-style", "normal")
            max_w = txt.get("max-width")
            if max_w is not None and isinstance(content, str):
                content = _wrap_text(content, max_w, fs, fw, fst)
            tx = (container_x + container_w / 2) if anchor == "middle" else container_x
            baseline = cur_y + fs
            out.append({"text": {
                "x": round(tx, 2), "y": round(baseline, 2),
                "content": content, "font-size": fs, "font-family": ff,
                "text-anchor": anchor, "fill": fill}})
            line_count = len(content) if isinstance(content, list) else 1
            cur_y += fs * 1.2 * line_count + m["bottom"]
    return out


def compile_template_walk(template, base_x, base_y, ctx, registry):
    out = []
    for node in template:
        if "border" in node:
            b = node["border"]
            r = b.get("rect")
            if r is not None:
                x = base_x + (r["x"] if isinstance(r["x"], (int, float)) else 0)
                y = base_y + (r["y"] if isinstance(r["y"], (int, float)) else 0)
                w = resolve(r["width"], ctx); h = resolve(r["height"], ctx)
                rect = {
                    "x": x, "y": y, "width": w, "height": h,
                    "rx": resolve(b.get("rx"), ctx),
                    "fill": resolve(b.get("fill"), ctx) or "none",
                    "stroke": resolve(b.get("stroke"), ctx) or "#000",
                    "stroke-width": resolve(b.get("stroke-width"), ctx) or 1,
                }
                das = resolve(b.get("stroke-dasharray"), ctx)
                if das:
                    rect["stroke-dasharray"] = das
                out.append({"rect": rect})
            else:
                # Wrapper border — no visible rect, just nests children.
                x, y = base_x, base_y
            # Recurse into border's children (stack-panel, items-presenter, etc).
            if b.get("children"):
                out.extend(compile_template_walk(b["children"], x, y, ctx, registry))
        elif "stack" in node or "stack-panel" in node:
            stack = node.get("stack") or node.get("stack-panel")
            out.extend(compile_template_walk(stack.get("children", []),
                                             base_x, base_y, ctx, registry))
        elif "text" in node:
            t = node["text"]
            content = resolve(t["content"], ctx)
            if t.get("when") and not resolve(t["when"], ctx):
                continue
            if not content:
                continue
            at = t["at"]; x = base_x + at["x"]; y = base_y + at["y"]
            text = {
                "x": x, "y": y, "content": content,
                "font-size": t.get("font-size", 10),
                "font-family": t.get("font-family", "sans-serif"),
                "text-anchor": t.get("anchor", "start"),
                "fill": resolve(t.get("fill"), ctx) or "#000",
            }
            if t.get("font-weight") and t["font-weight"] != "normal":
                text["font-weight"] = t["font-weight"]
            if t.get("font-style") and t["font-style"] != "normal":
                text["font-style"] = t["font-style"]
            out.append({"text": text})
        elif "items-presenter" in node or "content-presenter" in node:
            pass
    return out


def compile_location(loc, vlib, registry, cell_size):
    rect = resolve_rect(loc, cell_size, default_w=200, default_h=200)
    margin = 5
    x = rect["x"] + margin; y = rect["y"] + margin
    w = rect["width"] - 2 * margin; h = rect["height"] - 2 * margin
    _ensure_id(loc, "location")
    registry[loc["id"]] = {"x": x, "y": y, "width": w, "height": h, "type": "location"}
    style = vlib["styles"]["location"]
    instance = {**loc, "width": w, "height": h}
    resolved = apply_style(style, instance)
    self_ctx = {**resolved, "width": w, "height": h, "title": loc.get("title"),
                "subtitle": loc.get("subtitle"), "fill-color": loc.get("fill-color"),
                "stroke-color": loc.get("stroke-color"), "kind": loc.get("kind"),
                "stroke-dasharray": resolved.get("stroke-dasharray", "")}
    ctx = {"self": self_ctx}
    template = resolved["__template__"]
    children = compile_template_walk(template, x, y, ctx, registry)
    # Recurse into nested children declared on the location.
    parent_x, parent_y = x, y
    for child in loc.get("children", []):
        if "component" in child:
            # Child coords default to parent origin if not specified.
            comp = dict(child["component"])
            if "x" not in comp: comp["x"] = parent_x
            else: comp["x"] = parent_x + comp["x"]
            if "y" not in comp: comp["y"] = parent_y + _items_presenter_y_for.get(loc.get("id"), (0, 0))[1]
            else: comp["y"] = parent_y + comp["y"]
            scene_node = compile_component(comp, vlib, _tlib_path_global, registry, cell_size)
            children.append(scene_node)
        elif "actor" in child:
            actor_inst = dict(child["actor"])
            if "x" not in actor_inst: actor_inst["x"] = parent_x
            else: actor_inst["x"] = parent_x + actor_inst["x"]
            if "y" not in actor_inst: actor_inst["y"] = parent_y
            else: actor_inst["y"] = parent_y + actor_inst["y"]
            children.append(compile_actor(actor_inst, vlib, registry, cell_size))
        elif "building-block" in child:
            blk = dict(child["building-block"])
            if "x" not in blk: blk["x"] = parent_x
            else: blk["x"] = parent_x + blk["x"]
            if "y" not in blk: blk["y"] = parent_y
            else: blk["y"] = parent_y + blk["y"]
            children.append(compile_building_block(blk, vlib, registry, cell_size))

    return {"canvas": {"id": loc["id"], "from-element": "location", "children": children}}


def compile_building_block(blk, vlib, registry, cell_size):
    rect = resolve_rect(blk, cell_size, default_w=200, default_h=200)
    margin = 5
    x = rect["x"] + margin; y = rect["y"] + margin
    w = rect["width"] - 2 * margin; h = rect["height"] - 2 * margin
    _ensure_id(blk, "block")
    registry[blk["id"]] = {"x": x, "y": y, "width": w, "height": h, "type": "building-block"}
    style = vlib["styles"]["building-block"]
    resolved = apply_style(style, {**blk, "width": w, "height": h})
    fill = blk.get("fill-color") or "none"
    stroke = blk.get("stroke-color") or "#000"
    children = []
    children.append({"rect": {
        "x": x, "y": y, "width": w, "height": h,
        "rx": resolved.get("corner-radius", 10),
        "fill": fill, "stroke": stroke,
        "stroke-width": resolved.get("stroke-width", 2)}})
    if blk.get("title"):
        children.append({"text": {
            "x": x + 14, "y": y + 22, "content": blk["title"],
            "font-size": 12, "font-family": "Segoe UI, Calibri, Arial, sans-serif",
            "text-anchor": "start", "fill": stroke, "font-weight": "bold"}})
    if blk.get("subtitle"):
        children.append({"text": {
            "x": x + 14, "y": y + 37, "content": blk["subtitle"],
            "font-size": 10, "font-family": "Segoe UI, Calibri, Arial, sans-serif",
            "text-anchor": "start", "fill": stroke, "font-style": "italic"}})
    header_h = resolved.get("header-height", 44)
    children.append({"line": {
        "x1": x, "y1": y + header_h, "x2": x + w, "y2": y + header_h,
        "stroke": stroke, "stroke-width": 0.5, "opacity": 0.4}})
    return {"canvas": {"id": blk["id"], "from-element": "building-block", "children": children}}


def compile_actor(actor, vlib, registry, cell_size):
    rect = resolve_rect(actor, cell_size,
                        default_w=actor.get("width", 100),
                        default_h=actor.get("height", 100))
    x, y, w, h = rect["x"], rect["y"], rect["width"], rect["height"]
    _ensure_id(actor, "actor")
    registry[actor["id"]] = {"x": x, "y": y, "width": w, "height": h, "type": "actor"}
    icon_path = actor.get("icon")
    actor_self = {**actor}
    if icon_path:
        actor_self["icon"] = ROOT / icon_path if not Path(icon_path).is_absolute() else Path(icon_path)
    actor_self["__rect__"] = {"x": x, "y": y, "width": w, "height": h}
    ctx = {"self": actor_self}
    style = vlib["styles"]["actor"]
    template = style["setters"]["template"]
    children = []
    for node in template:
        if "stack" in node:
            stack = node["stack"]
            r = stack.get("rect", {"x": 0, "y": 0, "width": w, "height": h})
            sx = x + (r.get("x") if isinstance(r.get("x"), (int, float)) else 0)
            sy = y + (r.get("y") if isinstance(r.get("y"), (int, float)) else 0)
            sw = resolve(r.get("width"), ctx) if r.get("width") else w
            sh = resolve(r.get("height"), ctx) if r.get("height") else h
            children.extend(compile_stack(stack, sx, sy, sw, sh, ctx))
    return {"canvas": {"id": actor["id"], "from-element": "actor", "children": children}}


def compile_component(comp, vlib, tlib_root, registry, cell_size):
    rect = resolve_rect(comp, cell_size,
                        default_w=comp.get("width", 100),
                        default_h=comp.get("height", 100))
    x, y, w, h = rect["x"], rect["y"], rect["width"], rect["height"]
    _ensure_id(comp, "component")
    registry[comp["id"]] = {"x": x, "y": y, "width": w, "height": h, "type": "component"}
    tech = load_technology(tlib_root, comp["implemented-by"])
    ctx = {"self": comp, "technology": tech}
    children = []
    template = vlib["styles"]["component"]["setters"]["template"]
    for node in template:
        if "content-presenter" in node:
            cat = comp["category"]
            dt = vlib["data-templates"].get(cat) or vlib["data-templates"].get("_default")
            if dt is None:
                continue
            for dt_node in dt["template"]:
                if "stack" in dt_node:
                    children.extend(compile_stack(dt_node["stack"], x, y, w, h, ctx))
    return {"canvas": {"id": comp["id"], "from-element": "component", "children": children}}


def _find_channel_for_connector(conn, tree):
    """If `conn` was routed through a channel during conflict resolution,
    return the channel dict. Otherwise None. We walk the layout tree
    looking for a ugrid whose channels list contains this connector
    object as an owner."""
    found = [None]
    def walk(node):
        if found[0]: return
        for ch in (node.get("channels") or []):
            if conn in (ch.get("owners") or []):
                found[0] = ch
                return
        for c in node.get("children", []):
            walk(c)
            if found[0]: return
    walk(tree)
    return found[0]


def build_flows_index(model_path):
    """Read a compiled architecture YAML and build a `(from, to) → [flows]`
    index from its scenario-step connectors. Each flow is a dict
    `{scenario, sequence, step}`. Returns None if the path is missing or
    the model has no scenario-step entries.

    This is the bridge between the model's authoritative scenario/sequence
    graph and the .view's hand-drawn connectors: one drawn line on the
    diagram may participate in N (scenario, sequence, step) tuples, and
    the index lets compile_connector attach all of them so the viewer can
    filter accurately."""
    if model_path is None:
        return None
    p = Path(model_path)
    if not p.exists():
        return None
    arch = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    index = {}
    for c in (arch.get("connectors") or []):
        if c.get("source") != "scenario-step":
            continue
        key = (c.get("from"), c.get("to"))
        flow = {"scenario": c.get("scenario"),
                "sequence": c.get("sequence"),
                "step":     c.get("step")}
        index.setdefault(key, []).append(flow)
    return index or None


def compile_connector(conn, registry, vlib=None, layout_tree=None, endpoint_overrides=None,
                      flows_index=None):
    """Resolve a connector to scene primitives. Inputs:
        conn: {from: {target, anchor?}, to: {target, anchor?},
               routing, arrow-end, ...optional style overrides}
        registry: {id: {x, y, width, height, type}}
        vlib: visual library (for connector style + relationship-type triggers)
        endpoint_overrides: optional {id(conn): {'src': pt, 'dst': pt}} —
            precomputed endpoints from `_distribute_endpoints` (multi-connector
            spread). When set, the override wins over the natural anchor /
            border-crossing computation.
    Returns a {group: {...}} scene node, or None if either endpoint is missing.
    """
    src_id = conn["from"]["target"]
    src_anchor = conn["from"].get("anchor")
    dst_id = conn["to"]["target"]
    dst_anchor = conn["to"].get("anchor")
    if src_id not in registry or dst_id not in registry:
        return None
    src_bbox = registry[src_id]
    dst_bbox = registry[dst_id]
    ovr = endpoint_overrides.get(id(conn)) if endpoint_overrides else None
    def _ep(bbox, anchor, toward_x, toward_y, kind):
        if ovr and kind in ovr:
            return ovr[kind]
        return _connector_endpoint(bbox, anchor, toward_x, toward_y)

    # Apply connector Style + triggers (relationship-type drives dasharray etc.)
    if vlib and "connector" in (vlib.get("styles") or {}):
        resolved = apply_style(vlib["styles"]["connector"], dict(conn))
    else:
        resolved = dict(conn)

    routing = resolved.get("routing", "straight")
    arrow_end = resolved.get("arrow-end", "none")
    color = resolved.get("stroke-color", "#888")
    width = resolved.get("stroke-width", 1.5)
    dasharray = resolved.get("stroke-dasharray", "")
    arrow_size = resolved.get("arrow-size", 8)

    # Resolve endpoints. Border-crossing aims toward the OTHER end's center
    # (not its border) so the line direction is well-defined.
    dst_cx = dst_bbox["x"] + dst_bbox["width"]  / 2
    dst_cy = dst_bbox["y"] + dst_bbox["height"] / 2
    src_cx = src_bbox["x"] + src_bbox["width"]  / 2
    src_cy = src_bbox["y"] + src_bbox["height"] / 2

    # `orthogonal-auto` picks HV or VH using a long-leg-first rule, with
    # geometry-aware overrides for axis overlap. The same overlap overrides
    # apply to *explicit* `-|` / `|-` routing afterwards: an author-requested
    # mode that would route the final leg through dst's interior gets flipped
    # to the only mode that doesn't (the alternative reads cleaner; an
    # in-range src can't satisfy both).
    src_in_dst_y = dst_bbox["y"] < src_cy < dst_bbox["y"] + dst_bbox["height"]
    src_in_dst_x = dst_bbox["x"] < src_cx < dst_bbox["x"] + dst_bbox["width"]
    if routing == "orthogonal-auto":
        if src_in_dst_y and not src_in_dst_x:
            routing = "orthogonal-vh"
        elif src_in_dst_x and not src_in_dst_y:
            routing = "orthogonal-hv"
        else:
            routing = "orthogonal-vh" if abs(dst_cy - src_cy) > abs(dst_cx - src_cx) else "orthogonal-hv"
    # Geometry-correctness override (also for explicit VH/HV from `-|` / `|-`):
    # VH lands on east/west — invalid if src is in dst's x-range. HV lands on
    # north/south — invalid if src is in dst's y-range.
    if routing == "orthogonal-vh" and src_in_dst_x and not src_in_dst_y:
        routing = "orthogonal-hv"
    elif routing == "orthogonal-hv" and src_in_dst_y and not src_in_dst_x:
        routing = "orthogonal-vh"

    # Channel-aware routing: if the conflict resolver assigned a channel
    # to this connector, the orthogonal path detours through it. HV→HVH
    # (two corners through the channel column); VH→VHV (channel row).
    channel = _find_channel_for_connector(conn, layout_tree) if layout_tree else None

    # Beam-projected corner: HV's final vertical leg lands at src's projected
    # column on dst's top/bottom edge (clamped to dst's x range with a small
    # margin); VH lands at src's projected row on dst's east/west edge. Means
    # multiple connectors arriving at the same target separate by source
    # direction — no more pile-up at dst.center.
    BEAM_MARGIN = 8
    def _beam_corner_x(src_cx, dst_bbox):
        # If src.cx is already inside dst's x-range, return it as-is — the
        # margin only applies when projecting an outside coordinate into the
        # range. Clamping inside-range values would introduce a tiny kink at
        # the source side when src.cx sits within `BEAM_MARGIN` of a corner.
        x0, x1 = dst_bbox["x"], dst_bbox["x"] + dst_bbox["width"]
        if x0 <= src_cx <= x1:
            return src_cx
        return max(x0 + BEAM_MARGIN, min(x1 - BEAM_MARGIN, src_cx))
    def _beam_corner_y(src_cy, dst_bbox):
        y0, y1 = dst_bbox["y"], dst_bbox["y"] + dst_bbox["height"]
        if y0 <= src_cy <= y1:
            return src_cy
        return max(y0 + BEAM_MARGIN, min(y1 - BEAM_MARGIN, src_cy))

    if routing == "orthogonal-hv":
        if channel and channel["axis"] == "col":
            chan_x = channel["pixel_center"]
            src_pt = _ep(src_bbox, src_anchor, chan_x, src_cy, "src")
            dst_pt = _ep(dst_bbox, dst_anchor, chan_x, dst_cy, "dst")
            path = [src_pt, (chan_x, src_pt[1]), (chan_x, dst_pt[1]), dst_pt]
        else:
            # Beam-projected corner; force dst_pt onto dst.north or dst.south
            # so the final vertical leg always lands perpendicular to a
            # horizontal edge.
            if dst_anchor:
                dst_pt = _ep(dst_bbox, dst_anchor, src_cx, src_cy, "dst")
                corner_x = dst_pt[0]
            else:
                corner_x = _beam_corner_x(src_cx, dst_bbox)
                dst_y = dst_bbox["y"] if src_cy < dst_cy else dst_bbox["y"] + dst_bbox["height"]
                dst_pt = (corner_x, dst_y)
                if ovr and "dst" in ovr:
                    dst_pt = ovr["dst"]
            # Compute src_pt. When the corner sits on src's vertical centre
            # line, the natural-aim ray would be either degenerate or diagonal
            # (introducing a tiny horizontal jog at the start). Exit src
            # cleanly through south/north at src.cx instead.
            if corner_x == src_cx and not src_anchor:
                src_pt = (src_cx, src_bbox["y"] + src_bbox["height"]) if dst_cy > src_cy \
                         else (src_cx, src_bbox["y"])
                if ovr and "src" in ovr:
                    src_pt = ovr["src"]
            else:
                src_pt = _ep(src_bbox, src_anchor, corner_x, src_cy, "src")
            corner = (dst_pt[0], src_pt[1])
            path = [src_pt, corner, dst_pt]
    elif routing == "orthogonal-vh":
        if channel and channel["axis"] == "row":
            chan_y = channel["pixel_center"]
            src_pt = _ep(src_bbox, src_anchor, src_cx, chan_y, "src")
            dst_pt = _ep(dst_bbox, dst_anchor, dst_cx, chan_y, "dst")
            path = [src_pt, (src_pt[0], chan_y), (dst_pt[0], chan_y), dst_pt]
        else:
            if dst_anchor:
                dst_pt = _ep(dst_bbox, dst_anchor, src_cx, src_cy, "dst")
                corner_y = dst_pt[1]
            else:
                corner_y = _beam_corner_y(src_cy, dst_bbox)
                dst_x = dst_bbox["x"] if src_cx < dst_cx else dst_bbox["x"] + dst_bbox["width"]
                dst_pt = (dst_x, corner_y)
                if ovr and "dst" in ovr:
                    dst_pt = ovr["dst"]
            if corner_y == src_cy and not src_anchor:
                src_pt = (src_bbox["x"] + src_bbox["width"], src_cy) if dst_cx > src_cx \
                         else (src_bbox["x"], src_cy)
                if ovr and "src" in ovr:
                    src_pt = ovr["src"]
            else:
                src_pt = _ep(src_bbox, src_anchor, src_cx, corner_y, "src")
            corner = (src_pt[0], dst_pt[1])
            path = [src_pt, corner, dst_pt]
    else:  # straight
        src_pt = _ep(src_bbox, src_anchor, dst_cx, dst_cy, "src")
        dst_pt = _ep(dst_bbox, dst_anchor, src_cx, src_cy, "dst")
        path = [src_pt, dst_pt]

    # Push each endpoint outward from its component bbox by the margin on
    # that side, so the connector tip leaves a margin-sized gap between the
    # line and the bbox edge (same convention as anchor placement: margin
    # increases distance from the anchored target). Corners are recomputed
    # to keep the path orthogonal.
    def _inset(pt, bbox):
        m = bbox.get("margin")
        if not m:
            return pt
        side = _side_of_bbox(bbox, pt)
        if side == "east":  return (pt[0] + m["right"],  pt[1])
        if side == "west":  return (pt[0] - m["left"],   pt[1])
        if side == "north": return (pt[0],               pt[1] - m["top"])
        if side == "south": return (pt[0],               pt[1] + m["bottom"])
        return pt
    path[0]  = _inset(path[0],  src_bbox)
    path[-1] = _inset(path[-1], dst_bbox)
    if routing == "orthogonal-hv" and len(path) == 3:
        # corner = (dst_pt.x, src_pt.y)
        path[1] = (path[2][0], path[0][1])
    elif routing == "orthogonal-vh" and len(path) == 3:
        # corner = (src_pt.x, dst_pt.y)
        path[1] = (path[0][0], path[2][1])
    elif len(path) == 4:
        # Channel-routed orthogonal: keep mid points fixed (channel centre);
        # only the leg between path[0]/path[1] and path[-2]/path[-1] absorbs
        # the inset.
        if routing == "orthogonal-hv":
            path[1] = (path[1][0], path[0][1])
            path[2] = (path[2][0], path[3][1])
        elif routing == "orthogonal-vh":
            path[1] = (path[0][0], path[1][1])
            path[2] = (path[3][0], path[2][1])

    # Shorten the line endpoints so the polyline terminates inside the
    # arrowhead's filled body, not at the tip. Without this, a thicker stroke
    # (e.g. when a connector is highlighted) shows past the arrowhead's
    # narrow tip because the stealth chevron has zero fill-area there.
    # Matches _arrow_polygon's notch geometry: arrow_length * (1 - notch_frac)
    # = arrow_size * 1.4 * 0.45 ≈ 0.63 * arrow_size.
    line_path = [tuple(p) for p in path]
    notch_offset = arrow_size * 0.63
    if arrow_end in ("target", "both") and len(line_path) >= 2:
        line_path[-1] = _shorten_endpoint(line_path[-2], line_path[-1], notch_offset)
    if arrow_end in ("source", "both") and len(line_path) >= 2:
        line_path[0]  = _shorten_endpoint(line_path[1], line_path[0], notch_offset)

    out = []
    if len(line_path) == 2:
        line = {"line": {
            "x1": line_path[0][0], "y1": line_path[0][1],
            "x2": line_path[1][0], "y2": line_path[1][1],
            "stroke": color, "stroke-width": width,
        }}
        if dasharray:
            line["line"]["stroke-dasharray"] = dasharray
        out.append(line)
    else:
        pl = {"polyline": {
            "points": [list(p) for p in line_path],
            "stroke": color, "stroke-width": width,
        }}
        if dasharray:
            pl["polyline"]["stroke-dasharray"] = dasharray
        out.append(pl)

    # Arrow polygons are computed against the original (un-shortened) path so
    # their tip still lands at the target's connection point.
    if arrow_end in ("target", "both"):
        a = _arrow_polygon(path[-2], path[-1], arrow_size, color)
        if a:
            out.append(a)
    if arrow_end in ("source", "both"):
        a = _arrow_polygon(path[1], path[0], arrow_size, color)
        if a:
            out.append(a)

    group = {"id": f"connector-{src_id}-{dst_id}", "children": out,
             "source": src_id, "target": dst_id}
    # Multi-membership: when a model index is available and this drawn line
    # matches one or more scenario-step entries, attach the full list of
    # (scenario, sequence, step) tuples. The renderer surfaces it as
    # `data-flows` so the viewer can filter on any membership rather than
    # the single one the .view-author happened to annotate.
    flows = flows_index.get((src_id, dst_id)) if flows_index else None
    if flows:
        group["flows"] = flows
    else:
        # No model lookup (or no match) — fall back to the legacy
        # single-membership form authored on the .view connector.
        for key in ("scenario", "sequence", "step"):
            if key in conn:
                group[key] = conn[key]
    return {"group": group}




def default_output_path(markup_path: Path) -> Path:
    name = markup_path.name
    if name.endswith(".markup.yaml"):
        return markup_path.with_name(name[: -len(".markup.yaml")] + "_compiled.yaml")
    return markup_path.with_name(markup_path.stem + "_compiled" + markup_path.suffix)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("markup_file")
    parser.add_argument("-o", "--output")
    parser.add_argument("--model",
                        help="Path to a compiled architecture YAML. When supplied, drawn "
                             "connectors are tagged with every (scenario, sequence, step) "
                             "they participate in (model is the source of truth).")
    args = parser.parse_args()
    markup_path = Path(args.markup_file).resolve()
    output_path = Path(args.output).resolve() if args.output else default_output_path(markup_path)
    markup = load_yaml(markup_path)
    imports = markup.get("imports", {})
    vlib_path = ROOT / imports["visual-library"]
    tlib_path = ROOT / imports["technology-library"]
    global _tlib_path_global
    _tlib_path_global = tlib_path
    vlib = load_visual_library(vlib_path)
    flows_index = build_flows_index(args.model) if args.model else None
    # Two-pass layout: measure + arrange (stage 2 is now active)
    layout_tree = run_layout(markup, vlib)
    canvas = markup["canvas"]
    cell_size = canvas.get("grid", {}).get("cell", 120)
    registry = {}
    # Emit scene from the arranged layout tree (replaces legacy single-pass compile)
    scene = emit_from_tree(layout_tree, vlib, tlib_path, registry)
    # Connectors still go through the legacy path (they reference arranged bounds via the registry)
    endpoint_overrides = _distribute_endpoints(markup, registry, vlib)
    for el in markup.get("elements", []):
        if "connector" in el:
            c = compile_connector(el["connector"], registry, vlib, layout_tree, endpoint_overrides,
                                  flows_index=flows_index)
            if c:
                scene.append(c)
    # ── Pass 2 (root level) — shrink-wrap canvas around all elements ─
    # The spec's two-pass algorithm computes non-leaf bounds from the
    # bbox of children plus padding. At the root, that gives the canvas
    # size. Author-declared canvas width/height (if present) wins;
    # otherwise we derive it from the registry.
    canvas_pad = edges((markup.get("canvas") or {}).get("padding"))
    if registry:
        min_x = min(r["x"] for r in registry.values())
        min_y = min(r["y"] for r in registry.values())
        max_x = max(r["x"] + r["width"]  for r in registry.values())
        max_y = max(r["y"] + r["height"] for r in registry.values())
        # Content already starts at canvas_pad.left/top because the root layout
        # node has matching padding; add right/bottom to complete the gutter.
        derived_w = max_x + canvas_pad["right"]
        derived_h = max_y + canvas_pad["bottom"]
    else:
        derived_w = canvas_pad["left"] + canvas_pad["right"]
        derived_h = canvas_pad["top"] + canvas_pad["bottom"]
    canvas = dict(canvas)   # don't mutate markup's canvas
    if "width"  not in canvas or canvas["width"]  in (None, 0):
        canvas["width"]  = derived_w
    if "height" not in canvas or canvas["height"] in (None, 0):
        canvas["height"] = derived_h

    compiled = {"canvas": canvas, "scene": scene}
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # Explicit UTF-8 — without it, Python's default text mode on Windows uses
    # the system code page (cp1252) and the em-dash in the header comment
    # becomes 0x97, which then fails when downstream tools read as UTF-8.
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("# Compiled scene graph — generated by markup_compiler.py\n\n")
        yaml.safe_dump(compiled, f, sort_keys=False, allow_unicode=True, width=160)
    print(f"Compiled: {output_path}")

    # Layout summary (measure + arrange) for inspection
    measure_path = output_path.with_name(output_path.stem.replace("_compiled", "_layout") + ".txt")
    measure_path.write_text(measure_summary(layout_tree) + "\n")
    print(f"Layout summary: {measure_path}")


if __name__ == "__main__":
    main()
