# Controls

The user-facing widgets — `Border`, `TextBlock`, layout panels
(`Canvas`), content / item hosts (`ContentControl`, `ItemsControl`),
scrolling (`ScrollViewer`, `VirtualizingStackPanel`), and the
templating primitives that knit them together (`ControlTemplate`,
`ContentPresenter`, `ItemsPresenter`, `DataTemplate`).

**Implemented in:**
- [Controls/border.ts](../Controls/border.ts) — `Border`
- [Controls/text-block.ts](../Controls/text-block.ts) — `TextBlock`
- [Controls/canvas.ts](../Controls/canvas.ts) — `Canvas` + `Left` /
  `Top` attached properties
- [Controls/content-control.ts](../Controls/content-control.ts) —
  `ContentControl`
- [Controls/content-presenter.ts](../Controls/content-presenter.ts) —
  `ContentPresenter`
- [Controls/control-template.ts](../Controls/control-template.ts) —
  `ControlTemplate`, `TemplateBinding`
- [Controls/data-template.ts](../Controls/data-template.ts) —
  `DataTemplate`
- [Controls/items-control.ts](../Controls/items-control.ts) —
  `ItemsControl`
- [Controls/items-presenter.ts](../Controls/items-presenter.ts) —
  `ItemsPresenter`
- [Controls/item-container-generator.ts](../Controls/item-container-generator.ts) —
  `ItemContainerGenerator`
- [Controls/virtualizing-panel.ts](../Controls/virtualizing-panel.ts) —
  `VirtualizingPanel` (abstract)
- [Controls/virtualizing-stack-panel.ts](../Controls/virtualizing-stack-panel.ts) —
  `VirtualizingStackPanel`
- [Controls/scroll-viewer.ts](../Controls/scroll-viewer.ts) —
  `ScrollViewer`

See [layout.md](layout.md) for the underlying `Visual` properties every
control inherits (Width / Margin / alignment), [drawing.md](drawing.md) for
the Brush / Pen / Color types these controls accept,
[templating.md](templating.md) for the deep dive on `ContentControl` /
`ControlTemplate`, [items-and-scrolling.md](items-and-scrolling.md) for
`ItemsControl` and friends.

## `Border`

A `Single` (one-child container) that paints a background, optionally
strokes an outline, and pads its child inward. Modeled on WPF
`System.Windows.Controls.Border` — the canonical "first useful container".

### Properties

| Property | Type | Default | MetaData |
|---|---|---|---|
| `Background` | `Brush \| undefined` | `undefined` | Render |
| `BorderBrush` | `Brush \| undefined` | `undefined` | Render |
| `BorderThickness` | `Thickness` | `Thickness.Zero` | Measure \| Arrange \| Render |
| `Padding` | `Thickness` | `Thickness.Zero` | Measure \| Arrange |
| `CornerRadius` | `number` | `0` | Render |

Plus everything from `Visual`: `Width` / `Height` / `MinWidth` / `MaxWidth` /
`MinHeight` / `MaxHeight`, `HorizontalAlignment` / `VerticalAlignment`,
`Margin`.

### Constructor

```ts
new Border(child?: Visual)
```

The optional child is wired via `SetChild` (inherited from `Single`).
Equivalent to `const b = new Border(); b.SetChild(child);`.

### Layout

`Border.MeasureOverride`:
1. Shrinks the child's available size by `(BorderThickness + Padding)` on
   each axis (clamped to 0 — never negative).
2. Measures the child against that reduced size.
3. Returns `child.DesiredSize + insets`.

`Border.ArrangeOverride`:
1. Positions the child at `(BorderThickness.Left + Padding.Left,
   BorderThickness.Top + Padding.Top)`.
2. Sizes the child to `finalSize - insets` (clamped to 0).

The child receives a layout rect inset from the Border's edge by border +
padding on each side. Border + Padding compose additively.

### Rendering

`Border.RenderOverride`:
1. Fills the entire Border rect with `Background` (if set).
2. Draws a stroked rect inset by half the thickness so the stroke sits
   inside the layout rect.

```ts
const b = new Border();
b.Background      = new SolidColorBrush(Color.White);
b.BorderBrush     = new SolidColorBrush(Color.Black);
b.BorderThickness = new Thickness(2);
// Renders: white fill at (0, 0, w, h), then 2px black stroke at (1, 1, w-2, h-2)
```

### Limitations

- **Non-uniform border thickness** is rendered as uniform using
  `BorderThickness.Top`. Per-side strokes need a custom path geometry
  (deferred).
- **CornerRadius** is registered but not yet honored — `DrawingContext`
  doesn't have a `DrawRoundedRectangle` helper yet. Setting CornerRadius
  fires render invalidation but produces no visual effect.

### Usage

**Solid background + uniform stroke**:
```ts
const card = new Border(content);
card.Background      = new SolidColorBrush(Color.FromHex('#1e40af'));
card.BorderBrush     = new SolidColorBrush(Color.Black);
card.BorderThickness = new Thickness(3);
card.Padding         = new Thickness(20);
```

**Just padding** (no background, no stroke):
```ts
const inset = new Border(content);
inset.Padding = new Thickness(10);
```

**Asymmetric padding** (typical for UI rows):
```ts
const row = new Border(label);
row.Padding = new Thickness(12, 4, 12, 4);   // L T R B — 12 horizontal, 4 vertical
```

**Border without a child** (a colored rectangle):
```ts
const rect = new Border();
rect.Background = new SolidColorBrush(Color.Red);
rect.Width = 100;
rect.Height = 50;
```

### Composition with alignment

Border passes through alignment to the underlying Visual machinery. To
position the Border within its own parent slot, use Border's own
HorizontalAlignment / VerticalAlignment / Margin properties — the child
inside the Border is laid out by Border itself, but Border-as-a-child is
laid out by its parent.

```ts
const card = new Border();
card.Width  = 200;
card.Height = 100;
card.HorizontalAlignment = HorizontalAlignment.Center;   // center the card in its parent slot
card.VerticalAlignment   = VerticalAlignment.Top;
card.Margin              = new Thickness(20);            // 20px gap from parent edges
```

---

## `TextBlock`

A leaf `Visual` that renders a single run of text. The simplest visible
control — exercises text measurement (`MeasureOverride` via the host's
`TextMeasurer`), drawing (`RenderOverride` via `dc.DrawText`), and property
inheritance for font properties.

### Properties

| Property | Type | Default | MetaData |
|---|---|---|---|
| `Text` | `string` | `''` | Measure |
| `FontFamily` | `string` | `'system-ui, sans-serif'` | Measure \| Inherits |
| `FontSize` | `number` | `14` | Measure \| Inherits |
| `FontWeight` | `FontWeight` | `Normal` | Measure \| Inherits |
| `FontStyle` | `FontStyle` | `Normal` | Measure \| Inherits |
| `Foreground` | `Brush \| undefined` | `undefined` (→ black) | Render \| Inherits |

Plus all `Visual` layout properties.

### Constructor

```ts
new TextBlock(text?: string)
```

The optional text is assigned to `Text`. Equivalent to `const t = new TextBlock(); t.Text = text;`.

### Layout

`TextBlock.MeasureOverride`:
1. Returns `Size.Zero` when `Text` is empty.
2. Otherwise calls `this.target?.TextMeasurer.Measure(...)` — the host's
   text measurer. Falls back to `APPROXIMATE_TEXT_MEASURER` when the
   TextBlock isn't attached to a host (e.g., measured in isolation in
   a test).
3. Caches the returned `TextMetrics` internally so RenderOverride can use
   the real `Ascent` for SVG baseline placement.

### Rendering

`TextBlock.RenderOverride`:
1. Skips entirely when `Text` is empty.
2. Builds a `FormattedText` from the current font properties + cached
   metrics + Foreground.
3. Calls `dc.DrawText(formatted, Point.Zero)` — origin (0, 0) in local
   coordinates. Alignment and arranged offset are applied by `Visual.Arrange`
   and the host's tree walk.

### Font property inheritance

All five font properties are flagged `MetaData.Inherits`. An ancestor can
set them once and every TextBlock in the subtree picks them up via the
cross-class explicit-owner overload + composite-key storage.

```ts
const inner = new TextBlock('Inherits font from outer');
const outer = new Border(inner);

// outer is a Border, not a TextBlock. But TextBlock.FontSize is registered
// with MetaData.Inherits — setting it on outer via the explicit-owner
// accessor stores it under composite key 'TextBlock.FontSize' on outer.
// Inheritance walks up from inner, finds it, caches as InheritedValue.
outer.set_property_value(TextBlock, 'FontSize', 24);

inner.FontSize;                              // 24
inner.GetValueSource('FontSize');            // PropertyValueSource.InheritedValue

// Local override on the child shadows the inherited value:
inner.FontSize = 11;
inner.GetValueSource('FontSize');            // PropertyValueSource.LocalValue
```

This matches the WPF "TextElement.FontSize on a Window cascades to every
TextBlock inside" pattern.

### Foreground default

`Foreground = undefined` lets the renderer fall back to its default
(black in `SvgDrawingContext`). Set explicitly for any color:

```ts
text.Foreground = new SolidColorBrush(Color.White);
```

### Font weight / style enums

```ts
import { FontWeight, FontStyle } from '../visual-engine/index.js';

FontWeight.Normal     // 'normal'
FontWeight.Bold       // 'bold'

FontStyle.Normal      // 'normal'
FontStyle.Italic      // 'italic'
```

Numeric weights (100–900) and additional styles (oblique, condensed)
aren't supported yet — the enum keeps the WPF set tight.

### Measurement accuracy

By default, TextBlock uses the approximate measurer that ships with the
runtime (`glyphCount × fontSize × 0.6`). For accurate widths and baseline,
install a `FontMetricsMeasurer` on the target:

```ts
import { FontMetricsMeasurer, loadGoogleFontInto } from '../visual-engine/index.js';

target.TextMeasurer = new FontMetricsMeasurer();
await loadGoogleFontInto(target.TextMeasurer, 'Inter', { weights: [400, 700] });

text.FontFamily = 'Inter, sans-serif';     // now measured with real Inter metrics
```

See [text-measurement.md](text-measurement.md) for the full text-measurement story.

### Usage

**Simple label**:
```ts
const label = new TextBlock('Submit');
```

**Styled heading**:
```ts
const h1 = new TextBlock('Welcome');
h1.FontSize = 32;
h1.FontWeight = FontWeight.Bold;
h1.Foreground = new SolidColorBrush(Color.FromHex('#1e40af'));
```

**Italic emphasis**:
```ts
const em = new TextBlock('Important');
em.FontStyle = FontStyle.Italic;
```

**Inside a Border with centered alignment**:
```ts
const text = new TextBlock('Hello, Mural!');
text.HorizontalAlignment = HorizontalAlignment.Center;
text.VerticalAlignment   = VerticalAlignment.Center;

const card = new Border(text);
card.Background      = new SolidColorBrush(Color.White);
card.BorderBrush     = new SolidColorBrush(Color.Black);
card.BorderThickness = new Thickness(1);
card.Padding         = new Thickness(16);
```

### Limitations

- **Single line only** — no `TextWrapping`, no automatic line breaks. Multi-line
  text needs a future TextWrapping property and shaper integration.
- **No text alignment within the block** — `HorizontalAlignment` /
  `VerticalAlignment` position the *whole block* within its parent slot.
  Text-within-block alignment (like CSS `text-align: center`) would be a
  separate property (`TextAlignment`) once we have a measurer that can
  return line breaks.
- **No selection or caret** — pure display today.

---

## Combining controls — the demos

The three demo scripts under [Controls/tests/](../Controls/tests/) show
the controls in action:

- **[border-render.ts](../Controls/tests/border-render.ts)** (`npm run demo:border`) —
  100×100 Border with blue background, 3px black stroke, centered in a 300×300 target.

- **[text-render.ts](../Controls/tests/text-render.ts)** (`npm run demo:text`) —
  Bold "Hello, Mural!" TextBlock inside a styled Border, with approximate
  text metrics.

- **[google-font-render.ts](../Controls/tests/google-font-render.ts)** (`npm run demo:gfont`) —
  Same scene as text-render.ts but with Inter fetched live from Google Fonts
  and a `FontMetricsMeasurer` installed, so the text width and baseline are
  the real Inter metrics.

Each demo writes an SVG to `Controls/tests/output/`. Open in a browser to
inspect.

---

## `Canvas`

A `Panel` that places children at absolute (x, y) coordinates read from
`Canvas.Left` / `Canvas.Top` attached properties. WPF-parity Canvas.
Sizes itself to the union bounding box of all placed children — paired
with `HeadlessTarget`'s auto-mode, the surface fits the contents.

```ts
import { Canvas } from '../Controls/index.js';

const c = new Canvas();
const child = new Border();
Canvas.SetLeft(child, 20);
Canvas.SetTop(child, 30);
c.AddChild(child);
```

`Left` / `Top` are registered with `MetaData.None` — changing them on a
child doesn't auto-invalidate; the Canvas re-reads on its next Arrange
pass. With `HeadlessTarget`'s always-fresh measure/arrange this works
for the static-experiment flow. Incremental layout (when SvgRenderer
lands) will need the Canvas to subscribe to its children's Left/Top.

Used by the `ge` graph viz framework — see
[../applications/ge/scene.ts](../applications/ge/scene.ts).

## `ContentControl`

Templated single-content host. See the full story in
[templating.md](templating.md). API summary:

```ts
const cc = new ContentControl();
cc.Template = someControlTemplate;     // ControlTemplate with a ContentPresenter
cc.Content  = anyVisual;               // logical child; visually slotted into the presenter
cc.GetTemplateChild('PART_X');         // look up by name within the applied template
```

Re-templating preserves Content; setting Template = undefined detaches
the template.

## `ItemsControl`

Data-driven collection display. See [items-and-scrolling.md](items-and-scrolling.md).
API summary:

```ts
const ic = new ItemsControl();
ic.ItemsPanel   = () => new Canvas();
ic.ItemTemplate = new DataTemplate(d => new TextBlock(`${d}`));
ic.Items        = ['a', 'b', 'c'];     // or an ObservableCollection
ic.Template     = wrappingTemplate;    // optional ControlTemplate with an ItemsPresenter
ic.Generator;                          // ItemContainerGenerator — item ↔ container mapping
```

Mutations on an ObservableCollection dispatch incrementally — adding
one item splices in one container, not a full rebuild.

## `ScrollViewer`

A scrolling viewport. See [items-and-scrolling.md §9](items-and-scrolling.md#9-scrollviewer).
Two modes (auto-detected):
- **Delegate** — Content implements `IScrollInfo` (typically a
  `VirtualizingStackPanel`). ScrollViewer drives the panel's
  viewport.
- **Clip-and-translate** — anything else. Measures with Infinity,
  arranges at `(-offset)`, clips to viewport.

```ts
const sv = new ScrollViewer();
sv.Content = someContent;
sv.VerticalOffset = 200;        // programmatic only — no input events yet
sv.ScrollToBottom();
```

## `VirtualizingStackPanel`

Vertical stack with uniform item height that only realizes containers
inside the Viewport. See [items-and-scrolling.md §7](items-and-scrolling.md#7-virtualization).

Properties: `Viewport: Rect`, `ItemHeight: number`. Realizes via
`owner.Generator.Realize`; recycles via `Recycle`. Implements
`IScrollInfo` so a wrapping `ScrollViewer` delegates to it
automatically.

## What's still coming

These are the natural next controls:

- **`Rectangle`** / **`Ellipse`** — shape primitives that wrap a Geometry.
- **`StackPanel`** — vertical or horizontal stack layout (non-virtualizing).
- **`Grid`** — row/column layout with proportional sizing.
- **`Image`** — wraps an `ImageBrush`.
- **`Button`** — interactive (needs event routing first).
- **`ScrollBar`** — visual control bound to `ScrollViewer.HorizontalOffset` /
  `VerticalOffset` / `ScrollableWidth` / `ScrollableHeight`.

The framework primitives are in place — adding any of these is overriding
`MeasureOverride` / `ArrangeOverride` / `RenderOverride` and registering
properties. See [visual-tree.md](visual-tree.md) §7 for the "implementing
a new container" pattern and [layout.md](layout.md) §10 for a complete
custom-container example.
