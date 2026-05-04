# Layout Specification

This document specifies how the visual engine resolves layout — the two-pass algorithm and the four layout strategies a parent rect can use to position its children.

## 1. Two-Pass Layout Algorithm

The engine resolves layout in two passes over the visual tree.

### Pass 1 — Root → Leaves

Walk the tree top-down. At each node, record any declared coordinates and dimensions. When the walk reaches a **leaf** (a rect with no children), finalize its absolute pixel position and size from the declared values.

```
def pass1(node):
    if is_leaf(node):
        node.bounds = compute_pixel_bounds_from_declared(node)
    else:
        record_declared_hints(node)   # hints; pass 2 may override
        for child in node.children:
            pass1(child)
```

After pass 1, every leaf has its final absolute bounds. Non-leaves have only declared hints (which are not authoritative).

### Pass 2 — Leaves → Root

Walk back up. At each non-leaf node:
1. Apply the parent's `layout` strategy to position its children relative to each other (a no-op for absolute layout; computed positions for v-stack / h-stack / grid).
2. Compute the bounding box of the positioned children.
3. Expand by the node's `padding` on each side.
4. The result is the node's `bounds`.

```
def pass2(node):
    if is_leaf(node):
        return            # finalized in pass 1
    for child in node.children:
        pass2(child)
    layout_strategy(node).position_children(node)
    bbox = bounding_box(c.bounds for c in node.children)
    node.bounds = expand(bbox, node.padding)
```

The parent's declared coordinates are **not** used in pass 2 for non-leaves — they are advisory hints only. The parent is *shrink-wrapped* around its children plus padding.

### Margin (final step)

Margin is applied to a node's `bounds` as an inset, producing the visible rect:

```
node.visible_bounds = inset(node.bounds, node.margin)
```

Margin shrinks the visible rect inward from `bounds`. It does not affect children's positions.

### Edge cases

- **Empty parent (no children)** — `bounds = (0, 0, 0, 0)`. Treat as a warning during compilation.
- **Leaf without coordinates** — parse error. A leaf must declare either `(col, row)(col, row)` (absolute) or `cell=(col, row) size=(w, h)` (under a grid).
- **Conflicting declared bounds and computed bounds on a non-leaf** — computed wins. The declared hint is silently dropped. May warrant a warning if they differ.

---

## 2. Coordinate System and Units

- The canvas is a uniform grid of **20-pixel** squares.
- Positions on the canvas (`(col, row)`) are in **cell units** (multiples of 20px). 0-indexed; origin is top-left.
- Sizes (`size=(w, h)`), `padding`, `margin`, `spacing`, and `gap` values are in **pixels**.
- Mixing units in one declaration is normal: `rect (5, 5) padding=10 size=(40, 40)` is valid.

---

## 3. Margin and Padding

Both accept either:
- **1 value** — applies uniformly to all four sides. `padding=5` ≡ `padding=5,5,5,5`.
- **4 values** — in WPF Thickness order: `(left, top, right, bottom)`.

CSS-style 2- or 3-value forms are explicitly **rejected** as parse errors.

Semantic difference:
- **Margin** shrinks the rect's visible bounds inward from its computed bounds (inner inset on the rect itself).
- **Padding** describes inner space reserved for children. Pass 2 expands the parent's bounds by `padding` around the children's bounding box.

---

## 4. Layout Strategies for Children

A parent's `layout` attribute determines how children are positioned. Four strategies.

### 4.1 Absolute (default)

If no `layout` keyword appears on the parent, children are positioned by their own declared coordinates.

```
rect (5,5)(15,15) padding=5 {
    rect (8,8)(12,12) padding=5 {
        rect (10,10)(11,11)
    }
}
```

Pass 2 wraps the parent around the bounding box of its absolutely-placed children plus padding. Children's positions don't change in pass 2; only the parent's bounds adjust.

Reference: `test_inputs/input1.markup`, `test_inputs/input2.markup`.

### 4.2 Vertical stack (`v-stack`)

```
rect v-stack spacing=N align=left|center|right padding=... {
    rect ...
    rect ...
}
```

Children are positioned top-to-bottom in declaration order. After each child's bounds are finalized in pass 2, the layout assigns Y positions:

```
y = top + sum(prev_child_heights) + (i * spacing)
```

Cross-axis (X) position is set by `align` within the parent's content width.

| Parameter   | Type        | Values                  | Default  |
|-------------|-------------|-------------------------|----------|
| `spacing`   | pixels      | non-negative integer    | `0`      |
| `align`     | enum        | `left`, `center`, `right` | `center` |

Parent dimensions: `width = max(child.width)`, `height = sum(child.heights) + (n-1)*spacing`, plus padding.

### 4.3 Horizontal stack (`h-stack`)

```
rect h-stack spacing=N align=top|center|bottom padding=... {
    rect ...
    rect ...
}
```

Mirror of v-stack: children placed left-to-right, cross-axis is Y.

| Parameter   | Type        | Values                    | Default  |
|-------------|-------------|---------------------------|----------|
| `spacing`   | pixels      | non-negative integer      | `0`      |
| `align`     | enum        | `top`, `center`, `bottom` | `center` |

Parent dimensions: `width = sum(child.widths) + (n-1)*spacing`, `height = max(child.height)`, plus padding.

### 4.4 Uniform grid (`grid=(cols, rows)`)

```
rect grid=(C, R) gap=(gx, gy) align=center|top-left|... padding=... {
    rect cell=(c, r) size=(w, h)
    ...
}
```

The parent reserves a `cols × rows` matrix of equal-sized cells. Children declare which cell they occupy via `cell=(col, row)` (1-indexed) and their own `size=(w, h)` in pixels.

Cell sizing:
- Every cell is the same size (uniform).
- `cell_w = max(child.size.w)` across all children; `cell_h = max(child.size.h)`.
- Mirrors WPF UniformGrid behavior. Smaller children sit centered (or per `align`) within their full-sized cell.

All cells reserved:
- Even if only some `(col, row)` pairs are occupied, the grid extends to the full `C × R` matrix. Empty cells take the same space as occupied ones.
- Adding or removing a child from one cell does *not* reshape the rest of the grid.

| Parameter | Type         | Values                                 | Default  |
|-----------|--------------|----------------------------------------|----------|
| `gap`     | `(gx, gy)` px | non-negative pair                      | `(0, 0)` |
| `align`   | enum         | `center`, `top-left`, `stretch`, …     | `center` |

Parent dimensions: `width = C*cell_w + (C-1)*gx`, `height = R*cell_h + (R-1)*gy`, plus padding.

Reference: `test_inputs/input3.markup`.

### 4.5 Mixing strategies

Children can independently use their own layout strategy. A `v-stack` can contain a grid-layout child, which can contain absolute-positioned grandchildren, and so on. Each parent decides the placement of its own children. Pass 2 resolves bottom-up so each subtree finishes before its parent positions it.

### 4.6 Explicit coords override the parent's layout

A child with explicit `(col, row)(col, row)` coordinates **bypasses** its parent's layout strategy. The child is placed exactly where its coords specify; the layout positions the *other* children around it.

Important for diagrams that are mostly regular but have one or two specially-placed elements.

---

## 5. Implementation status (as of session end 2026-04-27)

The two-pass algorithm is implemented in `visual_engine/markup/markup_compiler/markup_compiler.py` as `measure(node)` (bottom-up) and `arrange(node, x, y, w, h)` (top-down). Highlights of how the implementation interprets this spec:

- **Layout strategies implemented:** `canvas` (absolute, default), `stack-panel-vertical`, `stack-panel-horizontal`. `grid` and `uniform-grid` are defined in `visual_primitives.yaml` but the compiler doesn't yet specialise their measure/arrange — they fall back to canvas semantics for now.
- **Declared wins over computed.** When a node has author-declared `width`/`height`, those values are authoritative. Computed (shrink-wrap) only fills in what the author didn't declare. This deliberately diverges from the strict reading of "computed wins on non-leaves" — locking in the user's intent matters more than perfect shrink-wrap consistency.
- **Empty containers measure 0×0.** Wrapper / layout-only types (`items-presenter`, `stack-panel`, `border` without children) measure 0×0 instead of falling back to a type default. So an empty zone shrinks to its title strip.
- **Pinned children in stacks.** A child with declared `at:{y: …}` (or `at:{x: …}` for h-stack) is pinned to that offset. **Measure simulates the same flow as arrange** — pinned children push the cursor down (or right) for subsequent flowed siblings. Otherwise pinned items would render outside their parent's measured bounds.
- **Composite-element template root fills parent.** A composite element (location, building-block, component, actor) arranges its template root child to fill the composite's inner area. Otherwise the template's outer border would shrink-wrap to its own template content and ignore the location's declared size.
- **Text measurement.** Resolved at template-expansion time via PIL (`measure_text` in the compiler) using DejaVu Sans on the bash sandbox. Width/height are accurate per glyph metrics instead of crude `font-size × len × 0.6` estimates.

---

## 6. Open Questions

- **Stretch alignment.** Should stacks support `align=stretch` (force all children to fill the cross axis)? Useful for full-width sections.
- **Wrap / flow strategy.** Not in this spec but proposed earlier — a stack that wraps after N items or a width threshold. Add when needed.
- **Grid layout specialisation.** The `grid=(C,R)` strategy has a measure/arrange of its own; current implementation falls back to canvas. Specialise when a markup actually uses grid.
- **Position anchor for top-level layout-driven parents.** Practically resolved: top-level markup wraps composites in an explicit `stack` element (`stack-panel-element` in the layout tree) with `orientation: horizontal|vertical`, which provides the anchor and flow for everything inside. The canvas root remains a no-flow strategy; without an outer stack, top-level elements without declared coords stack at (0,0).
- **Stack + explicit-coord children interaction.** Implementation: pinned children (declared `at:`) keep their declared offset and contribute to `max_pinned_bottom`/`max_pinned_right`; flowed children use `max(cursor, max_pinned_bottom)` as their starting position. Spec text above predates this; implementation rule should fold in.

*Resolved 2026-04-27 (this session):*
- ~~Position anchor for layout-driven parents~~ — handled via the wrapping `stack` element pattern.
- ~~Conflicting declared bounds and computed bounds on a non-leaf~~ — declared wins.

---

## 7. Reference Test Inputs

| File | What it tests |
|------|---------------|
| `test_inputs/input1.markup` | Basic absolute-coord nesting; uniform padding. |
| `test_inputs/input2.markup` | Asymmetric padding; parents without declared coords; pure shrink-wrap. |
| `test_inputs/input3.markup` | Uniform grid layout; max-child cell size; sub-cell-sized children. |
| `test_inputs/input4.markup` | YAML markup form. h-stack of 3 locations with shrink-wrap, one containing a nested component. Exercises measure+arrange end-to-end. |
