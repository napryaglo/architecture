# Visual Tree

The structural side of the framework: `Visual` is the base of every
rendered element, `Single` is a one-child container, `Panel` is a
many-child container. Visuals own a parent link, a back-pointer to the
host, and participate in the layout / render lifecycle.

**Implemented in:**
- [runtime/visual.ts](../runtime/visual.ts) — `Visual`, `Single`, `Panel`,
  `VisualHost`, `HorizontalAlignment`, `VerticalAlignment`

See also: [layout.md](layout.md) for the Measure / Arrange / Render
lifecycle and sizing/alignment/margin properties, and [targets.md](targets.md)
for how Visual trees connect to a `PresentationTarget`.

## 1. The three classes

```
Model                ← base property/binding bag (storage only)
  └─ Visual          ← + parent + target + layout/render lifecycle
       ├─ Single     ← exactly one child (Border, future Decorator, …)
       └─ Panel      ← ordered children (future StackPanel, Grid, …)
```

| Class | Role |
|---|---|
| `Visual` | The base. Any node in the rendered tree extends Visual directly (leaf) or via Single/Panel (container). Owns layout cache, parent link, host back-pointer, and the `OnRender` hook. |
| `Single` | Container that owns at most one child. `SetChild(child)` attaches; `SetChild(undefined)` detaches. Replacing the existing child first detaches the previous one. Used by Border. |
| `Panel` | Container with ordered children. `AddChild` / `RemoveChild`. The basis for layout panels. |

A bare `Visual` is a renderable leaf — override `RenderOverride` to draw,
and the layout system handles the rest.

## 2. Building a tree

```ts
import { Border, TextBlock } from '../Controls/index.js';

const label = new TextBlock('Hello');
const card  = new Border(label);    // Single's SetChild called by Border's constructor

// Multi-child via Panel subclass:
class Stack extends Panel { /* … */ }
const stack = new Stack();
stack.AddChild(label);
stack.AddChild(new TextBlock('World'));
```

A Visual can have at most one parent. Re-parenting requires explicit detach:

```ts
parentA.RemoveChild(child);
parentB.AddChild(child);

// Or for Single:
oldOwner.SetChild(undefined);
newOwner.SetChild(child);
```

Attempting to attach a child that already has a parent throws:

```ts
ts.RemoveChild(child);
// Without the line above, this would throw:
otherPanel.AddChild(child);
// Error: "Visual already has a parent; remove it from its current parent first."
```

## 3. The parent link

`Visual.parent` is a `protected` getter — Visuals can walk up to their parent
but external code can't. Subclasses use it for things like "find the nearest
Border ancestor". The parent link is set automatically on Attach / Detach
and isn't user-settable.

```ts
class MyVisual extends Visual {
    private findCard(): Border | undefined {
        let v: Visual | undefined = this.parent;
        while (v !== undefined) {
            if (v instanceof Border) return v;
            v = (v as MyVisual).parent;  // bracket access if needed
        }
        return undefined;
    }
}
```

Self-attachment is rejected:

```ts
panel.AddChild(panel);
// Error: "A Visual cannot be its own child."
```

## 4. The host back-pointer

Every Visual carries a `_target: VisualHost | undefined` pointer to the
`PresentationTarget` that owns its tree. This is what makes layout / render
invalidation O(1) — when a property changes, the Visual notifies its host
directly instead of walking up to find the root.

The pointer is set automatically:

- When `PresentationTarget.Content = visual` is set, the new root and every
  descendant get `target` pointing to the target.
- When a Visual is `Attach`-ed under a mounted parent, it inherits the parent's
  `target` (and cascades to its own children).
- When detached, `target` clears down the subtree.

You shouldn't ever set `target` yourself — the framework does it. Subclasses
read it via the `protected get target` accessor:

```ts
class MyVisual extends Visual {
    protected override RenderOverride(dc: DrawingContext): void {
        const dpi = this.target?.TextMeasurer;  // example: reach the host's measurer
        // …
    }
}
```

### Dual-mount protection

Attaching a Visual that already has a non-undefined `target` to a different
host throws:

```ts
target1.Content = visual;
target2.Content = visual;
// Error: "Visual is already attached to a host; detach from the current host first."
```

Move via:
```ts
target1.Content = undefined;
target2.Content = visual;
```

## 5. `VisualHost` interface

The contract a host must satisfy. `PresentationTarget` is the only public
implementation, but Visual itself only sees the four methods on the interface.

```ts
interface VisualHost {
    OnMeasureInvalidated(visual: Visual): void;
    OnArrangeInvalidated(visual: Visual): void;
    OnRenderInvalidated(visual: Visual): void;
    readonly TextMeasurer: TextMeasurer;
}
```

The three `OnXxxInvalidated` hooks fire when a Visual's property change
invalidates the corresponding lifecycle phase. `TextMeasurer` is the service
text-bearing Visuals use during `MeasureOverride` — defaults to the stateless
approximation, swappable to a `FontMetricsMeasurer` with loaded fonts.

The full host hooks-and-lifecycle story is in [targets.md](targets.md).

## 6. Single vs Panel — which to extend

| Pattern | Extends |
|---|---|
| Wrapper around exactly one child (Border, Decorator, ScrollViewer's outer shell, …) | `Single` |
| Layout container with any number of children (StackPanel, Grid, Canvas, …) | `Panel` |
| Leaf with no children of its own (TextBlock, Rectangle, Ellipse, Image, …) | `Visual` directly |

Single's `child` getter returns `Visual | undefined`. Panel's `children`
getter returns `ReadonlyArray<Visual>`. Both are public — consumers (and
the renderer) walk them to traverse the tree.

```ts
const target = new HeadlessTarget(...);
// HeadlessTarget walks the tree like this internally:
function walkTree(v: Visual): void {
    if (v instanceof Single && v.child !== undefined) walkTree(v.child);
    if (v instanceof Panel) for (const c of v.children) walkTree(c);
}
```

## 7. Implementing a new container

To build a custom container, extend `Single` or `Panel` and override
`MeasureOverride` / `ArrangeOverride` to lay out children.

```ts
class HorizontalStack extends Panel {
    protected override MeasureOverride(availableSize: Size): Size {
        let width = 0, height = 0;
        for (const child of this.children) {
            child.Measure(availableSize);
            width  += child.DesiredSize.Width;
            height = Math.max(height, child.DesiredSize.Height);
        }
        return new Size(width, height);
    }

    protected override ArrangeOverride(finalSize: Size): Size {
        let x = 0;
        for (const child of this.children) {
            child.Arrange(new Rect(x, 0, child.DesiredSize.Width, finalSize.Height));
            x += child.DesiredSize.Width;
        }
        return finalSize;
    }
}
```

The full Measure/Arrange/Render contract — what to call, what to return —
is in [layout.md](layout.md).

## 8. Tree-walking helpers (internal pattern)

Subclasses of `Single` / `Panel` are responsible for propagating tree-walks
(inheritance refresh, target updates) to their children. The convention is
three overridable hooks on `Visual` (no-op defaults):

| Method | When it runs |
|---|---|
| `propagate_inheritance_to_children` | When any inheritable property on this Visual changes — refresh all descendants |
| `propagate_inheritance_for(descriptor)` | When a specific inheritable property changes — refresh just that property in descendants |
| `propagate_target_to_children` | When this Visual's `target` changes — cascade the new target down |

`Single` and `Panel` override each to walk their `_child` / `_children`. New
container subclasses get this for free by extending Single or Panel; bespoke
containers would override all three.

## 9. What lives on `Visual`

A quick map of what comes from each base class — for reference when reading
the source.

**From `Model`:** property storage, `AddPropertyChangedListener`,
`get_property_value` / `set_property_value` / `ClearValue` /
`GetValueSource`, `OnPropertyChanged` (overridden to dispatch invalidation).

**Added by `Visual`:** parent / target links, layout state cache
(`DesiredSize` / `RenderSize` / `ArrangedRect`), Measure / Arrange / Render
lifecycle, Width / Height / MinWidth / MinHeight / MaxWidth / MaxHeight,
HorizontalAlignment / VerticalAlignment, Margin, InvalidateMeasure /
InvalidateArrange / InvalidateVisual.

**Added by `Single`:** `child` getter, `SetChild`, child-targeted
propagation overrides.

**Added by `Panel`:** `children` getter, `AddChild`, `RemoveChild`,
multi-child propagation overrides.

The full layout API is documented in [layout.md](layout.md).
