#!/usr/bin/env python3
"""
BPMN Visual Compiler — bpmn_engine/visual_compiler/visual_compiler.py

Takes a compiled BPMN process (output of bpmn_compiler.py) and emits a
scene graph YAML that the existing visual_engine/renderer/render.py
consumes to produce SVG. Layout is automatic — no hand-authored
.bpmn-view DSL required.

Layout strategy:
  - Pools stack vertically. Each pool spans the full canvas width.
  - Lanes stack vertically inside their pool. Each lane has a left-edge
    title strip + a content area for its flow nodes.
  - Flow nodes are placed left-to-right inside their lane by topological
    rank (longest-path distance from any start event). Multiple nodes at
    the same rank inside the same lane stack vertically.
  - Sequence flows are routed orthogonally: out the right edge of source,
    horizontal to a midpoint x, vertical to target's y, then horizontal
    into the left edge of target.
  - Message flows go directly between source and target centres (they
    cross pool boundaries; orthogonal routing inside a pool would imply
    pool-relative offsets that don't generalise).

Styling matches the BPMN visual library at visual_libraries/BPMN/ —
template constants in this file are kept in sync with that library's
defaults (task width, event radius, gateway diamond size, stroke
weights per event-type, etc.). When the markup compiler grows BPMN
support, this hard-coded path goes away in favour of template
expansion.

Usage:
    python bpmn_engine/visual_compiler/visual_compiler.py <compiled.yaml> --output <scene.yaml>
"""
from __future__ import annotations
import argparse
import math
import sys
from collections import defaultdict, deque
from pathlib import Path

import yaml

# Borrow the architecture pipeline's text helpers so BPMN labels wrap with
# the same metrics (PIL font when available, geometric fallback otherwise).
# Done as a sys.path insert rather than packaging because both engines are
# top-level scripts in this repo, not installable packages — keeping the
# layout flat avoids forcing a package skeleton just for two helpers.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_PROJECT_ROOT / "visual_engine" / "markup" / "markup_compiler"))
from markup_compiler import _wrap_text, measure_text  # noqa: E402


# ── Layout constants ───────────────────────────────────────────────
# Mirrored from visual_libraries/BPMN/. Bumped here when a template's
# default size changes there.
TASK_W            = 110
TASK_H            = 70
EVENT_DIAM        = 36
GATEWAY_W         = 50
GATEWAY_H         = 50

POOL_TITLE_W      = 30      # left strip on each pool
LANE_TITLE_W      = 24      # left strip on each lane (sits to the right of POOL_TITLE_W)
LANE_PAD_X        = 20      # left/right pad inside the lane content area
LANE_PAD_Y        = 20      # top/bottom pad inside lane content area
NODE_HSPACING     = 60      # horizontal gap between adjacent ranks
NODE_VSPACING     = 30      # vertical gap between nodes at the same rank
DIAGRAM_PAD       = 24      # canvas-edge gutter
TASK_TEXT_PAD_X   = 8       # horizontal pad inside task box for text wrap

# Visual palette — also from the visual library.
COLOR_BG          = "#FAFAF9"
COLOR_POOL_FILL   = "#FFFFFF"
COLOR_POOL_STROKE = "#22211E"
COLOR_TITLE_BG    = "#F4F4F4"
COLOR_LANE_STROKE = "#8A8780"
COLOR_LANE_TITLE_BG = "#FAFAF9"
COLOR_TASK_FILL   = "#FFFFFF"
COLOR_TASK_STROKE = "#22211E"
COLOR_EVENT_FILL  = "#FFFFFF"
COLOR_EVENT_STROKE = "#22211E"
COLOR_GATEWAY_FILL = "#FFFFFF"
COLOR_GATEWAY_STROKE = "#22211E"
COLOR_SEQUENCE    = "#22211E"
COLOR_MESSAGE     = "#5F5C56"
COLOR_TEXT        = "#22211E"
COLOR_LANE_TITLE_TEXT = "#5F5C56"

# Stroke weights per event-type — encodes the BPMN convention that
# start = thin, intermediate = medium, end = thick.
EVENT_STROKE_BY_TYPE = {"start": 1, "intermediate": 2, "end": 3}

FONT       = "Segoe UI, Calibri, Arial, sans-serif"
FS_TITLE   = 11      # pool/lane label
FS_NODE    = 11      # task label
FS_EVENT   = 10      # event/gateway label (drawn outside the shape)


# ── Layout algorithm ───────────────────────────────────────────────

def topological_ranks(model: dict) -> dict[str, int]:
    """Longest-path rank from any start event. Used as the x-coordinate
    bucket for flow nodes — rank 0 sits leftmost, increasing rank
    further right. Sequence flows only (message flows don't impose
    intra-pool ordering)."""
    nodes = model.get("flow-nodes") or {}
    incoming, outgoing = defaultdict(list), defaultdict(list)
    for fl in (model.get("flows") or []):
        if fl.get("type", "sequence") != "sequence":
            continue
        outgoing[fl["from"]].append(fl["to"])
        incoming[fl["to"]].append(fl["from"])

    # Seed with every node that has no incoming sequence flow. A typical
    # process has just one start event but the compiler accepts several
    # (per-flow start), so this seed set may be larger.
    ranks = {nid: 0 for nid in nodes if not incoming.get(nid)}

    # Relax via BFS — keep updating successors as long as a longer path
    # to them is found. Bounded by node count squared for any reasonable
    # process; cycles aren't expected (BPMN doesn't model them at this
    # level).
    queue = deque(ranks.keys())
    while queue:
        cur = queue.popleft()
        for nxt in outgoing.get(cur, []):
            new_rank = ranks[cur] + 1
            if nxt not in ranks or ranks[nxt] < new_rank:
                ranks[nxt] = new_rank
                queue.append(nxt)

    # Anything that wasn't seeded by a start AND wasn't reached by a
    # forward walk lands at rank 0 — a disconnected node, a model bug,
    # or a node only reachable via message flows. Render it leftmost
    # rather than crashing.
    for nid in nodes:
        ranks.setdefault(nid, 0)
    return ranks


def node_size(node: dict) -> tuple[int, int]:
    """Pixel (w, h) per node kind. Sizes match the visual library."""
    kind = node.get("kind")
    if kind == "task":    return TASK_W, TASK_H
    if kind == "event":   return EVENT_DIAM, EVENT_DIAM
    if kind == "gateway": return GATEWAY_W, GATEWAY_H
    return TASK_W, TASK_H


def edge_point(node: dict, target_x: float, target_y: float) -> tuple[float, float]:
    """Return the point on this node's boundary along the line from its
    centre to (target_x, target_y). Shape depends on the node's kind:

      - task          → rounded rectangle, treated as plain rectangle for
                        the intersection (the corner radius is small enough
                        not to matter visually).
      - event         → circle (radius = w/2; events are square so w == h).
      - gateway       → diamond, intersected analytically via the
                        |x/half_w| + |y/half_h| = 1 equation.

    Used for message-flow endpoints so the dashed line starts at the
    source's edge and ends at the target's edge rather than burying both
    ends under the shape."""
    cx = node["x"] + node["w"] / 2
    cy = node["y"] + node["h"] / 2
    dx = target_x - cx
    dy = target_y - cy
    length = math.sqrt(dx * dx + dy * dy)
    if length == 0:
        return (cx, cy)
    nx, ny = dx / length, dy / length    # unit direction toward target
    half_w = node["w"] / 2
    half_h = node["h"] / 2
    kind = node.get("kind")

    if kind == "event":
        # Circle — distance to boundary along the unit ray is just the radius.
        return (cx + nx * half_w, cy + ny * half_h)

    if kind == "gateway":
        # Diamond satisfies |x/half_w| + |y/half_h| = 1 in centre-relative
        # coordinates. Solve for t along the ray (nx, ny).
        denom = abs(nx) / half_w + abs(ny) / half_h
        if denom == 0:
            return (cx, cy)
        t = 1 / denom
        return (cx + nx * t, cy + ny * t)

    # Default: rectangle. Find which edge the ray exits — the smaller of
    # the two parametric distances to a vertical vs horizontal edge wins.
    tx = half_w / abs(nx) if abs(nx) > 1e-9 else float("inf")
    ty = half_h / abs(ny) if abs(ny) > 1e-9 else float("inf")
    t  = min(tx, ty)
    return (cx + nx * t, cy + ny * t)


def _segment_crosses_box(p1, p2, box) -> bool:
    """True iff axis-aligned segment p1→p2 enters the open interior of `box`.
    Touching an edge doesn't count — a connector is allowed to start/end
    flush against another shape's boundary, only piercing the interior is
    a routing failure. Liang–Barsky against an inset rectangle does both."""
    eps = 0.5
    bx1 = box["x"] + eps
    by1 = box["y"] + eps
    bx2 = box["x"] + box["w"] - eps
    by2 = box["y"] + box["h"] - eps
    if bx2 <= bx1 or by2 <= by1:
        return False
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    p_arr = (-dx, dx, -dy, dy)
    q_arr = (p1[0] - bx1, bx2 - p1[0], p1[1] - by1, by2 - p1[1])
    u1, u2 = 0.0, 1.0
    for pi, qi in zip(p_arr, q_arr):
        if abs(pi) < 1e-9:
            if qi < 0:
                return False
        else:
            t = qi / pi
            if pi < 0:
                u1 = max(u1, t)
            else:
                u2 = min(u2, t)
    return u1 < u2 - 1e-9


def _path_crosses_any(points, obstacles) -> bool:
    for i in range(len(points) - 1):
        for obs in obstacles:
            if _segment_crosses_box(points[i], points[i + 1], obs):
                return True
    return False


def _route_orthogonal_avoiding(sx, sy, tx, ty, src_rank, dst_rank,
                               obstacles, slot_x_fn) -> list[list[float]]:
    """Out-the-right → vertical bend → in-the-left routing that steps
    around intermediate nodes. The default mid-x bend lands in whatever
    column happens to be halfway between source and destination — when
    that column is occupied (a node at an intermediate rank in the same
    visual row), the connector pierces it. Fix: if the mid-x bend
    crosses any node, walk the rank-gap centres between source and
    destination instead. Destination-side gaps come first because the
    long horizontal then runs at the source's y, which in stacked
    layouts is the row that's least likely to host an obstacle (centre
    rows tend to be busier than upper/lower rows)."""
    default_mid = (sx + tx) / 2
    points = [[sx, sy], [default_mid, sy], [default_mid, ty], [tx, ty]]
    if not _path_crosses_any(points, obstacles):
        return points
    if src_rank is None or dst_rank is None:
        return points
    lo, hi = sorted([src_rank, dst_rank])
    for r in reversed(range(lo, hi)):
        gap_x = slot_x_fn(r) + TASK_W + NODE_HSPACING / 2
        candidate = [[sx, sy], [gap_x, sy], [gap_x, ty], [tx, ty]]
        if not _path_crosses_any(candidate, obstacles):
            return candidate
    return points


def compute_layout(model: dict) -> dict:
    """Produce a positions dict consumed by the emit pass. Keys:
       - canvas: { w, h }
       - pools:  pool_id -> { x, y, w, h, label }
       - lanes:  (pool_id, lane_id) -> { x, y, w, h, label, content_x }
       - nodes:  node_id -> { x, y, w, h, kind, ...original node fields }
       - flows:  list of { points, type, label, ...original flow fields }
    """
    nodes = model.get("flow-nodes") or {}
    pools = model.get("pools") or {}
    ranks = topological_ranks(model)

    # Group nodes by (pool, lane) and then by rank inside that lane.
    by_lane_rank: dict[tuple[str, str], dict[int, list[str]]] = defaultdict(lambda: defaultdict(list))
    for nid, n in nodes.items():
        pool, lane = n.get("pool"), n.get("lane")
        if pool is None or lane is None:
            continue   # orphan — won't render
        by_lane_rank[(pool, lane)][ranks[nid]].append(nid)

    # Lane height = max stack depth at any rank * (TASK_H + spacing) + pad.
    # Empty lanes still get a minimum height so they're visible.
    lane_h: dict[tuple[str, str], int] = {}
    for (pool_id, pool_data) in pools.items():
        for lane_id in (pool_data.get("lanes") or {}):
            stacks = by_lane_rank.get((pool_id, lane_id), {})
            max_stack = max((len(ns) for ns in stacks.values()), default=1)
            lane_h[(pool_id, lane_id)] = (LANE_PAD_Y * 2
                + max_stack * TASK_H
                + max(0, max_stack - 1) * NODE_VSPACING)

    # Canvas content width = title strips + content padding + (max_rank + 1)
    # task-slot widths + (max_rank) horizontal gaps. Task-slot width is
    # the larger of TASK_W or any node kind that might sit in that slot.
    max_rank = max(ranks.values(), default=0)
    content_w = (POOL_TITLE_W + LANE_TITLE_W + LANE_PAD_X * 2
                 + (max_rank + 1) * TASK_W
                 + max_rank * NODE_HSPACING)

    # Pool / lane positions. Pools stack vertically with a small gap.
    POOL_GAP = 12
    pool_layout, lane_layout = {}, {}
    cur_y = DIAGRAM_PAD
    for pool_id, pool_data in pools.items():
        lanes = list((pool_data.get("lanes") or {}).keys())
        pool_h_total = sum(lane_h.get((pool_id, lid), 100) for lid in lanes) or 100
        pool_layout[pool_id] = {
            "x": DIAGRAM_PAD,
            "y": cur_y,
            "w": content_w,
            "h": pool_h_total,
            "label": (pool_data.get("label") or pool_id),
        }
        # Lanes inside the pool stack from the top down.
        cur_lane_y = cur_y
        for lane_id in lanes:
            h = lane_h.get((pool_id, lane_id), 100)
            ldef = (pool_data.get("lanes") or {}).get(lane_id) or {}
            lane_layout[(pool_id, lane_id)] = {
                "x": DIAGRAM_PAD,
                "y": cur_lane_y,
                "w": content_w,
                "h": h,
                "label": (ldef.get("label") or lane_id),
                # x coord at which the lane's flow-node grid starts.
                "content_x": DIAGRAM_PAD + POOL_TITLE_W + LANE_TITLE_W + LANE_PAD_X,
                "content_y": cur_lane_y + LANE_PAD_Y,
            }
            cur_lane_y += h
        cur_y += pool_h_total + POOL_GAP

    # Node positions — left-to-right by rank, vertically distributed
    # within the lane content area when multiple nodes share a rank.
    node_layout: dict[str, dict] = {}
    for (pool_id, lane_id), by_rank in by_lane_rank.items():
        lane = lane_layout.get((pool_id, lane_id))
        if lane is None:
            continue
        content_x = lane["content_x"]
        for rank, nids in by_rank.items():
            slot_x = content_x + rank * (TASK_W + NODE_HSPACING)
            n = len(nids)
            content_h = lane["h"] - LANE_PAD_Y * 2
            for i, nid in enumerate(nids):
                node = nodes[nid]
                w, h = node_size(node)
                # Centre the node in the slot horizontally (handles
                # narrower events/gateways in a TASK_W-wide slot).
                x = slot_x + (TASK_W - w) / 2
                # Vertical centering: split the lane content area into
                # n equal bands; the node sits in the middle of its band.
                band_h = content_h / n if n else content_h
                y_centre = lane["content_y"] + band_h * (i + 0.5)
                y = y_centre - h / 2
                # Stash rank so the flow router can compute rank-gap x's
                # without re-deriving them from x positions.
                node_layout[nid] = {**node, "x": x, "y": y, "w": w, "h": h,
                                    "rank": rank}

    # Flow paths.
    # Constants used by the orthogonal router to compute rank-gap x's.
    content_x_global = DIAGRAM_PAD + POOL_TITLE_W + LANE_TITLE_W + LANE_PAD_X
    def slot_x_fn(rank: int) -> float:
        return content_x_global + rank * (TASK_W + NODE_HSPACING)

    all_nodes = list(node_layout.values())

    flow_layout = []
    for fl in (model.get("flows") or []):
        src = node_layout.get(fl.get("from"))
        dst = node_layout.get(fl.get("to"))
        if not src or not dst:
            # Endpoint missing — skip silently. The model compiler would
            # have already raised an error for this; we don't double-flag.
            continue
        ftype = fl.get("type", "sequence")
        if ftype == "message":
            # Edge-to-edge along the source-centre → target-centre line.
            # Each endpoint is computed against the line aimed at the OTHER
            # node's centre, then trimmed to the shape boundary so the
            # dashed line starts and ends visibly outside both shapes.
            src_cx = src["x"] + src["w"] / 2
            src_cy = src["y"] + src["h"] / 2
            dst_cx = dst["x"] + dst["w"] / 2
            dst_cy = dst["y"] + dst["h"] / 2
            sx, sy = edge_point(src, dst_cx, dst_cy)
            tx, ty = edge_point(dst, src_cx, src_cy)
            points = [[sx, sy], [tx, ty]]
        else:
            # Orthogonal: out the right of source, vertical bend, in to
            # the left of target. The bend column is mid-x by default, but
            # if that pierces a node sitting between the two ranks the
            # router walks rank-gap centres until it finds a clean column.
            sx = src["x"] + src["w"]
            sy = src["y"] + src["h"] / 2
            tx = dst["x"]
            ty = dst["y"] + dst["h"] / 2
            obstacles = [n for n in all_nodes
                         if n.get("id") not in (src.get("id"), dst.get("id"))]
            points = _route_orthogonal_avoiding(
                sx, sy, tx, ty, src.get("rank"), dst.get("rank"),
                obstacles, slot_x_fn)
        flow_layout.append({**fl, "points": points})

    canvas_w = content_w + DIAGRAM_PAD * 2
    canvas_h = cur_y + DIAGRAM_PAD - POOL_GAP   # last POOL_GAP isn't needed at the bottom

    return {
        "canvas": {"w": canvas_w, "h": canvas_h},
        "pools": pool_layout,
        "lanes": lane_layout,
        "nodes": node_layout,
        "flows": flow_layout,
    }


# ── Scene-graph emit ───────────────────────────────────────────────
# The output shape mirrors what visual_engine/markup/markup_compiler
# produces — root `canvas` block + a `scene` list of groups and
# primitives. The existing renderer at visual_engine/renderer/render.py
# consumes this without changes.

def emit_pool(pool_id: str, pool: dict) -> dict:
    children = [
        # Pool border.
        {"rect": {"x": pool["x"], "y": pool["y"], "width": pool["w"], "height": pool["h"],
                  "fill": COLOR_POOL_FILL, "stroke": COLOR_POOL_STROKE, "stroke-width": 1}},
        # Title strip (left edge).
        {"rect": {"x": pool["x"], "y": pool["y"], "width": POOL_TITLE_W, "height": pool["h"],
                  "fill": COLOR_TITLE_BG, "stroke": "none"}},
        # Vertical title strip line — separates strip from content.
        {"line": {"x1": pool["x"] + POOL_TITLE_W, "y1": pool["y"],
                  "x2": pool["x"] + POOL_TITLE_W, "y2": pool["y"] + pool["h"],
                  "stroke": COLOR_POOL_STROKE, "stroke-width": 1}},
        # Pool label — rotated -90° so it reads bottom-to-top inside
        # the vertical title strip (BPMN convention). Anchor is the
        # geometric centre of the strip; rotation pivots around that
        # same point.
        {"text": {"x": pool["x"] + POOL_TITLE_W / 2,
                  "y": pool["y"] + pool["h"] / 2,
                  "content": pool["label"],
                  "font-family": FONT, "font-size": FS_TITLE, "font-weight": "bold",
                  "text-anchor": "middle", "dominant-baseline": "central",
                  "fill": COLOR_POOL_STROKE,
                  "rotation": -90}},
    ]
    return {"group": {"id": f"pool-{pool_id}", "from-element": "pool", "children": children}}


def emit_lane(pool_id: str, lane_id: str, lane: dict) -> dict:
    title_x = lane["x"] + POOL_TITLE_W
    children = [
        # Lane title strip (sits to the right of pool's title strip).
        {"rect": {"x": title_x, "y": lane["y"], "width": LANE_TITLE_W, "height": lane["h"],
                  "fill": COLOR_LANE_TITLE_BG, "stroke": "none"}},
        # Lane title strip separator.
        {"line": {"x1": title_x + LANE_TITLE_W, "y1": lane["y"],
                  "x2": title_x + LANE_TITLE_W, "y2": lane["y"] + lane["h"],
                  "stroke": COLOR_LANE_STROKE, "stroke-width": 1}},
        # Bottom border of the lane (separator to next lane in pool).
        {"line": {"x1": lane["x"] + POOL_TITLE_W, "y1": lane["y"] + lane["h"],
                  "x2": lane["x"] + lane["w"],    "y2": lane["y"] + lane["h"],
                  "stroke": COLOR_LANE_STROKE, "stroke-width": 1}},
        # Lane label — rotated like the pool label (bottom-to-top
        # inside the vertical lane-title strip).
        {"text": {"x": title_x + LANE_TITLE_W / 2,
                  "y": lane["y"] + lane["h"] / 2,
                  "content": lane["label"],
                  "font-family": FONT, "font-size": FS_TITLE - 1,
                  "text-anchor": "middle", "dominant-baseline": "central",
                  "fill": COLOR_LANE_TITLE_TEXT,
                  "rotation": -90}},
    ]
    return {"group": {"id": f"lane-{pool_id}-{lane_id}", "from-element": "lane",
                      "children": children}}


def emit_task(node: dict) -> dict:
    x, y, w, h = node["x"], node["y"], node["w"], node["h"]
    label = node.get("label") or node.get("id", "")
    # Wrap the label to the box width minus a horizontal pad on each side
    # so glyphs don't kiss the rounded corners. `_wrap_text` returns the
    # original string when it fits and a list of lines otherwise — the
    # renderer's text branch handles both.
    max_text_w = w - TASK_TEXT_PAD_X * 2
    wrapped = _wrap_text(label, max_text_w, font_size=FS_NODE)
    # Vertical centering for multi-line text. With dominant-baseline=
    # central and tspans dy=1.2em (renderer convention), the block of N
    # lines anchors its FIRST line at y and grows downward — visually
    # off-centre in a fixed-height box. Shift y up by half the extra
    # block height so the wrapped block balances around the box centre.
    cy = y + h / 2
    if isinstance(wrapped, list) and len(wrapped) > 1:
        line_h = FS_NODE * 1.2
        cy -= (len(wrapped) - 1) * line_h / 2
    children = [
        {"rect": {"x": x, "y": y, "width": w, "height": h,
                  "rx": 10,
                  "fill": COLOR_TASK_FILL, "stroke": COLOR_TASK_STROKE, "stroke-width": 1}},
        {"text": {"x": x + w / 2, "y": cy,
                  "content": wrapped,
                  "font-family": FONT, "font-size": FS_NODE,
                  "text-anchor": "middle", "dominant-baseline": "central",
                  "fill": COLOR_TEXT}},
    ]
    return {"group": {"id": node["id"], "from-element": "task", "children": children}}


def emit_event(node: dict) -> dict:
    x, y, w, h = node["x"], node["y"], node["w"], node["h"]
    cx, cy = x + w / 2, y + h / 2
    r = w / 2
    etype = node.get("event-type", "intermediate")
    sw = EVENT_STROKE_BY_TYPE.get(etype, 1)
    fill = COLOR_EVENT_FILL
    # Terminate end events render as a filled black circle.
    if etype == "end" and node.get("trigger") == "terminate":
        fill = COLOR_EVENT_STROKE
    # Render the circle as an SVG <circle>. The renderer handles `rect`
    # primitives with rx but a true circle is cleaner here. The renderer
    # walks unknown primitives by name → we'll emit a `circle` and the
    # renderer needs to know about it; if not, fall back to a rounded rect.
    children = [
        # Heavy-rounded rect approximates the circle. Better than relying
        # on a circle primitive that the existing renderer may not have.
        {"rect": {"x": x, "y": y, "width": w, "height": h,
                  "rx": r,
                  "fill": fill,
                  "stroke": COLOR_EVENT_STROKE, "stroke-width": sw}},
    ]
    # Optional label below the event.
    if node.get("label"):
        children.append(
            {"text": {"x": cx, "y": y + h + 4,
                      "content": node["label"],
                      "font-family": FONT, "font-size": FS_EVENT,
                      "text-anchor": "middle", "dominant-baseline": "hanging",
                      "fill": COLOR_TEXT}}
        )
    return {"group": {"id": node["id"], "from-element": "event", "children": children}}


def emit_gateway(node: dict) -> dict:
    x, y, w, h = node["x"], node["y"], node["w"], node["h"]
    cx, cy = x + w / 2, y + h / 2
    # Diamond as an SVG polygon — the renderer supports `polygon`.
    diamond_pts = [[cx, y], [x + w, cy], [cx, y + h], [x, cy]]
    children = [
        {"polygon": {"points": diamond_pts,
                     "fill": COLOR_GATEWAY_FILL,
                     "stroke": COLOR_GATEWAY_STROKE, "stroke-width": 1}},
        # Type marker — single character centred. Saves needing per-type
        # SVG icons for the first cut.
        {"text": {"x": cx, "y": cy,
                  "content": _gateway_marker(node.get("type", "exclusive")),
                  "font-family": FONT, "font-size": 18, "font-weight": "bold",
                  "text-anchor": "middle", "dominant-baseline": "central",
                  "fill": COLOR_GATEWAY_STROKE}},
    ]
    if node.get("label"):
        children.append(
            {"text": {"x": cx, "y": y + h + 4,
                      "content": node["label"],
                      "font-family": FONT, "font-size": FS_EVENT,
                      "text-anchor": "middle", "dominant-baseline": "hanging",
                      "fill": COLOR_TEXT}}
        )
    return {"group": {"id": node["id"], "from-element": "gateway", "children": children}}


def _gateway_marker(gtype: str) -> str:
    return {"exclusive":   "×",   # ×
            "parallel":    "+",
            "inclusive":   "○",   # ○
            "event-based": "⬡",   # ⬡ (hexagon — pentagon isn't in basic Unicode)
            "complex":     "*"}.get(gtype, "")


def emit_flow(fl: dict) -> dict:
    pts = fl["points"]
    ftype = fl.get("type", "sequence")
    color = COLOR_SEQUENCE if ftype == "sequence" else COLOR_MESSAGE
    dasharray = "" if ftype == "sequence" else "6,4"
    children = []
    line_attrs = {"points": pts, "stroke": color, "stroke-width": 1.5,
                  "fill": "none"}
    if dasharray:
        line_attrs["stroke-dasharray"] = dasharray
    children.append({"polyline": line_attrs})
    # Arrowhead at target — small filled triangle for sequence,
    # unfilled for message.
    arrow = _arrow_polygon(pts[-2], pts[-1], filled=(ftype == "sequence"), color=color)
    if arrow:
        children.append(arrow)
    # Optional label above the midpoint of the polyline.
    if fl.get("label"):
        mid = pts[len(pts) // 2]
        children.append({"text": {"x": mid[0], "y": mid[1] - 4,
                                  "content": fl["label"],
                                  "font-family": FONT, "font-size": 9, "font-style": "italic",
                                  "text-anchor": "middle", "dominant-baseline": "auto",
                                  "fill": color}})
    return {"group": {"id": _flow_group_id(fl),
                      "from-element": "connector",
                      "source": fl.get("from"), "target": fl.get("to"),
                      "children": children}}


def _flow_group_id(fl: dict) -> str:
    fid = fl.get("id") or f"{fl.get('from','?')}-{fl.get('to','?')}"
    return f"flow-{fid}"


def _arrow_polygon(p_prev, p_end, *, filled: bool, color: str) -> dict | None:
    """Triangle at p_end pointing along the (p_prev → p_end) direction.
    `filled=True` produces a filled-tip sequence-flow arrow; `False`
    produces an unfilled (white-fill) triangle for message flows."""
    import math
    dx, dy = p_end[0] - p_prev[0], p_end[1] - p_prev[1]
    length = math.sqrt(dx * dx + dy * dy)
    if length == 0:
        return None
    ux, uy = dx / length, dy / length          # unit forward
    px, py = -uy, ux                            # unit perpendicular
    size = 8
    tip = (p_end[0], p_end[1])
    base_l = (p_end[0] - ux * size + px * size * 0.4,
              p_end[1] - uy * size + py * size * 0.4)
    base_r = (p_end[0] - ux * size - px * size * 0.4,
              p_end[1] - uy * size - py * size * 0.4)
    fill = color if filled else COLOR_BG    # background-coloured fill = "unfilled" look
    return {"polygon": {"points": [list(tip), list(base_l), list(base_r)],
                        "fill": fill, "stroke": color, "stroke-width": 1}}


def render_scene(model: dict) -> dict:
    layout = compute_layout(model)
    scene = []
    pools = model.get("pools") or {}
    # Pools first (background bands), then lanes (interior dividers),
    # then flow nodes (foreground), then flows (on top so arrows are
    # visible above any overlapping shape).
    for pool_id in pools:
        if pool_id in layout["pools"]:
            scene.append(emit_pool(pool_id, layout["pools"][pool_id]))
    for (pool_id, lane_id), lane in layout["lanes"].items():
        scene.append(emit_lane(pool_id, lane_id, lane))
    for nid, node in layout["nodes"].items():
        kind = node.get("kind")
        if kind == "task":      scene.append(emit_task(node))
        elif kind == "event":   scene.append(emit_event(node))
        elif kind == "gateway": scene.append(emit_gateway(node))
    for fl in layout["flows"]:
        scene.append(emit_flow(fl))
    canvas = {
        "background": COLOR_BG,
        "width":  layout["canvas"]["w"],
        "height": layout["canvas"]["h"],
    }
    return {"canvas": canvas, "scene": scene}


# ── CLI ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("source",
                        help="Path to a compiled BPMN YAML (output of bpmn_compiler.py).")
    parser.add_argument("-o", "--output", required=True,
                        help="Path to write the scene-graph YAML (consumed by visual_engine/renderer/render.py).")
    args = parser.parse_args()

    src = Path(args.source).resolve()
    if not src.exists():
        print(f"ERROR: compiled BPMN not found: {src}", file=sys.stderr)
        return 2
    try:
        model = yaml.safe_load(src.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as e:
        print(f"ERROR: malformed YAML in {src}: {e}", file=sys.stderr)
        return 2

    scene = render_scene(model)

    out = Path(args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write("# Compiled BPMN scene graph — generated by visual_compiler.py.\n\n")
        yaml.safe_dump(scene, f, sort_keys=False, allow_unicode=True, width=160)
    print(f"Wrote: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
