# Compiler Pipeline

This document describes the four stages the markup compiler runs to turn markup YAML into rendered SVG. It complements `01-layout.md` which specifies layout semantics.

## Overview

```
markup.yaml
    │
    ▼
┌─────────────────────────────────────────────────┐
│ Stage 1: BUILD layout tree                      │
│  - Parse markup elements                        │
│  - Expand each composite element's              │
│    ControlTemplate inline                       │
│  - Inject markup `children:` into the           │
│    template's items-presenter slot              │
│  - Resolve $self/$technology bindings on text   │
│    (so text content is known for measurement)   │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│ Stage 2: MEASURE — bottom-up                    │
│  - Each leaf (text, image): measured size       │
│    from declared or PIL font metrics            │
│  - Each container: aggregates by its layout     │
│    strategy (canvas → bbox; v-stack → flow      │
│    accounting for pinned children; etc.)        │
│  - Declared `width`/`height` win over computed  │
│  - Empty wrapper containers measure 0×0         │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│ Stage 3: ARRANGE — top-down                     │
│  - Each parent assigns final (x, y, w, h) to    │
│    each child using its layout strategy         │
│  - Composite elements treat their template      │
│    root as fill-parent                          │
│  - Stack-panel pinned children keep their       │
│    declared `at:` offset; flowed children       │
│    advance the cursor past pinned bottoms       │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────┐
│ Stage 4: EMIT — walk arranged tree              │
│  - Each node emits its scene primitive(s) at    │
│    its arranged position                        │
│  - Composite element wrappers emit `canvas`     │
│    groups; primitives (border → rect, text,     │
│    image) emit at arranged x, y, w, h           │
│  - DataTemplates for components are expanded    │
│    inline at the component's arranged bounds    │
│  - Icons embed as base64 data URIs              │
└─────────────────────────────────────────────────┘
    │
    ▼
compiled.yaml (scene graph)
    │
    ▼
┌─────────────────────────────────────────────────┐
│ Renderer (visual_engine/renderer/render.py)     │
│  - Walks scene tree; emits SVG mechanically     │
│  - canvas/group → <g>; rect → <rect>; etc.      │
└─────────────────────────────────────────────────┘
    │
    ▼
output.svg
```

## Layout-tree node shape

Every node carries the same fields:

```python
{
    "type": "location" | "border" | "stack-panel" | "text" | ...,
    "id": str,
    "layout": "canvas" | "stack-panel-vertical" | "stack-panel-horizontal" | ...,
    "declared": {"x": …, "y": …, "w": …, "h": …},   # author intent (any may be None)
    "padding": {top, right, bottom, left},
    "margin":  {top, right, bottom, left},
    "children": [ … ],
    "measured": {"w": …, "h": …},      # filled by measure()
    "arranged": {"x": …, "y": …, "w": …, "h": …},   # filled by arrange()
    "props": {…},                       # raw template node or markup instance
}
```

## How composite elements get expanded

When `_build_layout_tree` encounters a markup composite (e.g. `location`), it:
1. Loads the corresponding Style from the visual library (e.g. `location.yaml`).
2. Calls `_expand_template_subtree` on the Style's `template` to build a layout-tree subtree.
3. The markup element's own `children:` block is captured as `items_inject` and recursively built (using the same expansion path for each child composite).
4. Wherever `_expand_template_subtree` encounters an `items-presenter` node in the template, it injects `items_inject` as that node's children.

So the resulting layout tree includes both the composite's template internals (border, stack-panel, texts, items-presenter) **and** the markup-declared inner children, threaded through the items-presenter slot.

## Sidecar artifacts

The compiler writes two inspection files alongside the compiled scene:

- `<name>_compiled.yaml` — the flat scene graph the renderer consumes. Each scene primitive carries its absolute pixel coordinates.
- `<name>_layout.txt` — the pre-emit layout tree dumped one node per line, with each node's `declared`, `measured`, and `arranged` fields. Useful for diagnosing why something rendered where it did.

## Where the implementation lives

- `visual_engine/markup/markup_compiler/markup_compiler.py` — all four stages plus the helper functions (`measure_text`, `_get_font`, `resolve` for binding resolution, `icon_data_uri` for icon embedding, etc.).
- `visual_engine/renderer/render.py` — the SVG renderer. Currently the test driver but architecturally it's the back-end of the pipeline.

## Known limitations

- `grid` and `uniform-grid` layout strategies aren't yet specialised in measure/arrange — they fall back to canvas semantics.
- DataTemplate content (a component's category-specific icon + label) isn't yet part of the layout tree. It's expanded inline during emit using `compile_stack`, so the component's *measured* size is its declared bounds (default `100×100`), not its actual data-template content. Means a long component label can overflow the component's measured box. Wiring DataTemplates into the layout tree is the natural next step.
- Calc expressions (`$(a) + (0, -1)$`, midpoints, intersections) aren't implemented. Only literal `$self.x` / `$technology.x` style bindings are resolved.
- The TikZ-flavored markup parser doesn't exist; markup is authored as YAML translation of the eventual TikZ syntax.
