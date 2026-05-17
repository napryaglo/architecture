# Styles

Reusable bags of property assignments + conditional triggers applied to
target `Visual` classes. Mirrors WPF's `Style` / `Setter` /
`PropertyTrigger`.

**Implemented in:**
- [runtime/style.ts](../runtime/style.ts) — `Style`, `Setter`,
  `SetterFactory`, `PropertyTrigger`
- [runtime/visual.ts](../runtime/visual.ts) — `Visual.Style`, apply /
  unapply, implicit-style lookup with subscription
- [runtime/effective-value.ts](../runtime/effective-value.ts) —
  `PropertyValueSource.StyleValue` + `TriggerValue` tiers

See also: [property-system.md](property-system.md) for the value-priority
ladder, [resources.md](resources.md) for how implicit styles are looked
up (keyed by class in `ResourceDictionary`).

## 1. Setters

A `Setter` is `(owner, property, value)` — explicit owner so cross-class
/ attached properties work cleanly.

```ts
import { Setter, Style } from '../runtime/index.js';
import { Border, Canvas, TextBlock } from '../Controls/index.js';

new Setter(Border, 'BorderThickness', new Thickness(2));
new Setter(Canvas, 'Left', 20);           // attached property setter
new Setter(TextBlock, 'FontSize', 16);
```

## 2. Style

```ts
const cardStyle = new Style(Border, [
    new Setter(Border, 'Background',      new SolidColorBrush(Color.White)),
    new Setter(Border, 'BorderBrush',     new SolidColorBrush(Color.Gray)),
    new Setter(Border, 'BorderThickness', new Thickness(1)),
    new Setter(Border, 'Padding',         new Thickness(16)),
    new Setter(Border, 'CornerRadius',    8),
]);

const card = new Border();
card.Style = cardStyle;
// card.Background, BorderBrush, BorderThickness, Padding, CornerRadius
// now reflect the setter values at the StyleValue priority tier.
```

### TargetType validation

`Style.TargetType` is the class the style targets. Applying a style to a
Visual that's not an instance of `TargetType` throws — caught early
rather than silently leaking unrelated setters.

```ts
const buttonStyle = new Style(Button, …);
const tb = new TextBlock();
tb.Style = buttonStyle;
// Error: Style.TargetType 'Button' does not match target 'TextBlock'
```

Subclass-of relationships pass: a `Style(Visual, …)` works on any
`Visual` descendant.

### Sealing

The first `Visual.Style = s` assignment calls `s.Seal()`, flipping
`s.IsSealed = true`. Idempotent; cascades into `BasedOn`. Today the
contract is a marker (setters / triggers / basedOn are already
`readonly`); future mutable trigger / setter collections will gate on
this flag.

## 3. BasedOn

Child styles inherit setters from a base, override per (owner, property):

```ts
const base = new Style(Border, [
    new Setter(Border, 'Padding', new Thickness(8)),
    new Setter(Border, 'BorderThickness', new Thickness(1)),
]);

const accentCard = new Style(Border, [
    new Setter(Border, 'Background', new SolidColorBrush(Color.FromHex('#1e40af'))),
    new Setter(Border, 'Padding', new Thickness(16)),    // overrides base
], base);

accentCard.ResolveSetters();
//   Border.BorderThickness  = Thickness(1)            (from base)
//   Border.Background       = blue                    (from child)
//   Border.Padding          = Thickness(16)           (child overrides base)
```

Multi-level chains resolve transitively. `ResolveSetters` runs at apply
time, not at construction, so editing a base after children are built is
observable in the children.

## 4. Applying styles

Two ways:

### Explicit — `Visual.Style = someStyle`

Direct assignment. Always wins over any implicit style.

```ts
border.Style = cardStyle;
border.Style = undefined;    // clears; falls back to implicit (if any in scope)
```

### Implicit — keyed by `TargetType` in a `ResourceDictionary`

```ts
const root = new TestPanel();
root.Resources.Set(Border, cardStyle);

const card = new Border();
root.AddChild(card);    // implicit style auto-applied at AttachLogical
```

When a `Visual` enters the logical tree, it walks up its ancestor
`Resources` chain looking for an entry keyed by `this.constructor`. If
found, that style is applied as the "implicit" style.

The implicit style is **reactive**: at attach time, the Visual subscribes
to every `Resources` dict along the chain. Adding / removing / replacing
the implicit style afterwards re-resolves automatically.

```ts
const root = new TestPanel();
const card = new Border();
root.AddChild(card);
// No implicit style yet — card uses defaults.

root.Resources.Set(Border, cardStyle);
// card immediately picks up cardStyle via the subscription.

root.Resources.Set(Border, otherStyle);
// card switches to otherStyle automatically.
```

Explicit always wins. Setting `Style = undefined` re-promotes the
implicit (if found).

## 5. Setter values

A `Setter.value` can be:

### A plain literal
```ts
new Setter(Border, 'CornerRadius', 4)
```

### A `Binding` (with a per-target sharing caveat)
A bare `Binding` has per-instance state (its `setOnValueChanged`
callback). Sharing the same `Binding` across two Visuals applying the
same `Style` would have the second target overwrite the first's
callback. For per-target safety, wrap in `SetterFactory`.

### A `SetterFactory<T>` — fresh value per target
```ts
import { SetterFactory } from '../runtime/index.js';

new Setter(Border, 'Background', new SetterFactory(
    target => DynamicResource(target, 'AccentBrush'),
))
```

The factory's `create(target)` runs at apply time on each Visual the
style applies to — produces a fresh `Binding` / `DynamicResource` per
target, so they don't share state.

When the produced value is a `Binding`, the apply machinery installs it
reactively at the StyleValue tier: the binding's resolved value is
pushed to the EVD slot, and changes propagate through. Disposing the
style (`Visual.Style = …`) tears down the binding subscription.

## 6. Triggers

A `PropertyTrigger` activates when a watched property equals a value;
applies its setters at the **TriggerValue** priority tier (above
StyleValue, below LocalValue). When the property changes such that the
trigger no longer matches, the setters unapply.

```ts
import { PropertyTrigger } from '../runtime/index.js';

const hoverTrigger = new PropertyTrigger(
    Border,                       // owner of the watched property
    'IsMouseOver',                // (hypothetical; no IsMouseOver yet)
    true,                         // value that activates
    [                             // setters applied while active
        new Setter(Border, 'Background', new SolidColorBrush(Color.FromHex('#dbeafe'))),
    ],
);

const style = new Style(Border, [
    new Setter(Border, 'Background', new SolidColorBrush(Color.White)),
], undefined, [hoverTrigger]);
```

Triggers fire on `AddPropertyChangedListener`, so any property change on
the watched property reevaluates. Match is `===` equality.

Trigger setters can use `SetterFactory` and reactive `Binding` values
just like regular setters.

`BasedOn` triggers append: a child style's triggers run after the
base's, last-applied-wins on conflict (via the TriggerValue tier).

## 7. `Style.Resources`

Lazy per-style `ResourceDictionary`. Consulted **first** by
`Visual.TryFindResource` when this style is the Visual's active style —
so a `Setter` value using `DynamicResource(target, 'Accent')` resolves
`'Accent'` in the style's own dict before walking the tree.

```ts
const style = new Style(Border, [
    new Setter(Border, 'Background', new SetterFactory(
        t => DynamicResource(t, 'Accent'),
    )),
]);
style.Resources.Set('Accent', new SolidColorBrush(Color.FromHex('#1e40af')));
```

`HasResources` lets you check whether the dict was allocated without
allocating one. `BasedOn` resources resolve transitively through
`Style.TryResolveResource`.

## 8. Value priority

Style sits between `LocalValue` and `InheritedValue` in the EVD
priority ladder:

```
Coerced > Animated > Binding > Local > Trigger > Style > Inherited > Default
```

Practical implications:
- A local set (`border.Background = brush`) always shadows the styled
  value. Clearing the local (`border.ClearValue('Background')`) re-
  exposes the styled value.
- A trigger value shadows the regular style setter for the same
  property. Trigger deactivation re-exposes the style setter.
- The styled value shadows inherited values. So a styled
  `Foreground` overrides an inherited `Foreground` from an ancestor.
- A `Binding` installed on a styled property shadows the style.

## 9. Limitations

- **No `DataTrigger`.** PropertyTrigger watches a property on the
  styled target. A `DataTrigger`-equivalent that watches a `Binding`'s
  resolved value would layer naturally on top — not built yet.
- **No `MultiTrigger`.** No AND-of-multiple-conditions trigger.
- **No `EventTrigger`.** WPF's EventTrigger fires animations on event
  occurrence. We don't have an animation system.
- **No `Style.Triggers` with `EnterActions` / `ExitActions`.** Triggers
  just apply / unapply their setters; no "run a Storyboard on activate"
  hook.
- **Setter.value cloning vs sharing.** A bare `Binding` shared across
  multiple targets of the same style hits a callback-overwrite issue
  (last attached target wins). `SetterFactory` is the workaround; the
  framework doesn't auto-clone Bindings.
- **No sealing of Setters / Triggers in practice.** `Seal()` sets
  `IsSealed` but the readonly fields prevent mutation already. Future
  mutable trigger / setter collections would gate on this flag.
- **Implicit style is reactive at the dictionary level, not tree level.**
  Subscribes to the resource dicts the Visual found at AttachLogical;
  doesn't auto-subscribe to dicts that appear later on ancestors that
  hadn't allocated `Resources` yet. (Same limitation as
  [DynamicResource](resources.md#6-limitations).)
- **No per-style namespace scoping for setter-resolved names.** Setter
  values don't go through a `FindName` lookup; they're literal values
  or factory-produced bindings.
</content>
