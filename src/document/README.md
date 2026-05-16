# Mural — Library Documentation

Mural is a WPF-style retained-mode UI framework for TypeScript. It gives you a
property/binding system, a visual tree with layout + render lifecycle, brushes
and geometry, and a small control library — currently rendering through SVG,
with hooks for Canvas / WebGL / file output later.

This folder is the user-facing documentation for everything in [src/](../).
For the per-file code review (issues, improvements, design notes) see
[code-review.md](code-review.md). For the architectural design rationale see
[../../visual-engine-design.md](../../visual-engine-design.md).

## Layers

```
┌────────────────────────────────────────────────────────────────────────┐
│  Controls   (src/Controls/)                                             │
│  Concrete user-facing widgets: Border, TextBlock                        │
│                                                                         │
│       depends on ▼                                                      │
├────────────────────────────────────────────────────────────────────────┤
│  visual-engine (src/visual-engine/)                                     │
│  Brush / Pen / Geometry / Transform models, DrawingContext              │
│  augmentation, SvgDrawingContext, PresentationTarget hierarchy,         │
│  FontMetricsMeasurer, Google Fonts loader                                │
│                                                                         │
│       depends on ▼                                                      │
├────────────────────────────────────────────────────────────────────────┤
│  runtime     (src/runtime/)                                             │
│  Model, properties, bindings, Visual + tree (Single/Panel), layout      │
│  lifecycle, geometric primitives (Point/Size/Rect/Color/Matrix/         │
│  Thickness), TextMeasurer interface                                     │
└────────────────────────────────────────────────────────────────────────┘
```

Dependencies flow downward only. The split mirrors WPF's: `runtime` is the
WindowsBase analogue (DependencyObject layer), `visual-engine` is the
PresentationCore analogue (Visual + Drawing layer), `Controls` is the
PresentationFramework analogue (FrameworkElement-based controls).

## Documentation index

Start with whichever doc matches what you're trying to do.

- **[property-system.md](property-system.md)** — `Model`, `RegisterProperty`,
  bindings, value priority, listeners, read-only properties, attached
  / cross-class properties.
- **[visual-tree.md](visual-tree.md)** — `Visual`, `Single`, `Panel`,
  attaching / detaching children, the host back-pointer.
- **[layout.md](layout.md)** — `Measure` / `Arrange` / `Render` lifecycle,
  `MeasureOverride` / `ArrangeOverride` / `RenderOverride`, `Width` / `Height`
  / `MinWidth` / `MaxWidth` / `HorizontalAlignment` / `VerticalAlignment` /
  `Margin`, property inheritance.
- **[drawing.md](drawing.md)** — `DrawingContext`, brushes
  (`SolidColorBrush`, gradients, `ImageBrush`), `Pen`, `Geometry`,
  `Transform`, geometric primitives.
- **[targets.md](targets.md)** — `PresentationTarget` hierarchy
  (`HtmlTarget` / `FileTarget` / `HeadlessTarget`), `SvgDrawingContext`.
- **[text-measurement.md](text-measurement.md)** — `TextMeasurer` interface,
  `ApproximateTextMeasurer`, `FontMetricsMeasurer` (opentype.js),
  Google Fonts loader.
- **[controls.md](controls.md)** — `Border` and `TextBlock` reference.

## Five-line tour

```ts
import { Color, Thickness } from '../runtime/index.js';
import { HeadlessTarget, SolidColorBrush, SvgDrawingContext } from '../visual-engine/index.js';
import { Border, TextBlock } from '../Controls/index.js';

const text   = new TextBlock('Hello, Mural!');
text.FontSize = 24;
text.Foreground = new SolidColorBrush(Color.White);

const border = new Border(text);
border.Background      = new SolidColorBrush(Color.FromHex('#1e40af'));
border.BorderBrush     = new SolidColorBrush(Color.Black);
border.BorderThickness = new Thickness(3);
border.Padding         = new Thickness(20);

const target = new HeadlessTarget(400, 200, border);
const dc     = new SvgDrawingContext();
target.Render(dc);
console.log(dc.ToSvg(400, 200));
```

That's a complete scene: a 400×200 surface containing a centered TextBlock
inside a styled Border, rendered to a self-contained SVG string. The browser
flow is the same except the last three lines become a single `new HtmlTarget(host).Show(border)`
(once the renderer wiring lands).

## Running the demos

Three demos ship under [Controls/tests/](../Controls/tests/):

```bash
npm run demo:border    # 100×100 blue/black border on a 300×300 surface
npm run demo:text      # bold text inside a styled border (approximate metrics)
npm run demo:gfont     # Inter from Google Fonts (real per-glyph metrics)
```

Each writes an SVG to `src/Controls/tests/output/`. Open in a browser
to inspect the rendering.

## Running the tests

```bash
npm test          # 307 tests across runtime, visual-engine, Controls
npm run typecheck # tsc --noEmit
```

## Conventions

- **Naming.** Classes and public methods are `PascalCase`; private fields are
  `snake_case`; static read-only singletons are `PascalCase` (`Color.Black`,
  `Transform.Identity`). Property accessors mirror the property name.
- **Coordinate system.** Top-left origin, y-down, DIPs (device-independent
  pixels at 1/96"). Matches WPF and maps directly to SVG / Canvas.
- **Immutability.** Value types (`Point`, `Size`, `Rect`, `Color`, `Matrix`,
  `Thickness`) have `readonly` fields and no mutators — operations return
  new instances. Models are mutable through their property setters.
- **No `null`.** The library uses `undefined` consistently for absent values.
  Consumers shouldn't pass `null` where the type signature says `T | undefined`.
- **DIPs for sizes, code points for text.** `Array.from(text).length` is the
  glyph count used by the approximate measurer — surrogate pairs (emoji)
  count as one.

## What's stable vs. in-flight

**Stable** — has tests, used by demos, unlikely to change shape:
- Property/binding system (`runtime/`)
- `Visual` + `Single` + `Panel` tree, layout lifecycle
- Brush/Pen/Geometry/Transform models
- `SvgDrawingContext`
- `HeadlessTarget` (the headless render pipeline)
- `Border`, `TextBlock`
- `TextMeasurer` + `ApproximateTextMeasurer` + `FontMetricsMeasurer` + Google Fonts loader

**In flight** — works enough for the demos but the renderer integration is pending:
- `HtmlTarget` — DOM mount and resize tracking are live, painting is TODO
- `FileTarget` — scaffold only; `Save()` throws

**Not yet built** — referenced but deferred:
- `SvgRenderer` (the dirty-tracking real-time renderer for `HtmlTarget`)
- `CanvasRenderer`
- Layout panels beyond `Single` / `Panel` (StackPanel, Grid, etc.)
- Input event routing
