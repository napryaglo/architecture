# Visual Engine — Reference

Single-page reference for the visual engine. Covers the pipeline, the view DSL grammar, element properties, layout strategies, the two-pass layout algorithm, anchor placement, connectors, and the visual library composition model. Deeper material lives in the topical docs in this directory:

- [01-layout.md](01-layout.md) — original two-pass layout spec (some sections superseded; see §6 here for current state)
- [02-compiler-pipeline.md](02-compiler-pipeline.md) — stages and node shape
- [03-anchors.md](03-anchors.md) — anchor primitives, original implementation plan (steps now done)
- [05-connector-aware-layout.md](05-connector-aware-layout.md) — channel insertion in `ugrid`

Where this doc and the topical docs disagree, **this doc wins** — the topical docs predate per-axis anchors, the `distance` attribute, and connector min-gap constraints.

---

## 1. Pipeline

```
.view       --view_compiler-->  .markup (YAML)
.markup     --markup_compiler-->  _compiled.yaml (scene graph)
_compiled   --render.py-->       .svg
```

Three stages, each a Python script invoked by `test_inputs/render.bat`:

| Stage           | Script                                                                                                | Input        | Output                  |
|-----------------|-------------------------------------------------------------------------------------------------------|--------------|-------------------------|
| view compiler   | [visual_engine/markup/view_compiler/view_compiler.py](../markup/view_compiler/view_compiler.py)       | `*.view`     | `*.markup`              |
| markup compiler | [visual_engine/markup/markup_compiler/markup_compiler.py](../markup/markup_compiler/markup_compiler.py) | `*.markup`   | `*_compiled.yaml`, `*_layout.txt` |
| renderer        | [visual_engine/renderer/render.py](../renderer/render.py)                                             | `*_compiled` | `*.svg`                 |

Pre-flight: [check_integrity.py](../check_integrity.py) catches NUL-byte truncation and Python/YAML syntax breakage from the OS sync indexer (see CLAUDE.md "Critical gotcha: disk-write truncation").

The markup compiler does the heavy lifting: build → measure → arrange → emit (see §6).

---

## 2. View DSL grammar

A view is a tree of element references with optional layout keywords, attribute brackets, and a body. The parser is in `view_compiler.py` (`class Parser`).

### Top-level form

```
import visual-library     <path-or-name>
import technology-library <path-or-name>

view $<view-id> [<attr> = <val>, ...]
{
    <element-or-stack>+
    connectors {
        <connector-stmt>+
    }   // optional
}
```

### Tokens

`view_compiler.py` has a regex tokenizer. Identifiers allow letters, digits, underscores, hyphens. `$IDENT` is a reference; `IDENT` is a bare keyword/attribute name; numbers, strings (`"..."`), hex colors (`#rrggbb`) are literals. Attribute values inside `[...]` brackets are scalar (number / string / ident / bool / hex), or a 4-tuple `(N, N, N, N)` for WPF-Thickness `(top, right, bottom, left)` — used with `padding` and `margin`.

### Layout keywords

```
hstack | vstack | grid | ugrid | canvas | group | dock | wpf-grid
```

`hstack` ≡ stack-panel-horizontal, `vstack` ≡ stack-panel-vertical, `ugrid(C, R)` is a uniform C×R grid, `canvas` is absolute-positioning. `grid`/`group`/`dock`/`wpf-grid` are reserved but not yet specialised in the markup compiler — they fall back to canvas semantics.

### Element references

An element is a reference to a model entity (located by `$id` against `ai_ea/ai_ea.arch.yaml`), optionally given a layout, an attribute block, an `at` placement, and a body of children:

```
$<id>
$<id> <layout-kw>
$<id> [<attr-list>]
$<id> at <placement>
$<id> [<attrs>] <layout-kw>(<args>) { <body> }
```

Multiple `[...]` brackets merge — useful when attributes split across concerns (placement vs layout vs style):

```
$power-platform [width = 200] canvas {
    $business-agent [stretch = vertical]
    ...
}
```

### Layout block (for stacks etc. without an explicit ref)

```
hstack [v-align = stretch] {
    $on-premises
    $azure ugrid(4, 6) { ... }
}
```

### `at` placement — three forms

```
at (<col>, <row>)                                   // ugrid cell
at $<id>[.<anchor>]                                 // legacy single-anchor
at <axis> $<id>[.<anchor>] [anchor = <name>, distance = <N>]
   <axis> $<id>[.<anchor>] [anchor = <name>, distance = <N>]
```

Where `<axis>` is `horizontal` or `vertical` and the per-axis form may set one or both axes. See §7 for semantics.

### Connectors block

```
connectors {
    $<src>[.<anchor>] <op> $<dst>[.<anchor>] [<attrs>]
    ...
}
```

`<op>` is one of:

| Op       | Routing       | Default arrow | Notes                        |
|----------|---------------|---------------|------------------------------|
| `--`     | straight      | none          | Plain undirected line        |
| `-->`    | straight      | target        | Arrow on dst                 |
| `<--`    | straight      | source        | Arrow on src                 |
| `<-->`   | straight      | both          | Bidirectional                |
| `-\|`    | orthogonal-hv | none          | Horizontal then vertical (`─┐`) |
| `-\|>`   | orthogonal-hv | target        | HV with arrow at dst         |
| `<-\|`   | orthogonal-hv | source        | HV with arrow at src         |
| `<-\|>`  | orthogonal-hv | both          | HV bidirectional             |
| `\|-`    | orthogonal-vh | none          | Vertical then horizontal (`│─`) |
| `\|->`   | orthogonal-vh | target        | VH with arrow at dst         |
| `<\|-`   | orthogonal-vh | source        | VH with arrow at src         |
| `<\|->`  | orthogonal-vh | both          | VH bidirectional             |

Per-connector attributes are flat-forwarded to the connector's instance dict. Common ones: `relationship-type` (`interaction` / `enablement` / `hosting`), `routing`, `arrow-end`, `min-width`, `min-height`, `scenario`, `sequence`, `step`, `no-channel`. Anything unknown to the renderer is preserved for tooling. The arrow-bearing ortho ops are equivalent to writing `[arrow-end = target|source|both]` on top of the plain `-\|` / `\|-` op — pick whichever reads cleaner per connector.

---

## 3. Element types

Five composite element types plus connectors. All composites are styled via the visual library (`visual_libraries/Default/<type>.yaml`):

| Type             | Default layout     | Visual library file        | Typical use                                  |
|------------------|--------------------|----------------------------|----------------------------------------------|
| `location`       | `canvas` (composite) | `location.yaml`           | Top-level region (Azure, on-premises, m365)  |
| `building-block` | `canvas` (composite) | `building-block.yaml`     | Logical grouping inside a location           |
| `component`      | `canvas` (composite) | `component.yaml`          | Leaf component with icon + label             |
| `actor`          | `canvas` (composite) | `actor.yaml`              | External user / system / agent               |
| `connector`      | n/a                | `connector.yaml`          | Edge between two elements                    |

A composite's template (a `border` containing a `stack-panel` containing the title text and an `items-presenter`) is expanded by the markup compiler at build time. The author's `children:` block is injected into the `items-presenter` slot. See §9.

---

## 4. Properties on elements

All properties are set in `[...]` brackets in `.view` (or as keys in `.markup`). The markup compiler stores them on each layout-tree node's `declared` dict ([_build_layout_tree](../markup/markup_compiler/markup_compiler.py#L460)).

### Size

| Attribute     | `declared` key | Effect                                                  |
|---------------|----------------|---------------------------------------------------------|
| `width`       | `w`            | Authoritative width when set                            |
| `height`      | `h`            | Authoritative height when set                           |
| `min-width`   | `min-w`        | Floor on measured width (clamps the natural size up)    |
| `min-height`  | `min-h`        | Floor on measured height                                |
| `max-width`   | `max-w`        | Cap on measured width (clamps the natural size down)    |
| `max-height`  | `max-h`        | Cap on measured height                                  |

Min/max are applied to **measured** size only at the end of the `measure()` pass via `_clamp_measured`. If `min > max` for an axis, min wins (it acts as the floor).

### Position

| Attribute       | Where it applies                  | Effect                                                              |
|-----------------|-----------------------------------|---------------------------------------------------------------------|
| `x`, `y`        | `canvas` parent                   | Pin the child at literal pixel coordinates                          |
| `cell` `(c, r)` | `ugrid` parent                    | Place in cell (1-indexed: `at (col, row)`)                          |
| `colspan`       | `ugrid` child                     | Cell horizontal span (default 1)                                    |
| `rowspan`       | `ugrid` child                     | Cell vertical span (default 1)                                      |
| `at`            | any                               | Anchor-ref or cell — see §7                                         |

### Spacing

| Attribute  | Form                                  | Notes                                                  |
|------------|---------------------------------------|--------------------------------------------------------|
| `padding`  | `N`, `(top, right, bottom, left)`, or `{top: N, right: N, ...}` (.markup only) | Inner space for children. Expands the parent's bounds. |
| `margin`   | same                                                                          | Pushes the element away from siblings / target anchors.|

In `.view`, the tuple form `(20, 5, 5, 5)` is WPF-Thickness order — top, right, bottom, left — and lowers to the four-key dict at compile time. Single value (`5`) applies uniformly to all four sides. The dict form is `.markup` only; in `.view` use the tuple.

CLAUDE.md hard rule: `margin` shrinks visible bounds; `padding` is *only* metadata for inner space. Do not reach for "double margin" to explain a gap.

### Alignment & stretch

| Attribute   | Where                              | Values                                                                                    |
|-------------|------------------------------------|-------------------------------------------------------------------------------------------|
| `h-align`   | stack parent (cross-axis)          | `start`, `center`, `end`, `stretch`                                                       |
| `v-align`   | stack parent (cross-axis)          | `start`, `center`, `end`, `stretch`                                                       |
| `alignment` | `ugrid` child within its cell      | `center` (default), `start`, `end`, corner names                                          |
| `stretch`   | child of any layout                | `none` (default), `uniform`, `horizontal`, `vertical` — child fills the parent's main axis |

For `ugrid`, `alignment = right` puts the right-aligned child flush with the cell's right edge instead of centred. For stack-panels, an individual child with `[stretch = vertical]` claims an equal share of the stack's leftover height after fixed children.

---

## 5. Layout strategies

A parent's `layout` field decides how its children are positioned. Four strategies have measure/arrange specialisations. Composites (`location`, `building-block`, `component`, `actor`) wrap one of these via their template.

### `canvas` (default, also `absolute`, `root`)

Children placed at literal `x`, `y` (or 0, 0 if undeclared). Parent shrink-wraps to children's bounding box plus `padding`.

```
$azure canvas {
    $m365                          // implicit (0, 0) inside azure's content area
    $microsoft-agent-framework  at horizontal $m365.east [anchor = west]
                                vertical   $command-bus.south [anchor = north]
}
```

Anchor-ref children opt out of the flow; see §7.

### `vstack` (`stack-panel-vertical`)

Children stacked top-to-bottom. Cross-axis (X) is set by `h-align`. Pinned children (declared `y`) keep their offset and push the cursor for following flowed children.

```
$m365 vstack {
    hstack { $chat-surface  $platform-api }
    $power-platform canvas { ... }
}
```

### `hstack` (`stack-panel-horizontal`)

Mirror of vstack: left-to-right, cross-axis is Y. `v-align` on the stack picks the cross-axis alignment.

### `ugrid(C, R)`

Uniform-cell grid. Cell size = `max(child measured size)` across all children; `C × R` gives a lower bound on dimensions. Children declare `cell: (col, row)` (1-indexed) and may have `colspan`/`rowspan`. Empty cells take the same space as occupied ones. Smaller children sit centred (or per `alignment`) within their full-sized cell.

`ugrid` is **not** WPF Grid — there is no per-row / per-column sizing. WPF-style row/column-spec grids live under `grid` / `wpf-grid` (reserved, not yet implemented). Coordinates are 1-indexed.

`ugrid` is the only layout that participates in the connector-aware channel insertion phase (§8).

---

## 6. Two-pass layout algorithm

Implemented in [markup_compiler.py](../markup/markup_compiler/markup_compiler.py): `measure(node)` (bottom-up), `arrange(node, x, y, w, h)` (top-down), `_arrange_anchor_refs(tree, ...)` (axis-resolved), and `_normalize_canvas_overflow(tree)` (overflow → content offset).

### `measure(node)` — bottom-up

Each container computes its measured `(w, h)` from children's measured sizes plus its own `padding`. `canvas` containers use the bounding box of children (using arranged positions when available — this is what makes shrink-wrap interact with anchor-ref placement). Stack panels accumulate along the main axis; `ugrid` derives `cell_w / cell_h = max(child measured / span)`.

After computing, the result is clamped to `[min-w, max-w]` and `[min-h, max-h]` if declared.

### `arrange(node, x, y, w, h)` — top-down

Each container positions its children using its layout strategy. Composite elements (location et al.) treat their template root as fill-parent so the location's outer border rect spans the full declared bounds rather than shrink-wrapping to its title strip.

Anchor-ref children are skipped in this pass: their position depends on their target's arranged bbox, which may itself be an anchor-ref child. They are processed in `_arrange_anchor_refs` afterward.

### `_arrange_anchor_refs(tree, connector_constraints)` — per-axis

Two independent topological sorts — one for horizontal anchor-refs (each h-task depends on its target's h-task), one for vertical. Each axis-task computes `place_x` (or `place_y`) and writes it into the ref's `arranged` dict so downstream tasks can read it. After both passes complete, a final loop calls `arrange()` on each ref to materialise its subtree.

This decoupling lets `n.h → target.h` and `target.v → n.v` co-exist: an element-level cycle that's nevertheless acyclic per axis. See §7 for what the per-axis form looks like and why it matters.

### Iterative shrink-wrap

```
measure → arrange → arrange_anchor_refs                  // initial
loop (up to MAX_LAYOUT_ITERATIONS = 10):
    measure → normalize_canvas_overflow                  // re-measure; absorb overflow
    if no canvas grew and no overflow: break
    arrange → arrange_anchor_refs
```

Canvas measure uses anchor-resolved arranged positions, so anchor placement can grow a canvas; the iteration runs until sizes stabilise. `_normalize_canvas_overflow` shifts a canvas's flow children right/down by the amount its anchored siblings spilled left/up of the origin.

### Phase 2 — connector-aware (ugrid only)

After the layout fixed point, a separate phase detects orthogonal connectors that would cross non-endpoint components inside a `ugrid` and inserts channels (extra rows/columns). Each iteration re-runs measure / arrange / `_arrange_anchor_refs` against the updated channel list. See [05-connector-aware-layout.md](05-connector-aware-layout.md) for the channel algebra.

---

## 7. Anchor placement

Every placed element exposes 9 named anchors on its arranged bbox: `north`, `south`, `east`, `west`, the four diagonals, and `center`. See [03-anchors.md §What an anchor is](03-anchors.md#what-an-anchor-is) for the diagram and coordinates.

### Legacy single-anchor form

```
$x at $a                                 // x's centre on a's centre (default own = center)
$x at $a.east                            // x's centre on a's east
$x at $a.east [anchor = west]            // x's west on a's east — flush right of a
$x at $a.north-east [anchor = south-east] // x's south-east on a's north-east — above & flush right
```

Both axes resolve from the same target. The author may pin two different points (target_anchor and own_anchor) to control which corner/edge meets which.

### Per-axis form

Each axis can anchor independently:

```
$language-model at horizontal $microsoft-agent-framework.east [anchor = west]
                vertical   $microsoft-agent-framework.center [anchor = center]
```

`horizontal` and `vertical` may each appear at most once per element. Either axis may be omitted; the unanchored axis falls back to the parent's flow.

This form is essential whenever the source for the H position is a different element than the source for V, and whenever H and V form a per-axis-acyclic chain that's element-level cyclic. The resolver only checks for cycles within an axis (see §6).

### Margin and the auto-gap

By default the margin on each axis fills in the gap between r and target_anchor: when own_anchor names "east", `m.right` shifts r left (away from target); "west" → `m.left` shifts right; "north" → `m.top` shifts down; "south" → `m.bottom` shifts up. `center` produces no shift.

### `distance` — explicit per-axis gap

```
$language-model at horizontal $microsoft-agent-framework.east [anchor = west, distance = 50]
                vertical   $microsoft-agent-framework.center [anchor = center]
```

`distance = N` overrides the auto-margin gap on that axis with `N`. It only applies to directional anchors (`east`/`west` for h, `north`/`south` for v); on a `center` anchor it's a no-op (centring has no signed direction).

When `distance` is set on an axis, the connector min-gap constraint (§8) is also skipped on that axis — the author has expressed explicit intent.

### Cycle detection

Two independent topological sorts (one per axis). A cycle on either axis raises:

```
ValueError: anchor-ref cycle detected on horizontal axis. Unresolved: [...]
```

Element-level mutual references that are per-axis acyclic resolve cleanly.

### Composition with other layouts

Anchor-ref children opt out of their parent's flow. The parent's `canvas` shrink-wrap measure does include their arranged bbox (so the canvas grows to contain them); a `vstack` / `hstack` / `ugrid` parent does not include anchor-ref children in its main-axis flow.

---

## 8. Connectors

Connectors are an edge between two endpoints. They render as a polyline (straight or orthogonal) with optional arrowhead. Style and behaviour come from the connector style in `connector.yaml`, with triggers that switch dasharray / arrow-end based on `relationship-type`.

### Relationship types

| `relationship-type` | Default arrow | Default dash | Meaning                                       |
|---------------------|---------------|--------------|-----------------------------------------------|
| `interaction`       | target        | (solid)      | calls / event / consumes / available-through  |
| `enablement`        | target        | `6,3`        | enabled-by                                    |
| `hosting`           | none          | `2,2`        | hosted-by                                     |

The op (`-->` / `--` / `\|-` / `\|->` etc.) sets routing and arrow-end; `relationship-type` triggers may override `arrow-end` and `stroke-dasharray`.

### Min-gap constraints (`min-width` / `min-height`)

Defaults (in `connector.yaml`):

```yaml
setters:
  min-width: 50
  min-height: 50
```

The markup compiler builds a `(src, dst)` → `{min-w, min-h}` index from the markup's connector list at the start of `run_layout` ([_build_connector_constraints](../markup/markup_compiler/markup_compiler.py#L1393)). The index is undirected: `frozenset((src, dst))` is the key. Multiple connectors between the same pair contribute the strictest (max) min on each axis.

During `_arrange_anchor_refs`, when r is placed against a target via a directional anchor (east/west on h, north/south on v), the resolver checks the constraint:

- compute natural `place_x` (or `place_y`)
- if `|place − target.same-axis| < min`, push `place` outward in the natural direction to meet `min`
- skipped when `distance` is set on that axis (author wins)
- skipped for non-directional (`center`) anchors (centring intent wins)

A per-connector `[min-width = 0, min-height = 0]` opts a specific edge out of the auto-gap.

### Routing and arrows

| Op       | Routing         | Arrow default |
|----------|-----------------|---------------|
| `--`     | `straight`      | `none`        |
| `-->`    | `straight`      | `target`      |
| `<--`    | `straight`      | `source`      |
| `<-->`   | `straight`      | `both`        |
| `-\|`    | `orthogonal-hv` | `none`        |
| `-\|>`   | `orthogonal-hv` | `target`      |
| `<-\|`   | `orthogonal-hv` | `source`      |
| `<-\|>`  | `orthogonal-hv` | `both`        |
| `\|-`    | `orthogonal-vh` | `none`        |
| `\|->`   | `orthogonal-vh` | `target`      |
| `<\|-`   | `orthogonal-vh` | `source`      |
| `<\|->`  | `orthogonal-vh` | `both`        |

Author can override `routing` and `arrow-end` per connector. For orthogonal in a `ugrid`, see §6 (channel insertion) and [05-connector-aware-layout.md](05-connector-aware-layout.md).

### Per-connector attributes (selected)

```
$a --> $b [relationship-type = enablement]              // override default trigger
$a |- $b [no-channel]                                    // opt out of channel reservation
$a --> $b [scenario = conversational, step = 3]          // metadata for tooling
$a --> $b [min-width = 0]                                // disable auto-gap on this edge
```

Unknown attributes are preserved on the connector dict (the renderer ignores them; tooling can read them).

---

## 9. Visual library: styles, templates, bindings

The Default visual library (`visual_libraries/Default/`) defines a Style + ControlTemplate per composite type. The markup compiler merges Style setters into each instance via `apply_style` and expands the template inline at build time.

### Style file shape

```yaml
extends: base
properties:               # documentation only
  title: { type: string }
  ...

type: style
target: location

setters:
  corner-radius: 8
  stroke-width: 2
  margin: 5
  template:
    - border: ...

triggers:
  - when: { kind: nested }
    setters: { stroke-width: 1.5 }
```

`apply_style` merges `setters` into the instance, runs each trigger whose `when:` matches, and merges trigger setters on top. Author-set instance values override style setters (non-empty wins).

### Template grammar (inside `template:` setter)

A list of nested element specs. Each spec is a single key (the primitive type) mapped to its props:

```yaml
template:
  - border:
      rect: { x: 0, y: 0, width: $self.width, height: $self.height }
      stroke: $self.stroke-color
      padding: { left: 5, top: 5, right: 5, bottom: 5 }
      children:
        - stack-panel:
            orientation: vertical
            h-align: stretch
            children:
              - text: { content: $self.title, font-size: 14, ... }
              - border:
                  stretch: vertical
                  children:
                    - items-presenter:
                        layout: stack-panel-vertical
```

### `$self` / `$technology` bindings

Template properties may reference the instance via `$self.<prop>` or, for components, the resolved `$technology.<prop>` (icon, label). Bindings are resolved at template-expansion time (Stage 1) so text content is concrete by the time `measure()` runs.

### `items-presenter`

The slot that the markup-author's `children:` block fills. The compiler walks the template, finds the `items-presenter` node, and injects the parsed children there. The presenter's `layout:` controls how those children are arranged (typically `stack-panel-vertical` or `ugrid`).

### Connector style

Connectors don't have a layout-tree node — they live in a sibling list under the markup's `elements:`. `apply_style` is called on each connector both at constraint-build time (to read `min-width` / `min-height`) and at SVG emission (to read stroke / dasharray / arrow-end).

---

## 10. Cross-references

- Architecture model and connector type vocabulary: [modeling_engine/wiki/01-meta-model.md](../../modeling_engine/wiki/01-meta-model.md). Six modeling connector types (`calls`, `event`, `consumes`, `available-through`, `enabled-by`, `hosted-by`) collapse into the three visual `relationship-type` values listed in §8.
- Test corpus: `test_inputs/input6.view` is the most exercised example; `input5.view` is a simpler ugrid-only baseline.
- Visual target: [ai_ea/ai_ea_reference.svg](../../ai_ea/ai_ea_reference.svg) is the hand-drawn target the pipeline aims to reproduce.
- Project narrative and open threads: [hand-off-summary.md](../../hand-off-summary.md).
