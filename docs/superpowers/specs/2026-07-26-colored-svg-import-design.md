# Colored SVG Import Design

**Goal:** Let the `.mu` `include` directive import an SVG as faithful
multi-color art (each shape keeps its own fill/stroke), in addition to the
existing monochrome geometry import.

**Status:** ✅ Finished (Design approved 2026-07-26)

## Background

Mural has two SVG-import paths:

1. **Runtime** — `parseSvgIcon(svgText)` → `IconDefinition` → the `Icon`
   control. `IconDefinition` already carries per-shape `Fill` / `Stroke` /
   `StrokeWidth`, and `Icon` renders them in color when `Recolor=false`
   ([icon.ts:190-198](../../../src/basic/icon.ts)). Color already works here.

2. **Build-time `include`** — `.mu` `include "icons/home.svg"` →
   [`svgToGeometryJs`](../../../src/tooling/svg-geometry.ts) emits **one bare
   `Geometry`** (a `GeometryGroup` when the file has more than one shape),
   with paint deliberately dropped. The consumer supplies the brush:
   `Shape [ Geometry = @home, Fill = <brush> ]`. This path is monochrome.

The `parseSvgIcon` parser already fully extracts every shape's concrete
`Fill` / `Stroke` / `StrokeWidth` — it is only the build-time **serializer**
that discards them. So the whole feature is: teach the serializer and the
`include` directive to preserve color, reusing the existing `IconDefinition`
value type and `Icon` control.

## Design principles (locked during brainstorming)

- **No new runtime classes.** `IconDefinition` is already "a group of
  colored shapes" (a drawing group by another name); `Icon` already renders
  it in color. Reuse both. No `DrawingImage` / `DrawingGroup` / `Drawing`
  types are introduced.
- **Explicit parameter, not content auto-detection.** The author states
  colored-vs-monochrome per include. Monochrome stays the default so every
  existing `include` is byte-for-byte unchanged.
- **Faithful color.** Colored import bakes literal SVG colors. The
  `currentColor` sentinel (unspecified fill, or explicit `currentColor`)
  resolves to **black** — the SVG default paint — so the art still renders
  without any theme wiring. No `Foreground` / theming indirection in
  colored mode.

## Surface syntax

Leading keyword modifier on the existing directive. Grammar becomes:

```
include [colored] "<path>" [as <key>]
```

```
include "icons/home.svg"                  // monochrome (unchanged) → Geometry
include colored "art/logo.svg" as logo    // colored → IconDefinition
include colored "art/*.svg"               // glob: each match → IconDefinition
```

Consumed through the existing control:

```
Icon [ Source = @logo, Recolor = false ]
```

`Recolor=false` makes the existing renderer honor authored colors. Because
`currentColor` was baked to black at import, no `Foreground` substitution
occurs; `Recolor=false` is the only knob the author needs.

## Components

### 1. Serializer — `src/tooling/svg-geometry.ts`

`svgToGeometryJs(svgText)` is **unchanged** (monochrome path).

Add a new entry point:

```ts
export interface DrawingResourceJs
{
    /** JS expression constructing the IconDefinition (bare type names). */
    valueJs: string;
    /** Named imports the expression references, grouped by module. */
    imports: ReadonlyArray<{ module: string; names: readonly string[] }>;
}

export function svgToIconJs(svgText: string): DrawingResourceJs
```

Implementation:

- `const def = parseSvgIcon(svgText);` — reuses the existing parser, which
  already yields `def.ViewBoxWidth`, `def.ViewBoxHeight`, and per-shape
  `Fill` / `Stroke` / `StrokeWidth`.
- For each `IconShape`, emit an object literal satisfying the `IconShape`
  interface:
  ```
  { Geometry: <emitGeometry(shape.Geometry)>, Fill: <paint(shape.Fill)>, Stroke: <paint(shape.Stroke)>, StrokeWidth: <n(shape.StrokeWidth)> }
  ```
  `emitGeometry` / `emitFigure` / `emitSegment` / `n` are the **existing
  shared helpers** (already collect geometry type names into a `used` set).
- Wrap: `new IconDefinition(<n(vbW)>, <n(vbH)>, [ <shape>, <shape>, … ])`.
- `paint(p: IconPaint)` → JS expression:
  - `Color` → `new Color(R, G, B, A)` (uniform emit; `Color` exposes public
    `R/G/B/A`). Adds `Color` to the visual-engine name set.
  - `CURRENT_COLOR` sentinel → `new Color(0, 0, 0, 255)` (faithful SVG
    default). Also adds `Color`.
  - `undefined` (SVG `fill="none"`) → `undefined` (no import).
- Assemble `imports`:
  - `@pragmatic-lab/mural/basic` → `['IconDefinition']`.
  - `@pragmatic-lab/mural/visual-engine` → the geometry names collected by
    `emitGeometry` plus `Color` (if any paint emitted one), sorted.

`Color` has public readonly `R/G/B/A` and a `(R,G,B,A=255)` constructor
([primitives.ts:212-219](../../../src/visual-engine/primitives.ts)).
`IconDefinition` is exported from the `basic` barrel
([basic/index.ts:49](../../../src/basic/index.ts)).

### 2. Include resolver — `src/tooling/include-resolver.ts`

- The resolver callback's `ctx` gains `colored: boolean`.
- Per matched `.svg` file, dispatch on `ctx.colored`:
  - `true`  → `svgToIconJs(text)` → its multi-module `imports`.
  - `false` → `svgToGeometryJs(text)` → single visual-engine import (as today).
- Merge all matches' imports by module (accumulate `names` into a
  `Map<module, Set<string>>`, emit sorted). The existing code already
  accumulates a single visual-engine name set; generalize it to a per-module
  map so colored entries contribute their `basic` names too.

### 3. Compiler — `src/compiler/compiler.ts`

- `IncludeResolver` type:
  ```ts
  export type IncludeResolver = (
      path: string,
      ctx: { key: string | undefined; colored: boolean },
  ) => IncludeResolution;
  ```
- `compileInclude` passes `{ key: form.key, colored: form.colored }`.
  `IncludeResolution` already supports multi-module `imports`, and
  `addModuleImports` is already called per `imp` — no other change needed.

### 4. AST — `src/compiler/ast.ts`

`IncludeForm` gains `colored: boolean`.

### 5. Parser — `src/compiler/parser.ts`

`parseIncludeForm` reads an optional leading `colored` ident between the
`include` keyword and the path string:

```
include            -> expectIdent('include')
[colored]          -> if peek is Ident 'colored', consume; colored = true
"<path>"           -> expect String
[as <key>]         -> unchanged
```

Default `colored = false`. `colored` is a soft keyword (only significant
immediately after `include`), so it does not collide with any element or
property named `colored` elsewhere.

## Data flow

```
.mu:  include colored "art/logo.svg" as logo
  │
  parser  → IncludeForm { path, key:'logo', colored:true }
  │
  compiler.compileInclude → resolver(path, { key:'logo', colored:true })
  │
  include-resolver → svgToIconJs(readFileSync(path))
  │                     └─ parseSvgIcon → per-shape {Geometry, Fill, Stroke, StrokeWidth}
  │
  DrawingResourceJs { valueJs: "new IconDefinition(24,24,[ {Geometry:…, Fill:new Color(…)}, … ])",
                      imports: [ {basic:[IconDefinition]}, {visual-engine:[Color, PathGeometry, …]} ] }
  │
  compiler emits:  rd.Set("logo", new IconDefinition(24,24,[ … ]));   + the imports
  │
  .mu:  Icon [ Source = @logo, Recolor = false ]   → faithful multi-color render
```

## Error handling

- Unsupported geometry / segment types: `emitGeometry` / `emitSegment`
  already `throw` — unchanged, shared by both paths.
- `include colored` with a glob + `as`: the existing single-resource `as`
  guard in `compileInclude` still applies (colored changes the value type,
  not the key cardinality).
- Non-`.svg` colored include: the resolver's existing "only .svg is handled"
  error path is unchanged (dispatch on `colored` happens only after the
  `.svg` extension check).

## Testing

- **`src/tooling/tests/svg-geometry.test.ts`**
  - `svgToIconJs`: multi-shape colored SVG → `new IconDefinition(...)` whose
    shapes carry `new Color(r,g,b,a)` matching the source fills.
  - imports grouped by module: `IconDefinition` under `.../basic`, `Color`
    + geometry names under `.../visual-engine`.
  - `fill="none"` → `Fill: undefined`; unspecified / `currentColor` →
    `new Color(0, 0, 0, 255)`.
  - emitted expression is valid JS (parse via `new Function` with the
    referenced names stubbed, mirroring the existing monochrome test).
  - monochrome `svgToGeometryJs` output is unchanged (regression guard).
- **`src/compiler/tests/` (parser)**
  - `include colored "x.svg" as k` → `IncludeForm.colored === true`.
  - bare `include "x.svg"` → `colored === false`.
- **`src/compiler/tests/include.test.ts`**
  - compiling `include colored "logo.svg"` with a stub resolver emits
    `rd.Set("logo", new IconDefinition(...))` and adds the `IconDefinition`
    import from `@pragmatic-lab/mural/basic`.
- **`src/basic/tests/icon.test.ts`**
  - one assertion: an `Icon` with a colored `IconDefinition` and
    `Recolor=false` paints distinct per-shape brushes (captured via the
    existing headless drawing-context spy pattern).

All test files live in a `tests/` subfolder next to the code they exercise,
per the Mural testing convention.

## Out of scope

- Gradients, filters, masks, `<text>`, `<defs>`/`<use>` — still unsupported
  by `parseSvgIcon`; colored import inherits the same subset.
- Per-instance recoloring of a colored import (it is faithful by design; use
  the monochrome path for themeable icons).
- Any change to the runtime `Icon` render loop — it already handles
  concrete-color shapes.
