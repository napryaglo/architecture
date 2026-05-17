# Items, Data-Binding, Virtualization, Scrolling

Data-driven UI: a collection of items (data, not visuals) drives a
collection of visuals (containers, produced by a `DataTemplate`).
Scrolling and virtualization layer on top so large collections render
without paying for every off-screen item.

**Implemented in:**
- [runtime/observable-collection.ts](../runtime/observable-collection.ts) —
  `ObservableCollection<T>`, `CollectionChange<T>`,
  `IReadOnlyObservableCollection<T>`
- [runtime/scroll-info.ts](../runtime/scroll-info.ts) — `IScrollInfo` +
  `isScrollInfo`
- [Controls/data-template.ts](../Controls/data-template.ts) —
  `DataTemplate`
- [Controls/item-container-generator.ts](../Controls/item-container-generator.ts) —
  `ItemContainerGenerator`
- [Controls/items-control.ts](../Controls/items-control.ts) —
  `ItemsControl`
- [Controls/items-presenter.ts](../Controls/items-presenter.ts) —
  `ItemsPresenter`
- [Controls/virtualizing-panel.ts](../Controls/virtualizing-panel.ts) —
  `VirtualizingPanel` (abstract)
- [Controls/virtualizing-stack-panel.ts](../Controls/virtualizing-stack-panel.ts) —
  `VirtualizingStackPanel`
- [Controls/scroll-viewer.ts](../Controls/scroll-viewer.ts) —
  `ScrollViewer`

See also: [templating.md](templating.md) for `ContentControl` /
`ContentPresenter` (the single-content analogue of ItemsControl /
ItemsPresenter).

## 1. `ObservableCollection<T>`

Live-updating list with per-mutation change notifications. The high-
level UI layer (`ItemsControl`) reacts to these incrementally — adding
an item splices in one container rather than rebuilding everything.

```ts
import { ObservableCollection } from '../runtime/index.js';

const items = new ObservableCollection<string>(['a', 'b', 'c']);
items.Add('d');               // 'inserted' event with index = 3
items.Insert(1, 'X');         // 'inserted' event with index = 1
items.RemoveAt(0);            // 'removed' event with index = 0
items.SetAt(1, 'Y');          // 'replaced' event with index = 1
items.Clear();                // 'cleared' event

items.Count;                  // 0
items.Get(0);                 // undefined
items.IndexOf('Y');           // -1
[...items];                   // [] (Iterable)
items.ToArray();              // []

const unsub = items.Subscribe(change => {
    switch (change.kind) {
        case 'inserted': /* change.index, change.items */ break;
        case 'removed':  break;
        case 'replaced': /* change.oldItem, change.newItem */ break;
        case 'cleared':  break;
    }
});
```

`CollectionChange<T>` is a discriminated union. Subscribers receive
events synchronously during the mutation call. Listeners are snapshotted
before iteration so an `unsub` mid-notify doesn't disrupt the others.

`IReadOnlyObservableCollection<T>` is the typed view interface — same
shape minus the mutators. Used as the public type when a container owns
the collection and routes mutation through its own API. `Panel.Children`
is the prime example.

## 2. `Panel.Children` is observable

```ts
const panel = new MyPanel();
panel.Children.Subscribe(change => {
    // any AddChild / InsertChild / RemoveChild on the panel fires
});

panel.AddChild(a);
panel.InsertChild(1, b);    // insert at index 1 (b is now between existing children)
panel.RemoveChild(a);
```

Mutation goes through the public methods (which do the proper
Attach/Detach to wire both trees). Reading `Children` returns a
read-only observable view — Count, Get, IndexOf, iteration,
subscription. `visualChildren` and `logicalChildren` continue to return
`readonly Visual[]` snapshots (materialized lazily, invalidated by an
internal subscription).

## 3. `DataTemplate`

A factory that turns one data item into a Visual:

```ts
import { DataTemplate } from '../Controls/index.js';

const personTemplate = new DataTemplate(data => {
    const person = data as { name: string };
    const text = new TextBlock(person.name);
    text.FontSize = 14;
    return text;
});
```

Data is `unknown` — the factory knows what shape it expects. No
DataTypeSelector (which template for which type) in this cut; a single
template per `ItemsControl`.

## 4. `ItemsControl`

```ts
import { ItemsControl, DataTemplate } from '../Controls/index.js';
import { Canvas } from '../Controls/index.js';

const ic = new ItemsControl();
ic.ItemsPanel   = () => new Canvas();          // panel factory
ic.ItemTemplate = personTemplate;              // DataTemplate
ic.Items        = [{name: 'A'}, {name: 'B'}];  // array, OR ObservableCollection
```

When all three are set, ItemsControl materializes one container per
item via the `ItemContainerGenerator`, attaches each into:
- The items panel — **visual** parent
- The ItemsControl — **logical** parent

This divergence (visual under panel, logical under ItemsControl)
mirrors WPF and is the headline reason for the two-tree split:
`DataContext` / inheritable properties set on the ItemsControl flow
through to each container, NOT through the panel.

### Reacting to collection changes

If `Items` is an `ObservableCollection`, the ItemsControl subscribes
and dispatches per-mutation:
- `inserted` → realize a new container at the index, `InsertVisualChild`
  into the panel at that position, `InsertContainer` into the logical
  list.
- `removed` → look up the container by index, `RemoveVisualChild`,
  `DetachContainer`, `Recycle` in the generator.
- `replaced` → tear down the old + bring in the new at that index.
- `cleared` → tear down everything, clear the generator.

Other already-realized containers are preserved across mutations — same
Visual instances, no rebuild churn.

## 5. `ItemContainerGenerator`

Bridge between items and containers. Owned by the ItemsControl,
exposed via `ic.Generator`.

```ts
ic.Generator.ContainerFromItem('a');     // → the Visual produced for 'a'
ic.Generator.ItemFromContainer(visual);  // → the data item that visual represents
ic.Generator.IsRealized('a');            // → true
ic.Generator.Realize('b');               // idempotent — returns cached or creates fresh
ic.Generator.Recycle(visual);            // drops the mapping
ic.Generator.Count;                      // realized count
```

Virtualizing panels use the generator to realize / recycle on demand
based on viewport. The default non-virtualizing flow realizes
everything once and recycles in lockstep with collection changes.

## 6. `ItemsPresenter` + `Template`

ItemsControl gets an optional `Template: ControlTemplate` that wraps
the items panel in surrounding chrome (header, footer, scrollbar). The
template must contain an `ItemsPresenter` — a Visual slot. When the
template is applied:

```ts
ic.Template = new ControlTemplate(_tp => {
    const border = new Border();
    border.Padding = new Thickness(8);
    border.SetChild(new ItemsPresenter());
    return border;
});
```

The items panel ends up as a visual descendant of the `ItemsPresenter`
(not a direct child of the ItemsControl). Re-templating preserves the
items panel instance and all its containers — the panel is unparented
from the old presenter and re-attached to the new one.

Without a `Template`, the items panel is the ItemsControl's direct
visual child (legacy behavior, no chrome).

## 7. Virtualization

For long lists, allocating every container is wasteful. A
`VirtualizingPanel` realizes containers only for items currently
visible and recycles those that leave.

### `VirtualizingPanel` (abstract base)

The marker. When the ItemsControl's `ItemsPanel` factory produces a
`VirtualizingPanel` subclass, ItemsControl skips its bulk realization
and hands the panel a back-pointer (`SetItemsOwner`). The panel then
decides when to realize / recycle by calling `owner.Generator.Realize`
/ `Recycle`.

### `VirtualizingStackPanel`

Concrete implementation. Vertical stack with uniform item height.
Properties:
- `Viewport: Rect` — the visible region (in panel coords). Position +
  size.
- `ItemHeight: number` — uniform height per item.

```ts
const panel = new VirtualizingStackPanel();
panel.ItemHeight = 28;
panel.Viewport   = new Rect(0, 0, 300, 200);    // visible area
```

`MeasureOverride` computes which items intersect the viewport, calls
`owner.Generator.Realize(item)` for those not already realized,
`owner.Generator.Recycle(container)` for those leaving the viewport.
Reports `DesiredSize.Height = itemCount × ItemHeight` (full extent, so
a host ScrollViewer knows the scrollable range).

`ArrangeOverride` places each realized container at
`Rect(0, index * ItemHeight, width, ItemHeight)`.

`RealizedIndices` is a read-only view of currently-live indices for
tests / tooling.

## 8. `IScrollInfo`

Contract exposed by panels that handle their own scrolling extent —
typically VirtualizingStackPanel:

```ts
interface IScrollInfo {
    readonly ExtentWidth: number;       // total content size
    readonly ExtentHeight: number;
    readonly ViewportWidth: number;     // visible area
    readonly ViewportHeight: number;
    readonly HorizontalOffset: number;  // current scroll position
    readonly VerticalOffset: number;
    SetHorizontalOffset(value: number): void;
    SetVerticalOffset(value: number): void;
}
```

`VirtualizingStackPanel` implements it: ExtentHeight is computed from
itemCount × ItemHeight, ViewportWidth/Height mirrors Viewport.W/H,
offsets mirror Viewport.X/Y. `isScrollInfo(v)` is a duck-type guard
(checks for `SetHorizontalOffset` / `SetVerticalOffset` methods).

## 9. `ScrollViewer`

```ts
import { ScrollViewer } from '../Controls/index.js';

const sv = new ScrollViewer();
sv.Content = someContent;          // any Visual
sv.VerticalOffset = 200;           // scroll
```

Properties:
- `Content: Visual | undefined` — what to scroll.
- `HorizontalOffset` / `VerticalOffset: number` — current scroll
  position (programmatic only; no input events yet).
- `ExtentWidth` / `ExtentHeight` (read-only) — full content size,
  computed during Measure.
- `ViewportWidth` / `ViewportHeight` (read-only) — visible area.
- `ScrollableWidth` / `ScrollableHeight` (read-only) — `max(0, Extent -
  Viewport)`. Max useful offsets.
- `ScrollToTop / Bottom / Left / Right()` — convenience.

### Two layout modes (auto-detected)

**Delegate mode** — Content implements `IScrollInfo` (typically a
`VirtualizingStackPanel`). The ScrollViewer reads ExtentWidth /
ExtentHeight from the IScrollInfo, clamps the offsets, drives the
panel's Viewport (position + size) directly. No clip needed — the panel
only emits visible items.

```ts
const sv = new ScrollViewer();
const panel = makeVirtualizingPanel(longItemList);
sv.Content = panel;
sv.VerticalOffset = 500;
sv.Measure(new Size(300, 200));
// panel.Viewport is now (0, 500, 300, 200); the panel realized the
// items intersecting that range and recycled others.
```

**Clip-and-translate mode** — Content is anything else. ScrollViewer
measures Content with `Infinity` available size (so it reports its
natural extent), arranges it at `(-HorizontalOffset, -VerticalOffset)`,
installs a `RectangleGeometry` clip on itself so off-viewport content
doesn't paint past the viewport.

### Offset clamping

Offsets are NOT clamped on assignment — the raw user-set value stays
queryable. The effective offset (clamped to `[0, ScrollableWidth]` /
`[0, ScrollableHeight]`) is computed at use time during
ArrangeOverride. Out-of-range writes snap into range as soon as the
extent permits.

## 10. `Visual.Clip`

ScrollViewer's clip-and-translate mode uses a general clip
mechanism. Any Visual can set `.Clip` to a `RectangleGeometry` or
`EllipseGeometry`; the renderer pushes the clip before
RenderOverride + the children walk, pops after.

```ts
visual.Clip = new RectangleGeometry(new Rect(0, 0, 100, 100));
```

Geometry is in the Visual's local coordinate space (after the
translate-to-arranged-position has been pushed). `MetaData.Render` on
Clip so changes trigger a re-render but not a re-measure.

## 11. End-to-end example

```ts
import { Color } from '../runtime/index.js';
import { HeadlessTarget, SolidColorBrush, SvgDrawingContext } from '../visual-engine/index.js';
import {
    DataTemplate,
    ItemsControl,
    ScrollViewer,
    TextBlock,
    VirtualizingStackPanel,
} from '../Controls/index.js';

// 10,000 items
const items = Array.from({ length: 10000 }, (_, i) => `Row ${i}`);

const sv = new ScrollViewer();
const panel = new VirtualizingStackPanel();
panel.ItemHeight = 24;

const ic = new ItemsControl();
ic.ItemTemplate = new DataTemplate(d => {
    const tb = new TextBlock(d as string);
    tb.FontSize = 14;
    return tb;
});
ic.Items = items;
ic.ItemsPanel = () => panel;   // routes through panel.SetItemsOwner

sv.Content = panel;            // delegate mode — sv drives panel.Viewport

const target = new HeadlessTarget(300, 200, sv);
const dc = new SvgDrawingContext();

sv.VerticalOffset = 4000;       // scroll to item 166-ish
target.Render(dc);
// SVG output contains only the ~9 realized text blocks visible in the viewport
```

## 12. Limitations

- **Variable item heights**. `VirtualizingStackPanel` assumes uniform
  `ItemHeight`. Real-world content with measured-per-item heights
  (typical for text-heavy lists) needs a different panel that caches
  per-item sizes.
- **Vertical orientation only**. No `Orientation = Horizontal` for the
  virtualizing panel; trivial to add but not done.
- **No container recycling across items**. `Recycle` drops the
  mapping; the next `Realize` creates a fresh container. A pool /
  recycle queue would let you reuse the same Visual instance for a
  different item — saves allocation for very long lists.
- **No item-based selection / focus**. `ItemsControl` is the data
  display foundation; the selection model of WPF's `ListBox` /
  `TreeView` / `DataGrid` is built on top and not part of this cut.
- **No item recycling on style / template change**. Changing
  `ItemTemplate` clears the generator and re-realizes everything from
  scratch.
- **No incremental update on `ObservableCollection.Insert` at an
  index covered by VirtualizingStackPanel**. The panel's
  `OnItemsChanged` default is "recycle all + invalidate measure" —
  the next measure realizes from scratch. Subclasses could override
  `OnItemsChanged` for finer-grained incremental update.
- **No `DataTemplateSelector`** (pick a template per item type).
  ItemTemplate is one-size-fits-all.
- **No `HierarchicalDataTemplate`** (the TreeView analogue).
- **No `MultiBinding` for data items.** A container's bindings against
  the data item are direct property bindings.

### Scroll-specific limitations

- **No input events**. ScrollViewer offsets are programmatic. A
  future input layer connects mouse wheel / drag / keyboard /
  touchpad gestures to the offsets.
- **No scrollbar control**. `ScrollableWidth` / `ScrollableHeight` are
  exposed for a future ScrollBar visual to bind to, but the
  ScrollBar itself isn't built.
- **No smooth scrolling / animation**. Offsets change
  instantaneously.
- **ScrollViewer doesn't walk descendants for `IScrollInfo`**. Content
  must be the IScrollInfo provider directly. Wrapping a ScrollViewer
  around an `ItemsControl` whose ItemsPanel is a
  VirtualizingStackPanel won't auto-delegate — needs a stable
  lookup from ItemsControl through to its inner panel.
- **Cross-axis virtualization** (e.g., a virtualizing grid that
  realizes a 2D viewport's worth of cells) — out of scope for the
  current `VirtualizingStackPanel`.
</content>
