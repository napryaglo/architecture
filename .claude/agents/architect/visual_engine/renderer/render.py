#!/usr/bin/env python3
"""Renderer. Reads a compiled scene graph and emits SVG."""
from __future__ import annotations
import argparse
import json
import sys
import xml.sax.saxutils as saxutils
from pathlib import Path

import yaml


def esc(s):
    return saxutils.escape(str(s))


def render_node(node, indent=2):
    pad = " " * indent
    for kind in ("group", "canvas"):
        if kind in node:
            g = node[kind]
            attrs = f' id="{esc(g["id"])}"' if "id" in g else ""
            for key in ("scenario", "sequence", "step", "source", "target"):
                if key in g:
                    attrs += f' data-{key}="{esc(g[key])}"'
            # Multi-membership: when the markup compiler attached a `flows`
            # list (from a model lookup), serialise it as JSON inside a
            # single attribute. quoteattr handles the inner double-quotes
            # by switching delimiters or escaping — never use plain `esc`
            # here, since esc leaves `"` raw and the browser would close
            # the attribute on the first inner quote.
            if "flows" in g:
                attrs += f' data-flows={saxutils.quoteattr(json.dumps(g["flows"]))}'
            # `from-element` is the markup compiler's tag for what the group
            # represents in the model (location, building-block, actor,
            # component). Surface it as `data-kind` for consumers like the
            # architecture-viewer scenario filter.
            if "from-element" in g:
                attrs += f' data-kind="{esc(g["from-element"])}"'
            inner = "\n".join(render_node(c, indent + 2) for c in g.get("children", []))
            return f"{pad}<g{attrs}>\n{inner}\n{pad}</g>"

    if "rect" in node:
        r = node["rect"]
        a = []
        for key in ("x", "y", "width", "height", "rx"):
            if r.get(key) is not None:
                a.append(f'{key}="{r[key]}"')
        for key in ("fill", "stroke", "stroke-width", "stroke-dasharray", "opacity"):
            if r.get(key) is not None:
                a.append(f'{key}="{r[key]}"')
        return f"{pad}<rect {' '.join(a)}/>"

    if "text" in node:
        t = node["text"]
        a = [f'x="{t["x"]}"', f'y="{t["y"]}"']
        for src, dst in (("font-size", "font-size"), ("font-family", "font-family"),
                         ("text-anchor", "text-anchor"), ("fill", "fill"),
                         ("font-weight", "font-weight"), ("font-style", "font-style"),
                         ("dominant-baseline", "dominant-baseline")):
            if src in t:
                a.append(f'{dst}="{t[src]}"')
        # Optional rotation around the text's anchor point (x, y). Used
        # for vertical labels — most prominently the BPMN pool/lane
        # title strips. SVG rotates the entire text element including
        # its anchor + baseline references, so a rotated `text-anchor:
        # middle` still places the visual middle of the rendered glyphs
        # at the rotation centre.
        if "rotation" in t:
            a.append(f'transform="rotate({t["rotation"]} {t["x"]} {t["y"]})"')
        content = t["content"]
        if isinstance(content, list):
            lines = "".join(
                f'<tspan x="{t["x"]}" dy="{("0" if i == 0 else "1.2em")}">{esc(line)}</tspan>'
                for i, line in enumerate(content)
            )
            return f"{pad}<text {' '.join(a)}>{lines}</text>"
        return f"{pad}<text {' '.join(a)}>{esc(content)}</text>"

    if "image" in node:
        i = node["image"]
        a = [f'x="{i["x"]}"', f'y="{i["y"]}"',
             f'width="{i["width"]}"', f'height="{i["height"]}"']
        if "preserve-aspect-ratio" in i:
            a.append(f'preserveAspectRatio="{i["preserve-aspect-ratio"]}"')
        a.append(f'href="{i["href"]}"')
        return f"{pad}<image {' '.join(a)}/>"

    if "line" in node:
        l = node["line"]
        a = [f'x1="{l["x1"]}"', f'y1="{l["y1"]}"', f'x2="{l["x2"]}"', f'y2="{l["y2"]}"']
        for key in ("stroke", "stroke-width", "stroke-dasharray", "opacity"):
            if key in l:
                a.append(f'{key}="{l[key]}"')
        return f"{pad}<line {' '.join(a)}/>"

    if "polyline" in node:
        p = node["polyline"]
        pts = " ".join(f'{x},{y}' for x, y in p["points"])
        a = [f'points="{pts}"', 'fill="none"']
        for key in ("stroke", "stroke-width", "stroke-dasharray", "opacity"):
            if key in p:
                a.append(f'{key}="{p[key]}"')
        return f"{pad}<polyline {' '.join(a)}/>"

    if "polygon" in node:
        p = node["polygon"]
        pts = " ".join(f'{x},{y}' for x, y in p["points"])
        a = [f'points="{pts}"']
        for key in ("fill", "stroke", "stroke-width", "stroke-dasharray", "opacity"):
            if key in p:
                a.append(f'{key}="{p[key]}"')
        return f"{pad}<polygon {' '.join(a)}/>"

    raise ValueError(f"Unknown scene node: {list(node.keys())}")


def default_output_path(compiled_path):
    name = compiled_path.name
    if name.endswith("_compiled.yaml"):
        return compiled_path.with_name(name[:-len("_compiled.yaml")] + ".svg")
    return compiled_path.with_suffix(".svg")


def main():
    parser = argparse.ArgumentParser(description="Render compiled scene graph to SVG.")
    parser.add_argument("compiled_file")
    parser.add_argument("-o", "--output")
    args = parser.parse_args()

    src = Path(args.compiled_file).resolve()
    out = Path(args.output).resolve() if args.output else default_output_path(src)

    with open(src) as f:
        compiled = yaml.safe_load(f)

    canvas = compiled["canvas"]
    W, H = canvas["width"], canvas["height"]
    bg = canvas.get("background", "#FFFFFF")

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        f'  <rect width="{W}" height="{H}" fill="{bg}"/>',
    ]
    for node in compiled.get("scene", []):
        parts.append(render_node(node))
    parts.append("</svg>")

    out.write_text("\n".join(parts))
    print(f"Rendered: {out}")


if __name__ == "__main__":
    sys.exit(main())
