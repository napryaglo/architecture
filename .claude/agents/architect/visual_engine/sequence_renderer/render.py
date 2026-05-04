#!/usr/bin/env python3
"""Sequence-diagram renderer.

Reads a compiled architecture YAML and renders one of its (scenario, sequence)
flows as a UML-flavoured sequence diagram SVG. Lifelines correspond to the
participants discovered by walking the sequence's steps in order; horizontal
arrows represent each step.

Usage:
    python visual_engine/sequence_renderer/render.py <compiled.arch.yaml> \
        --scenario <scenario-id> --sequence <sequence-id> -o <output.svg>

The sequence id must match the slug `model_compiler._slug_sequence_id` would
produce from the sequence's `Title` field.
"""
from __future__ import annotations
import argparse
import re
import sys
import xml.sax.saxutils as saxutils
from pathlib import Path

import yaml


# ── Layout constants ──────────────────────────────────────────────
# Generous margins; legibility over compactness for diagrams that are
# typically embedded in slides or shared as standalone images.
COL_WIDTH    = 160
ROW_HEIGHT   = 48
HEADER_PAD   = 24
TITLE_HEIGHT = 32
SUBTITLE_HEIGHT = 22
PARTICIPANT_BOX_PAD    = 14   # outer pad around the box, per side
PARTICIPANT_TEXT_PAD   = 6    # inner pad between box edge and text, per side
PARTICIPANT_FONT_SIZE  = 12
PARTICIPANT_LINE_H     = 14   # 1.17× font size — comfortable but compact
PARTICIPANT_VPAD       = 10   # top/bottom pad inside the box for the text block
LIFELINE_TOP_GAP       = 18
ARROW_HEAD_LEN = 9
SELF_LOOP_W    = 36
SELF_LOOP_H    = 26

# Colours match the architecture viewer / topology palette so a diagram and
# the topology it summarises feel like the same family.
BG          = "#FAFAF9"
LIFELINE    = "#8A8780"
ARROW       = "#22211E"
ARROW_FAINT = "#5F5C56"
PARTICIPANT_FILL    = "#FFFFFF"
PARTICIPANT_STROKE  = "#8A8780"
PARTICIPANT_ACTOR   = "#E2F1F4"   # cool tint for actors so they read as "outside the system"
PARTICIPANT_TEXT    = "#22211E"
TITLE_TEXT  = "#22211E"
SUBTITLE    = "#5F5C56"
STEP_NUMBER_FILL    = "#FF6B00"
STEP_NUMBER_TEXT    = "#FFFFFF"

FONT_FAMILY = "Segoe UI, Calibri, Arial, sans-serif"

# Arrow style per connector type. Calls is the default (solid); event/consumes
# get distinct dashes so they read as different kinds of edge at a glance.
ARROW_STYLES = {
    "calls":              {"dasharray": "",      "color": ARROW},
    "event":              {"dasharray": "4 3",   "color": ARROW},
    "consumes":           {"dasharray": "2 3",   "color": ARROW_FAINT},
    "available-through":  {"dasharray": "",      "color": ARROW_FAINT},
    "enabled-by":         {"dasharray": "6 3",   "color": ARROW_FAINT},
    "hosted-by":          {"dasharray": "2 2",   "color": ARROW_FAINT},
}

# Slug regex must match `model_compiler._slug_sequence_id` so callers can
# pass the same slug ids the model compiler stamps on each connector.
SLUG_NON_ALNUM = re.compile(r"[^a-z0-9]+")
ARROW_SEP = "→"
STEP_KIND_RE = re.compile(r"^\[\s*([a-z\-]+)\s*\]\s*")


def esc(s):
    return saxutils.escape(str(s))


def slug_sequence_id(title: str, fallback_idx: int) -> str:
    if isinstance(title, str) and title.strip():
        slug = SLUG_NON_ALNUM.sub("-", title.lower()).strip("-")
        if slug:
            return slug
    return f"seq-{fallback_idx + 1}"


def normalise_label(raw, fallback):
    """Labels in the model can be a string or a list of lines (the multi-line
    form used by some blocks). For sequence-diagram participant boxes we want
    a single line — join list entries with a space; we wrap on display."""
    if isinstance(raw, list):
        return " ".join(str(x) for x in raw if x is not None)
    if isinstance(raw, str):
        return raw
    return fallback


def estimate_text_width(text: str, font_size: int) -> float:
    """Rough proportional-font width estimate. Calibrated for Segoe UI /
    Calibri at 600 weight. We can't measure exactly without a font engine,
    so the constant is conservative — slight under-fit leaves a small
    breathing margin inside the box rather than truncating mid-word."""
    return font_size * 0.58 * len(text)


def wrap_label(label: str, max_width: float, font_size: int) -> list[str]:
    """Greedy word-wrap: pack words into a line until the next word would
    push us past `max_width`, then start a new line. Single words longer
    than the cap are kept on their own line and overflow visually — better
    than truncating mid-word with no indication."""
    words = (label or "").split()
    if not words:
        return [""]
    lines = [words[0]]
    for w in words[1:]:
        candidate = lines[-1] + " " + w
        if estimate_text_width(candidate, font_size) <= max_width:
            lines[-1] = candidate
        else:
            lines.append(w)
    return lines


def build_id_index(arch: dict) -> dict:
    """Flat lookup `id -> (kind, label)` covering everything a sequence step
    can reference: actors, locations, blocks, components (standalone and
    block-internal). Used for the participant header labels."""
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
        idx[bid] = ("block", normalise_label(b.get("label"), bid))
        for cid, c in (b.get("components") or {}).items():
            if isinstance(c, dict):
                idx[cid] = ("component", normalise_label(c.get("label"), cid))
    for loc, comps in (arch.get("components") or {}).items():
        for cid, c in (comps or {}).items():
            if isinstance(c, dict):
                idx[cid] = ("component", normalise_label(c.get("label"), cid))
    return idx


def parse_step(step_str: str) -> tuple[str, str, str]:
    """Parse `<src> → <dst>` or `<src> →[<kind>] <dst>` — same grammar as the
    model compiler so we don't disagree on which steps mean what."""
    if ARROW_SEP not in step_str:
        return None
    src, rest = step_str.split(ARROW_SEP, 1)
    src = src.strip()
    rest = rest.lstrip()
    m = STEP_KIND_RE.match(rest)
    if m:
        return src, m.group(1), rest[m.end():].strip()
    return src, "calls", rest.strip()


def find_sequence(scenario: dict, sequence_id: str) -> dict | None:
    """Locate the sequence inside a scenario by its slug id."""
    for j, raw in enumerate(scenario.get("sequences") or []):
        inner = raw.get("sequence") if isinstance(raw, dict) and "sequence" in raw else raw
        if not isinstance(inner, dict):
            continue
        title = inner.get("Title") or inner.get("title")
        if slug_sequence_id(title, j) == sequence_id:
            return inner
    return None


def collect_participants(steps: list, entry_point: str | None) -> list[str]:
    """Return participant ids in first-appearance order. The Entry Point is
    forced to be the leftmost lifeline so the diagram reads top-down and
    left-to-right naturally — the viewer enters from the leftmost column."""
    seen = set()
    order = []
    if entry_point:
        order.append(entry_point)
        seen.add(entry_point)
    for step in steps:
        if not isinstance(step, str):
            continue
        parsed = parse_step(step)
        if not parsed:
            continue
        for endpoint in (parsed[0], parsed[2]):
            if endpoint not in seen:
                seen.add(endpoint)
                order.append(endpoint)
    return order


def render_text(x, y, content, *, anchor="start", size=12, weight="normal",
                style="normal", fill=TITLE_TEXT, baseline=None):
    attrs = (
        f'x="{x}" y="{y}" '
        f'font-family="{FONT_FAMILY}" font-size="{size}" '
        f'font-weight="{weight}" font-style="{style}" '
        f'text-anchor="{anchor}" fill="{fill}"'
    )
    if baseline:
        attrs += f' dominant-baseline="{baseline}"'
    return f'<text {attrs}>{esc(content)}</text>'


def participant_box(x, y, w, h, lines, kind):
    """Render a participant header — rounded box plus a vertically-centred
    multi-line label. Lines are pre-wrapped by the caller (see `wrap_label`).
    All participants share the same `h` so their lifelines start at the same
    baseline regardless of which one needed the most lines."""
    fill = PARTICIPANT_ACTOR if kind == "actor" else PARTICIPANT_FILL
    cx = x + w / 2
    cy = y + h / 2
    rect = (
        f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" '
        f'rx="4" fill="{fill}" stroke="{PARTICIPANT_STROKE}" stroke-width="1"/>'
    )
    if not lines:
        return rect
    n = len(lines)
    # Position the first tspan such that the centre of the n-line block lands
    # on cy. Subsequent tspans add `dy = line_h` for SVG's relative-baseline
    # tspan stacking.
    first_y = cy - (n - 1) * PARTICIPANT_LINE_H / 2
    tspans = "".join(
        f'<tspan x="{cx:.2f}" dy="{0 if i == 0 else PARTICIPANT_LINE_H}">{esc(line)}</tspan>'
        for i, line in enumerate(lines)
    )
    text = (
        f'<text x="{cx:.2f}" y="{first_y:.2f}" '
        f'font-family="{FONT_FAMILY}" font-size="{PARTICIPANT_FONT_SIZE}" '
        f'font-weight="600" text-anchor="middle" dominant-baseline="central" '
        f'fill="{PARTICIPANT_TEXT}">{tspans}</text>'
    )
    return rect + "\n  " + text


def horizontal_arrow(x1, y, x2, *, color, dasharray=""):
    """Body of a sequence arrow, with a stealth chevron head at the target.
    Sign of (x2 - x1) determines head direction. Self-arrows (x1==x2) are
    drawn separately by `self_loop`.

    The line terminates at the chevron's *notch* (the V-point on the
    centerline), not at its back corner — terminating at the back corner
    leaves a 3-px unfilled stretch on the centerline because the notch is
    forward of the back-corner, and the wings cover only above/below."""
    dx = x2 - x1
    direction = 1 if dx >= 0 else -1
    tip_x   = x2
    back_x  = tip_x - direction * ARROW_HEAD_LEN
    notch_x = back_x + direction * 3                # the V-point on the centerline
    line_attrs = f'stroke="{color}" stroke-width="1.5"'
    if dasharray:
        line_attrs += f' stroke-dasharray="{dasharray}"'
    line = f'<line x1="{x1:.2f}" y1="{y:.2f}" x2="{notch_x:.2f}" y2="{y:.2f}" {line_attrs}/>'
    # Filled triangle head; matches the topology renderer's stealth chevron
    # in spirit (concave wings) so the two diagrams look like siblings.
    p1 = (tip_x,   y)
    p2 = (back_x,  y - 4)
    p3 = (notch_x, y)
    p4 = (back_x,  y + 4)
    head = (
        f'<polygon points="{p1[0]:.2f},{p1[1]:.2f} {p2[0]:.2f},{p2[1]:.2f} '
        f'{p3[0]:.2f},{p3[1]:.2f} {p4[0]:.2f},{p4[1]:.2f}" '
        f'fill="{color}" stroke="{color}" stroke-width="0.5"/>'
    )
    return line + "\n  " + head


def self_loop(x, y, *, color, dasharray=""):
    """Self-call: a small clockwise loop on the lifeline. Returns the path
    plus an arrow head pointing back into the lifeline. Path terminates at
    the chevron's notch, same reason as `horizontal_arrow` — see comment
    there for why we don't stop at the back corner."""
    half = SELF_LOOP_H / 2
    w = SELF_LOOP_W
    line_attrs = f'fill="none" stroke="{color}" stroke-width="1.5"'
    if dasharray:
        line_attrs += f' stroke-dasharray="{dasharray}"'
    # The arrow points LEFT (back into the lifeline at x). Tip at x;
    # back-corner at x + ARROW_HEAD_LEN; notch at x + ARROW_HEAD_LEN - 3.
    tip_x   = x
    back_x  = x + ARROW_HEAD_LEN
    notch_x = back_x - 3
    path = (
        f"M {x:.2f} {y - half:.2f} "
        f"L {x + w:.2f} {y - half:.2f} "
        f"L {x + w:.2f} {y + half:.2f} "
        f"L {notch_x:.2f} {y + half:.2f}"
    )
    line = f'<path d="{path}" {line_attrs}/>'
    head_y = y + half
    head = (
        f'<polygon points="{tip_x:.2f},{head_y:.2f} '
        f'{back_x:.2f},{head_y - 4:.2f} '
        f'{notch_x:.2f},{head_y:.2f} '
        f'{back_x:.2f},{head_y + 4:.2f}" '
        f'fill="{color}" stroke="{color}" stroke-width="0.5"/>'
    )
    return line + "\n  " + head


def step_number_badge(x, y, n):
    """A small filled circle with the step number — orange to match the
    architecture viewer's pressed-sequence accent."""
    return (
        f'<circle cx="{x:.2f}" cy="{y:.2f}" r="9" '
        f'fill="{STEP_NUMBER_FILL}" stroke="{STEP_NUMBER_FILL}"/>\n  '
        + render_text(x, y, str(n), anchor="middle", baseline="central",
                      size=10, weight="700", fill=STEP_NUMBER_TEXT)
    )


def render_sequence_svg(arch: dict, scenario_id: str, sequence_id: str) -> str:
    scenarios = arch.get("scenarios") or {}
    scenario = scenarios.get(scenario_id)
    if not isinstance(scenario, dict):
        raise ValueError(f"scenario '{scenario_id}' not found in compiled model")

    sequence = find_sequence(scenario, sequence_id)
    if sequence is None:
        raise ValueError(
            f"sequence '{sequence_id}' not found under scenario '{scenario_id}'"
        )

    title    = sequence.get("Title") or sequence.get("title") or sequence_id
    entry    = sequence.get("Entry Point") or sequence.get("entry-point") or sequence.get("entryPoint")
    steps    = sequence.get("steps") or []
    scen_lbl = scenario.get("label", scenario_id)

    participants = collect_participants(steps, entry)
    if not participants:
        raise ValueError(f"sequence '{sequence_id}' has no participants")

    id_index = build_id_index(arch)

    # ── Pre-wrap participant labels and pick a uniform box height ─
    # All participant boxes share the same height so their lifelines start
    # at the same Y. Box height is sized to fit the longest wrapped label.
    box_w     = COL_WIDTH - 2 * PARTICIPANT_BOX_PAD
    text_w    = box_w - 2 * PARTICIPANT_TEXT_PAD
    wrapped   = {}
    max_lines = 1
    for pid in participants:
        kind, label = id_index.get(pid, ("?", pid))
        lines = wrap_label(label, text_w, PARTICIPANT_FONT_SIZE)
        wrapped[pid] = (kind, lines)
        if len(lines) > max_lines:
            max_lines = len(lines)
    box_h = 2 * PARTICIPANT_VPAD + max_lines * PARTICIPANT_LINE_H

    # ── Geometry ──────────────────────────────────────────────────
    inner_w   = max(1, len(participants)) * COL_WIDTH
    width     = inner_w + 2 * HEADER_PAD
    header_h  = TITLE_HEIGHT + SUBTITLE_HEIGHT + 16
    p_top     = header_h + 8
    lifeline_top = p_top + box_h + LIFELINE_TOP_GAP
    n_steps   = len([s for s in steps if isinstance(s, str) and parse_step(s)])
    height    = lifeline_top + (n_steps + 1) * ROW_HEIGHT + HEADER_PAD

    col_x = {pid: HEADER_PAD + i * COL_WIDTH + COL_WIDTH / 2
             for i, pid in enumerate(participants)}

    parts = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {width} {height}" width="{width}" height="{height}">'
    )
    parts.append(f'  <rect x="0" y="0" width="{width}" height="{height}" fill="{BG}"/>')

    # ── Header ────────────────────────────────────────────────────
    parts.append("  " + render_text(
        HEADER_PAD, TITLE_HEIGHT, title,
        anchor="start", size=18, weight="700", fill=TITLE_TEXT))
    parts.append("  " + render_text(
        HEADER_PAD, TITLE_HEIGHT + SUBTITLE_HEIGHT, f"Scenario: {scen_lbl}",
        anchor="start", size=12, style="italic", fill=SUBTITLE))

    # ── Participant headers + lifelines ───────────────────────────
    for pid in participants:
        cx = col_x[pid]
        kind, lines = wrapped[pid]
        parts.append("  " + participant_box(
            cx - box_w / 2, p_top, box_w, box_h, lines, kind))
        # Lifeline drops straight from the bottom of the participant box
        # to the bottom of the diagram. The row grid sits on top of it.
        parts.append(
            f'  <line x1="{cx:.2f}" y1="{lifeline_top:.2f}" '
            f'x2="{cx:.2f}" y2="{height - HEADER_PAD:.2f}" '
            f'stroke="{LIFELINE}" stroke-width="1" stroke-dasharray="3 3"/>'
        )

    # ── Steps ─────────────────────────────────────────────────────
    row = 0
    step_idx = 0
    for step_str in steps:
        if not isinstance(step_str, str):
            continue
        parsed = parse_step(step_str)
        if not parsed:
            continue
        src, kind, dst = parsed
        style = ARROW_STYLES.get(kind, ARROW_STYLES["calls"])
        if src not in col_x or dst not in col_x:
            # Defensive: a step references something the participant collector
            # didn't see. Skip with a warning marker on the side.
            continue
        y_row = lifeline_top + (row + 1) * ROW_HEIGHT
        x_src = col_x[src]
        x_dst = col_x[dst]
        if src == dst:
            parts.append("  " + self_loop(x_src, y_row,
                                          color=style["color"],
                                          dasharray=style["dasharray"]))
            label_x = x_src + SELF_LOOP_W + 12
        else:
            parts.append("  " + horizontal_arrow(
                x_src, y_row, x_dst,
                color=style["color"], dasharray=style["dasharray"]))
            label_x = (x_src + x_dst) / 2
        # Step number badge sits on the source lifeline at the row height.
        parts.append("  " + step_number_badge(x_src, y_row, step_idx + 1))
        # Optional kind label (skip for the default `calls`).
        if kind != "calls":
            parts.append("  " + render_text(
                label_x, y_row - 8, kind, anchor="middle",
                size=10, style="italic", fill=ARROW_FAINT))
        row += 1
        step_idx += 1

    parts.append("</svg>")
    return "\n".join(parts) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("source",
                        help="Path to the compiled architecture YAML.")
    parser.add_argument("--scenario", required=True,
                        help="Scenario id within the model.")
    parser.add_argument("--sequence", required=True,
                        help="Sequence slug id (matches model_compiler's "
                             "`_slug_sequence_id` of the sequence's Title).")
    parser.add_argument("-o", "--output", required=True,
                        help="Path to write the SVG.")
    args = parser.parse_args()

    src = Path(args.source).resolve()
    if not src.exists():
        print(f"ERROR: compiled architecture not found: {src}", file=sys.stderr)
        return 2
    arch = yaml.safe_load(src.read_text(encoding="utf-8")) or {}
    try:
        svg = render_sequence_svg(arch, args.scenario, args.sequence)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    out = Path(args.output).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg, encoding="utf-8")
    print(f"Wrote: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
