# Mural — Library Documentation

Mural is a WPF-style retained-mode UI framework for TypeScript. It gives you a
property/binding system, a visual tree with layout + render lifecycle, brushes
and geometry, a control library with templating + styling + data-binding +
virtualization, and rendering through SVG today (Canvas / WebGL / file output
to follow).

This folder is the user-facing documentation for everything in [src/](../).
For the per-file code review (issues, improvements, design notes) see
[code-review.md](code-review.md). For the architectural design rationale see
[../../visual-engine-design.md](../../visual-engine-design.md).

## Layers

```
┌────────────────────────────────────────────────────────────────────────┐
│  Controls   (src/Controls/)                                             │
│  Border, TextBlock, Canvas, ContentControl + ContentPresenter,          │
│  ItemsControl + ItemsPresenter + ItemContainerGenerator,                │
│  VirtualizingStackPanel, ScrollViewer, ControlTemplate, DataTemplate    │
│                                                                         │
│       depends on ▼                                                      │
├────────────────────────────────────────────────────────────────────────┤
│  visual-engine (src/visual-engine/)                                     │
│  Brush / Pen / Geometry / Transform models, DrawingContext              │
│  augmentation (DrawRectangle / DrawText / DrawGeometry / PushClip /     │
│  PushTransform), SvgDrawingContext, PresentationTarget hierarchy,       │
│  FontMetricsMeasurer, Google Fonts loader                                │
│                                                                         │
│       depends on ▼                                                      │
├────────────────────────────────────────────────────────────────────────┤
│  runtime     (src/runtime/)                                             │
│  Model, properties, bindings + DynamicResource, Visual + tree with      │
│  visual/logical split, layout lifecycle, geometric primitives, Style    │
│  + Setter + PropertyTrigger, ResourceDictionary + NameScope,            │
│  ObservableCollection, IScrollInfo, TextMeasurer interface              │
└────────────────────────────────────────────────────────────────────────┘
```

Dependencies flow downward only. The split mirrors WPF's: `runtime` is the
WindowsBase analogue (DependencyObject layer), `visual-engine` is the
PresentationCore analogue (Visual + Drawing layer), `Controls` is the
PresentationFramework analogue (FrameworkElement-based controls).

## Documentation index

Start with whichever doc matches what you're trying to do.

### Foundations
- **[property-system.md](property-system.md)** — `Model`, `RegisterProperty`,
  bindings, value priority (`Coerced > Animated > Binding > Local > Trigger
  > Style > Inherited > Default`), listeners, read-only properties, attached
  / cross-class properties.
- **[visual-tree.md](visual-tree.md)** — `Visual`, `Single`, `Panel`, the
  visual vs logical tree split, attaching / detaching children, the host
  back-pointer, `TemplatedParent`, `Name` / `FindName`, `Clip`.
- **[layout.md](layout.md)** — `Measure` / `Arrange` / `Render` lifecycle,
  `MeasureOverride` / `ArrangeOverride` / `RenderOverride`, `Width` / `Height`
  / `MinWidth` / `MaxWidth` / `HorizontalAlignment` / `VerticalAlignment` /
  `Margin`, property inheritance, invalidation cascade.
- **[drawing.md](drawing.md)** — `DrawingContext` (`DrawRectangle` /
  `DrawGeometry` / `DrawText` / `PushTransform` / `PushClip` / `Pop`),
  brushes (`SolidColorBrush`, gradients, `ImageBrush`), `Pen`, `Geometry`,
  `Transform`, geometric primitives.
- **[targets.md](targets.md)** — `PresentationTarget` hierarchy
  (`HtmlTarget` / `FileTarget` / `HeadlessTarget`), `SvgDrawingContext`.
- **[text-measurement.md](text-measurement.md)** — `TextMeasurer` interface,
  `ApproximateTextMeasurer`, `FontMetricsMeasurer` (opentype.js),
  Google Fonts loader.

### Application architecture
- **[resources.md](resources.md)** — `ResourceDictionary`,
  `Visual.Resources`, `TryFindResource` / `FindResource`,
  `MergedDictionaries`, change notifications, `DynamicResource`.
- **[styles.md](styles.md)** — `Style` + `Setter` + `BasedOn`,
  `TargetType` validation, sealing, explicit vs implicit style,
  `Setter.value` as `Binding` / `DynamicResource` via `SetterFactory`,
  `PropertyTrigger`, `Style.Resources`.
- **[templating.md](templating.md)** — `ControlTemplate`,
  `ContentControl` + `ContentPresenter`, `TemplateBinding`,
  `TemplatedParent`, per-template `NameScope` + `GetTemplateChild`,
  template-internal inheritance.
- **[items-and-scrolling.md](items-and-scrolling.md)** —
  `ObservableCollection`, `DataTemplate`, `ItemsControl` +
  `ItemsPresenter` + `ItemContainerGenerator`, `VirtualizingPanel` +
  `VirtualizingStackPanel`, `IScrollInfo`, `ScrollViewer`.
- **[controls.md](controls.md)** — concrete-control reference:
  `Border`, `TextBlock`, `Canvas`, `ContentControl`, `ItemsControl`,
  `ScrollViewer`, etc.
- **[grid.md](grid.md)** — `Grid` panel: pixel / auto / star track
  sizing, `Grid.Row` / `Column` / `RowSpan` / `ColumnSpan` attached
  properties, four-pass measure / prefix-sum arrange.
- **[behaviors.md](behaviors.md)** — `Behavior` abstract base,
  `Visual.AddBehavior`, markup `Behaviors { … }` block, the
  `ListReorderBehavior` reference behavior.

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
npm run ge             # a small graph viz on a 1600×1200 canvas
```

Each writes an SVG to `src/Controls/tests/output/` (or to the working
directory for `ge`). Open in a browser to inspect the rendering.

## Running the tests

```bash
npm test          # ~470 tests across runtime, visual-engine, Controls
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
- Property/binding system (`runtime/`), including the full value-priority
  ladder with Style/Trigger tiers and `Visual.Style` apply machinery
- `Visual` + `Single` + `Panel` tree, visual/logical split, layout lifecycle
  with invalidation cascade
- Brush/Pen/Geometry/Transform models
- `SvgDrawingContext` including `DrawGeometry` + `PushClip`
- `HeadlessTarget` (the headless render pipeline)
- `Border`, `TextBlock`, `Canvas` (with `Left` / `Top` attached properties)
- `ContentControl` + `ContentPresenter` + `ControlTemplate` + `TemplateBinding`,
  per-template `NameScope`, implicit style lookup
- `ItemsControl` + `ItemsPresenter` + `ItemContainerGenerator` +
  `DataTemplate`, `ObservableCollection` with incremental change dispatch
- `VirtualizingStackPanel` with `IScrollInfo`, `ScrollViewer`
  (clip-and-translate and delegate modes)
- `TextMeasurer` + `ApproximateTextMeasurer` + `FontMetricsMeasurer` + Google Fonts loader

**In flight** — works enough for the demos but the renderer integration is pending:
- `HtmlTarget` — DOM mount and resize tracking are live, painting is TODO
- `FileTarget` — scaffold only; `Save()` throws

**Not yet built** — referenced but deferred:
- `SvgRenderer` (the dirty-tracking real-time renderer for `HtmlTarget`)
- `CanvasRenderer`
- Layout panels beyond `Canvas` / `Single` / abstract `Panel` (StackPanel,
  Grid, WrapPanel, etc.)
- Input event routing (no mouse / keyboard / wheel today; `ScrollViewer`
  offsets are programmatic-only)
- Animation system (no `EventTrigger`, no smooth-scroll, no Storyboard)
- Concrete `ScrollBar` visual control
- `DataTrigger` (a `PropertyTrigger`-equivalent driven by a `Binding`)
- `MultiTrigger` (AND of multiple conditions)
- Container recycling across items in virtualizing panels
- Variable item heights in `VirtualizingStackPanel`
- Horizontal-orientation virtualization
- Walking visual descendants for `IScrollInfo` (ScrollViewer requires
  Content to be the IScrollInfo provider directly)
</content>
