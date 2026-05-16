# Property System

The foundation everything else builds on. Models own per-instance property
state with WPF-style dependency-property semantics: registered metadata,
default values, change notification, coercion, bindings, value priority,
read-only properties, attached/cross-class properties, and inheritance.

**Implemented in:**
- [runtime/model.ts](../runtime/model.ts) — `Model`, `PropertyKey`
- [runtime/property-descriptor.ts](../runtime/property-descriptor.ts) — `PropertyDescriptor`
- [runtime/effective-value.ts](../runtime/effective-value.ts) — `EffectiveValueDescriptor`, `PropertyValueSource`
- [runtime/metadata.ts](../runtime/metadata.ts) — `MetaData` flags
- [runtime/binding.ts](../runtime/binding.ts) — `Binding`, `BindingMode`, `ValueConverter`, `BindingOptions`

## 1. Models and properties

A `Model` is a property bag with change notification. You don't store values
as fields — you register them with `Model.RegisterProperty` and access them
through accessors. Subclasses register their properties in a `static {}`
initializer.

```ts
import { MetaData, Model } from '../runtime/index.js';

class Box extends Model {
    static {
        Model.RegisterProperty(Box, 'Width',  100, MetaData.None);
        Model.RegisterProperty(Box, 'Color', 'red', MetaData.None);
    }

    // Typed accessors that delegate to the property store.
    public get Width(): number { return this.get_property_value('Width'); }
    public set Width(value: number) { this.set_property_value('Width', value); }
    public get Color(): string { return this.get_property_value('Color'); }
    public set Color(value: string) { this.set_property_value('Color', value); }
}

const b = new Box();
b.Width        // 100   — falls through to the registered default
b.Width = 200; // fires change notification, listeners run
```

The typed accessors are optional but recommended — they're how every concrete
class in the library (`Brush`, `Pen`, `Border`, `TextBlock`, …) exposes its
properties to consumers. Without them, callers fall back to the raw
`get_property_value('Width')` / `set_property_value('Width', value)` form,
which always works.

### Registration options

```ts
Model.RegisterProperty(
    owner: Function,       // the class registering the property (typically `this` in a static block)
    property: string,      // the property name
    default_value: any,    // returned by get when no value has been set
    meta_data: MetaData,   // flag enum — affects Measure/Arrange/Render/Inherits routing
    coerce_value?: CoerceValue,  // optional value-normalization callback
): void
```

`CoerceValue` runs on first set (not subsequent — see code-review note) and
returns the normalized value:

```ts
Model.RegisterProperty(Slider, 'Value', 0, MetaData.Render,
    (_model, v) => Math.max(0, Math.min(100, v))  // clamp to [0, 100]
);
```

### Default values

`get_property_value` returns the descriptor's `default_value` when no value
has been explicitly set on the instance. Defaults survive `ClearValue`, which
removes the local override and resets the effective value to the default.

## 2. Change notification

`AddPropertyChangedListener` subscribes to property changes per instance:

```ts
const b = new Box();
b.AddPropertyChangedListener('Width', (model, name, old, neu) => {
    console.log(`${name}: ${old} -> ${neu}`);
});
b.Width = 50;
// logs: "Width: 100 -> 50"
```

The callback receives `(model, propertyName, oldValue, newValue)`. Remove
with `RemovePropertyChangedListener(property, callback)` — the same callback
reference must be passed. Listeners fire after every effective-value change
regardless of source (direct set, binding push, `ClearValue`, etc.).

## 3. Value priority and `GetValueSource`

Each Model property tracks where its current value came from — the
`EffectiveValueDescriptor` resolves the highest-priority source per read.
The priority order (highest first):

```
CoercedValue     — value forced by a coerce callback
AnimatedValue    — placeholder, no animation engine yet
Binding          — value from a Binding (see §5)
LocalValue       — explicitly set via set_property_value
InheritedValue   — inherited from an ancestor's MetaData.Inherits property
Default          — descriptor's default_value
```

Read the current source with `GetValueSource`:

```ts
import { PropertyValueSource } from '../runtime/index.js';

b.GetValueSource('Width');   // PropertyValueSource.Default
b.Width = 50;
b.GetValueSource('Width');   // PropertyValueSource.LocalValue
b.ClearValue('Width');
b.GetValueSource('Width');   // PropertyValueSource.Default again
```

## 4. Cross-class / attached properties

Any property registered on any class can be set on any Model instance. This
is the mechanism WPF calls "attached properties" — e.g., `Grid.Row="2"` on
a `<Button>`. There's no separate API surface; the same registration produces
both regular and attached access.

```ts
class Grid extends Panel {
    static {
        Model.RegisterAttachedProperty(Grid, 'Row',    0, MetaData.Arrange);
        Model.RegisterAttachedProperty(Grid, 'Column', 0, MetaData.Arrange);
    }
}

const button = new Button();
button.set_property_value(Grid, 'Row',    2);   // explicit-owner overload
button.set_property_value(Grid, 'Column', 1);

button.get_property_value(Grid, 'Row');         // 2
```

`RegisterAttachedProperty` is a synonym for `RegisterProperty` — the same
registration. Both produce identical behavior. The naming exists purely as
documentation at the call site.

Every accessor (`set_property_value`, `get_property_value`, `ClearValue`,
`GetValueSource`, `Add/RemovePropertyChangedListener`) has two overloads:

- **Implicit owner** — `set_property_value('Width', 100)` walks the target's
  class hierarchy to find the property.
- **Explicit owner** — `set_property_value(Grid, 'Row', 2)` uses the
  specified owner class directly.

Per-instance storage uses composite keys (`${RootOwner.name}.${name}`), so
two different classes can register a property with the same name without
collision.

## 5. Bindings

A `Binding` connects a target property to a source property via a path. The
runtime supports four modes:

```ts
import { Binding, BindingMode } from '../runtime/index.js';

// OneWay (default): source changes propagate to target
view.set_property_value('label',
    new Binding(model, 'user.name'));

// TwoWay: target changes write back to source
input.set_property_value('value',
    new Binding(model, 'count', BindingMode.TwoWay));

// OneTime: read once, never observe
view.set_property_value('initialValue',
    new Binding(model, 'startingPoint', BindingMode.OneTime));

// OneWayToSource: target writes propagate to source; source changes don't update target
log.set_property_value('latest',
    new Binding(model, 'lastTouched', BindingMode.OneWayToSource));
```

### Property paths

Paths traverse Model graphs with three syntactic shapes:

| Syntax | Meaning |
|---|---|
| `a.b.c` | Dotted access — `a.b.c` |
| `items[0]` | Indexed access — `items[0]` |
| `(Owner.Property)` | Attached-property access — uses the explicit-owner accessor with the named owner class |

These compose: `dept.manager.(Grid.Row)`, `items[2].label`,
`(Holder.List)[1]`.

The path attaches change listeners at each Model along the chain. When any
chain member's relevant property mutates, the path re-traverses from the
mutated segment forward and pushes the new terminal value through.

### Binding pipeline

Optional `BindingOptions` apply transformations between source and target.
The pipeline (in order):

```
Convert  →  StringFormat  →  TargetNullValue  →  FallbackValue
```

```ts
new Binding(model, 'count', BindingMode.OneWay, {
    converter:       { convert: v => v * 2, convertBack: v => v / 2 },
    stringFormat:    'Count: {0}',     // "{0}" placeholder for the value
    targetNullValue: '(empty)',         // substituted when value is null
    fallbackValue:   '?',               // substituted when value is undefined (path unreachable)
});
```

- `Convert` runs source → target on every read and on push notifications.
- `StringFormat` wraps after convert; one-way only (TwoWay writeback bypasses).
- `TargetNullValue` substitutes when the resolved value is null.
- `FallbackValue` substitutes when the resolved value is undefined.

### Disposing bindings

`Binding.dispose()` removes every listener the path registered along the
chain. The framework disposes bindings automatically when one is replaced
by another value, but explicit disposal is the contract if you hold a
binding outside the framework.

## 6. Read-only properties

`RegisterReadOnlyProperty` returns a `PropertyKey` token. External code can
read the property (and bind to it) but only the holder of the key can write
or clear it.

```ts
class Stopwatch extends Model {
    private static readonly ElapsedKey =
        Model.RegisterReadOnlyProperty(Stopwatch, 'Elapsed', 0, MetaData.None);

    public get Elapsed(): number { return this.get_property_value('Elapsed'); }

    public tick(): void {
        // Internal write — uses the privileged setter with the key.
        this.set_property_value_with_key(Stopwatch.ElapsedKey, this.Elapsed + 1);
    }
}

const s = new Stopwatch();
s.Elapsed = 5;   // throws — "Elapsed is read-only"
s.tick();        // OK — Stopwatch holds the key
```

`ClearValueWithKey(key)` is the privileged equivalent of `ClearValue`.
Listeners and bindings on read-only properties work normally.

## 7. Metadata overrides

A subclass can override the metadata of a property registered on an ancestor.
`OverrideMetadata` chains a per-class descriptor whose `parent` references
the inherited one — unspecified fields fall through to the parent.

```ts
class StackPanel extends Panel { }
Model.OverrideMetadata(StackPanel, 'Orientation', {
    default_value: Orientation.Vertical,
});
// StackPanel.Orientation now defaults to Vertical, even though
// Panel.Orientation defaulted to Horizontal. MetaData flags
// and coerce callback fall through unchanged.
```

The descriptor chain preserves identity: the same property registered on the
root class is referred to by the same composite key (`${RootOwner.name}.${name}`)
across overrides, so per-instance storage and listener subscriptions stay
unified.

## 8. The `MetaData` flag enum

`MetaData` is a flag enum (powers of two). Combine with `|`:

```ts
MetaData.None                                  // 0
MetaData.Measure                               // affects Visual layout's measure pass
MetaData.Arrange                               // affects Visual layout's arrange pass
MetaData.Render                                // affects Visual rendering
MetaData.Inherits                              // value cascades through the visual tree
MetaData.Measure | MetaData.Render             // both
```

On plain `Model`, the flags are advisory — `Model.OnPropertyChanged` is a
no-op. `Visual` overrides `OnPropertyChanged` to dispatch:

- `Measure` → `InvalidateMeasure()` → notify host
- `Arrange` → `InvalidateArrange()`
- `Render` → `InvalidateVisual()`
- `Inherits` → propagate the new value to descendants

Use the right flag per property. A render-only attribute (color, fill) uses
`MetaData.Render`. A layout-affecting attribute (font size, padding) uses
`MetaData.Measure`. A pure data property without visual effect uses
`MetaData.None`.

## 9. Property value inheritance

Properties flagged `MetaData.Inherits` cascade down the visual tree. A child
that hasn't explicitly set the value reads it from the nearest ancestor
that has.

```ts
class TextBlock extends Visual {
    static {
        Model.RegisterProperty(TextBlock, 'FontSize', 14,
            MetaData.Measure | MetaData.Inherits);
    }
}

const child  = new TextBlock();
const parent = new Border(child);
parent.set_property_value(TextBlock, 'FontSize', 24);
//  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//  Border doesn't know about TextBlock.FontSize, but the explicit-owner
//  overload + cross-class storage means the value still lives on Border.
//  Inheritance walks up from child, finds it, and caches as InheritedValue.

child.FontSize;                              // 24
child.GetValueSource('FontSize');            // PropertyValueSource.InheritedValue
```

Inheritance is push-based: when an ancestor's inheritable value changes, the
framework walks descendants and refreshes their cached inherited values.
Local overrides on a descendant act as cascade boundaries — `SetInheritedValue`
returns early when a higher-priority source already owns the slot.

The cached `InheritedValue` source means reads are O(1); the cascade only
runs when ancestor values change or when subtrees are attached / detached.

## 10. Useful patterns

**Define a Model with a property — minimum boilerplate:**
```ts
class Counter extends Model {
    static { Model.RegisterProperty(Counter, 'Count', 0, MetaData.None); }
    public get Count(): number { return this.get_property_value('Count'); }
    public set Count(v: number) { this.set_property_value('Count', v); }
}
```

**Observe a property:**
```ts
counter.AddPropertyChangedListener('Count', (_m, _p, old, neu) => render());
```

**Bind a property to a source:**
```ts
display.set_property_value('text', new Binding(counter, 'Count'));
```

**Bind with a converter:**
```ts
display.set_property_value('text', new Binding(counter, 'Count', BindingMode.OneWay, {
    converter: { convert: n => `${n} clicks` }
}));
```

**Reset a property to its default:**
```ts
b.ClearValue('Width');
```

**Detect whether the value is the default:**
```ts
if (b.GetValueSource('Width') === PropertyValueSource.Default) {
    // no explicit set
}
```
