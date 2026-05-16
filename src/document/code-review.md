# Code Review

File-by-file findings from a top-to-bottom review of the library source. Severity tags:

- **BUG** — produces wrong output or fails silently
- **STALE** — comment / reference no longer matches the code
- **DEAD** — code path that's never reachable or has no effect
- **DESIGN** — a deliberate choice worth flagging because consumers may hit it
- **IMPROVE** — works fine, but the obvious next-step polish
- **OK** — read it, found nothing notable

---

## runtime/

### [runtime/metadata.ts](../runtime/metadata.ts)
- **OK.** Small flag enum + four predicates. Power-of-two values are correct; helpers do the bitwise check uniformly.

### [runtime/property-descriptor.ts](../runtime/property-descriptor.ts)
- **OK.** Clean. `IsReadOnly` and the metadata fall-through (`DefaultValue` / `MetaData` / `CoerceValue`) walk the `parent_descriptor` chain correctly. Presence-vs-undefined is handled via the `'field' in this.own` idiom so explicit `undefined` defaults survive overrides.
- **IMPROVE.** `MetaData` getter uses `this.parent_descriptor!.MetaData` — a non-null assertion in the fallback branch. If a root descriptor is ever constructed without `meta_data`, this throws at runtime. Currently every `RegisterProperty` path supplies `meta_data`, so the invariant holds, but it's not enforced by the type system.

### [runtime/effective-value.ts](../runtime/effective-value.ts)
- **OK.** The four base-value slots (animated / binding / local / coerced) plus the `inherited_value` cache and `Source` enum all reconcile cleanly through the `get value` priority switch.
- **DESIGN.** `set value` routes non-Binding writes through an installed `TwoWay` / `OneWayToSource` binding before falling back to local-replace. The fallthrough on writeback failure (`!binding.set_value(val)`) silently demotes to local — by design, but worth a doc note for consumers tracking source-of-truth issues.
- **OK.** `OnPropertyChange` fires the internal callback before the user-facing listeners. Mirrors WPF metadata-callbacks-before-PropertyChanged ordering.

### [runtime/binding.ts](../runtime/binding.ts)
- **DESIGN.** `PropertyPathSegment` and `PropertyPath` are not exported (only `Binding` is). Good encapsulation — consumers can't construct paths directly and bypass the binding pipeline.
- **OK.** `PropertyPath.parse` regex `\(([^)]+)\)|[^.[\]()]+` handles the three syntactic shapes (dotted, indexed, attached) cleanly.
- **IMPROVE.** `PropertyPath.OnChanged` uses `seg_i?.Model === model && seg_i?.PropertyName === property` inside a `for (i = 0; i < segments.length; i++)` loop where `seg_i` is always defined. The `?.` is unnecessary. Cosmetic.
- **OK.** `PropertyPath.set_value` correctly silently no-ops on unresolvable attached-segment writes — matches `read_segment`'s behavior, so reads and writes have symmetric failure modes.
- **DESIGN.** `compose_converters` makes the outer converter one-way (`convertBack` only follows the inner). This is intentional for `stringFormat` composition (formatting is lossy), but a user-supplied composite converter would lose round-trip capability. Documented in the function comment.

### [runtime/model.ts](../runtime/model.ts)
- **OK.** Composite-key storage (`${owner.name}.${name}`) + WeakMap-backed per-class bags handle both regular and attached usage with one mechanism. Class name collisions (two classes with the same `.name`) would silently collide on the storage key — possible but unusual; consumers minifying their code would need to disable class name mangling.
- **OK (fixed).** `find_descriptor_on` was a no-op wrapper around `find_descriptor` — removed; the two call sites now use `find_descriptor` directly. Comment clarifies that the same body is used for both implicit-owner and explicit-owner lookups (the call site picks which class to walk).
- **DEAD.** `constructor() { }` is an empty constructor. Removing it doesn't change semantics; keeping it signals "no setup needed" but adds two lines.
- **OK.** The implicit / explicit accessor overloads use `(arg1: any, arg2: any, arg3?: any)` then runtime-dispatch on `typeof arg1 === 'string'`. Loses some type safety inside the impl but the overload signatures keep callers honest.
- **DESIGN.** `class_registry` uses `WeakRef` values so classes can GC after their bag becomes unreachable. The lazy prune on `find_class` only handles the case where the class was collected — bags themselves keep classes alive via the WeakMap structural relationship, so this works correctly but is subtle.

### [runtime/visual.ts](../runtime/visual.ts)
- **OK.** Layout pipeline is correct. `Measure` clamps via `MinMax` resolution; `Arrange` applies Margin → alignment → `ArrangeOverride`.
- **DESIGN.** `ArrangedRect` is the final aligned rect (slot.X + alignment offset, renderSize), not the parent-given slot. Documented but subtle — hit-testing reads ArrangedRect for bounds, so the un-rendered margin/extra-slot area is invisible to hit testing. That's the WPF semantic too.
- **DESIGN.** `walk_inherited` and `refresh_inherited` use bracket access `p['property_values']` to bypass TypeScript's private modifier across same-class instances. Same pattern in `Single` / `Panel` for `propagate_*` overrides. Consistent across the codebase but worth flagging for new contributors.
- **OK.** `propagate_target_to_children` is a virtual no-op on `Visual` overridden by `Single` and `Panel`. Same pattern as `propagate_inheritance_to_children`.
- **IMPROVE.** Three parallel `propagate_*` methods (inheritance_to_children, inheritance_for, target_to_children) on `Single` and `Panel`, each a one-liner walking children. A single `walk_children(visitor)` would let all three become one-liners on `Visual`, with `Single` / `Panel` defining `walk_children` once. Pre-existing tech debt; works fine.
- **OK.** `static {}` initializer for property registration runs on first class reference (ES2022). Compatible with `target: ES2022` in tsconfig.
- **DESIGN.** `Width === NaN` is the "size to content" sentinel, matching WPF. Setting `Width = Number.NaN` re-enables MeasureOverride-driven sizing — works because every comparison with NaN returns false, so `set_property_value` always fires the change notification.

### [runtime/primitives.ts](../runtime/primitives.ts)
- **OK.** All value types are immutable + structural (`Equals` methods). Constructor parameter conventions consistent (PascalCase getters, lowercase params for `Color`'s `FromHex` helper).
- **DESIGN.** `Color` channels are typed as `number` but documented as "0..255". The constructor accepts any value (no clamping). `ToCss()` rounds for output but doesn't clamp negative or > 255 values. A `Color(-50, 300, 0)` produces `rgb(-50,300,0)` which most renderers will clamp themselves, but the API doesn't enforce.
- **OK (fixed).** `Color.FromHex` now validates hex characters up front with `/^[0-9a-fA-F]+$/` and throws a distinct "non-hex character" error. `Color.FromHex('#zzzzzz')` no longer returns a NaN-channel Color silently.
- **DESIGN.** `Rect.toString` uses `'×'` (Unicode U+00D7) for "width by height". Pretty in console but surprises any string-equality test.
- **OK.** `Matrix` row-vector convention matches SVG `matrix(a,b,c,d,e,f)` field order. The math comments in the header are correct.

### [runtime/drawing-context.ts](../runtime/drawing-context.ts)
- **OK.** One-line marker interface. The declaration-merging story is documented inline.

### [runtime/text-measurer.ts](../runtime/text-measurer.ts)
- **OK.** Clean interface + stateless default impl + module-level singleton.
- **DESIGN.** Weight/style are typed as `string` (not the `FontWeight` / `FontStyle` enums from visual-engine) so runtime doesn't pull visual-engine types. Consumers pass the enum value, which happens to be a matching string. Works because the enums are string enums.
- **OK.** Approximation uses code-point counting (`Array.from`) so emoji counts as one glyph rather than two UTF-16 units.

### [runtime/index.ts](../runtime/index.ts)
- **OK.** Barrel re-export. Types and values mixed; type-only exports use `type` modifier consistently.

---

## visual-engine/

### [visual-engine/brush.ts](../visual-engine/brush.ts)
- **OK.** Brush hierarchy with Opacity/Transform on base, type-specific properties on subclasses. Convenience constructors throughout.
- **DESIGN.** `GradientStops` default is a shared empty array. Two `LinearGradientBrush` instances reference the same default array; if a consumer mutates it (`brush.GradientStops.push(...)` would TypeScript-error on `readonly`, but `(brush.GradientStops as GradientStop[]).push(...)` would succeed), other instances see the mutation. Documented at the field level.
- **OK.** `ImageBrush.ImageSource` default is `undefined`, not a placeholder. Documented behavior.
- **DESIGN.** `Brush.Transform` is registered with `Transform.Identity` as default — shared singleton, harmless to share since `Transform.Identity.Matrix` is constant.

### [visual-engine/pen.ts](../visual-engine/pen.ts)
- **OK.** Pen with the WPF defaults (Brush=undefined, Thickness=1, DashStyle=Solid, etc.). Convenience constructor.
- **OK (fixed).** The Pen docstring's reference to the (long-removed) `MarkRenderDirty` has been refreshed to `InvalidateVisual`.
- **DESIGN.** Default `Pen.Brush = undefined` means a parameterless `new Pen()` produces a pen that paints nothing. Documented but counterintuitive — consumers will likely always pass a brush.
- **DESIGN.** `DashStyle.Dashes` is `readonly number[]`. Same shared-default mutability caveat as `GradientStops`.

### [visual-engine/geometry.ts](../visual-engine/geometry.ts)
- **OK.** Geometry hierarchy with `Transform` on base. Concrete subclasses register their shape-specific properties.
- **OK.** `PathSegment` hierarchy is plain value types (not Models) — discriminate via `instanceof`. Renderer dispatch is straightforward.
- **DESIGN.** `PathGeometry.Figures` and `GeometryGroup.Children` defaults are shared empty arrays — same caveat as gradient stops. Mutating the default would be a programmer error caught only by chance.
- **OK.** Default `FillRule.EvenOdd` matches WPF. Surprises SVG/Canvas users (those default to `nonzero`) but the choice is intentional.

### [visual-engine/transform.ts](../visual-engine/transform.ts)
- **OK.** Three transforms (Identity / Translate / Matrix). Bindable Model properties on the concretes.
- **DESIGN.** `(Transform as { Identity: Transform }).Identity = new IdentityTransform()` — type-assertion hack to assign to a declared `readonly` static. Necessary because `IdentityTransform extends Transform` and TypeScript can't forward-reference the subclass inside a static initializer block. The pattern is documented and isolated.
- **OK.** `IdentityTransform` is private (not exported). Singleton-only access via `Transform.Identity`.

### [visual-engine/formatted-text.ts](../visual-engine/formatted-text.ts)
- **OK.** Value class with all readonly fields. Constructor uses lowercase param names to avoid shadowing the `FontWeight` / `FontStyle` enums it depends on — a workaround for TypeScript's parameter property + same-name-type issue.

### [visual-engine/drawing-context.ts](../visual-engine/drawing-context.ts)
- **OK.** Declaration merging into runtime's marker interface. The augmented type is re-exported for direct import.
- **DESIGN.** Method surface deliberately small (5 methods). Each additional draw primitive is a new method on a published interface, so the choice to keep it minimal until concrete demand exists is correct.

### [visual-engine/svg-drawing-context.ts](../visual-engine/svg-drawing-context.ts)
- **OK (fixed).** `formatNumber` collapsed to a one-liner returning `n.toString()`. JS's default toString already omits the trailing `.0` on integers and emits a minimal decimal otherwise, which is exactly what SVG attributes want — the previous conditional was dead code with no behavior difference.
- **OK.** `DrawText` baseline shift uses `text.Metrics?.Ascent ?? text.FontSize * 0.85`. Falls back gracefully when no metrics are present.
- **OK.** XML escaping helpers cover the three characters that matter inside text content (`& < >`) and the four that matter in attribute values (`& < " >` — `>` is technically optional inside `"..."` but escaping it is safe).
- **DESIGN.** `DrawGeometry` throws `NotImplemented` — loud failure when an unimplemented path gets exercised. Better than silently producing nothing.

### [visual-engine/font-metrics-measurer.ts](../visual-engine/font-metrics-measurer.ts)
- **OK.** opentype.js-backed measurer. Storage Map-of-Maps keyed on family then weight|style.
- **OK.** `measureWidth` is char-by-char + manual kerning, deliberately avoiding `font.getAdvanceWidth` to dodge the GSUB pipeline. Tradeoff documented in the body comment.
- **DESIGN.** `resolveFont` fallback chain: exact match → `normal|normal` → any variant → undefined. The "any variant" fallback prevents Measure from returning approximate output just because the consumer asked for a weight that isn't loaded — defensible, but means using an unloaded bold variant silently degrades to whichever loaded variant exists. Worth documenting at the API level for consumers building style pickers.
- **IMPROVE.** No measurement caching. Each Measure call re-parses the text glyph-by-glyph; for a TextBlock that re-measures across layout passes, that's redundant. LRU cache keyed on `(text, fontFamily, fontSize, weight, style)` would be a clean win.
- **OK.** OS/2 table lookup for weight/style detection uses bracket access (`font.tables['os2']`) because the type declaration in `@types/opentype.js` is `{ [tableName: string]: Table }` — dot access wouldn't compile.

### [visual-engine/google-font-loader.ts](../visual-engine/google-font-loader.ts)
- **OK.** Clean async loader. CSS API → parse `@font-face` blocks → fetch each binary → register.
- **DESIGN.** User-Agent spoof to force TTF response. Documented limitation: if Google ever ignores the UA hint and serves WOFF2, opentype.js will throw on parse with `Unsupported OpenType signature` — the consumer will see a clear error.
- **OK.** Dedupes by (weight, style, url) to avoid double-fetch when Google emits multiple `@font-face` blocks per unicode-range subset for the same TTF.
- **OK.** Error messages include URL / status code so failures are diagnosable.

### [visual-engine/presentation-target.ts](../visual-engine/presentation-target.ts)
- **OK.** Abstract base implementing `VisualHost`. Subclasses (`HtmlTarget` / `FileTarget` / `HeadlessTarget`) extend with host-specific concerns.
- **OK.** `Content` setter overrides the typed accessor to cascade `SetTarget(this)` through the new subtree and `SetTarget(undefined)` through the old. Bracket access bypasses TypeScript's protected-member check — same pattern as elsewhere.
- **DESIGN.** `TextMeasurer` is `public TextMeasurer: TextMeasurer = APPROXIMATE_TEXT_MEASURER` — settable. Consumers swap to a `FontMetricsMeasurer` after construction. The `readonly` declaration on `VisualHost` is satisfied by the field being assignable from concrete-class context but not from the interface — a TypeScript-ism.
- **DESIGN.** `OnMeasureInvalidated` / `OnArrangeInvalidated` / `OnRenderInvalidated` are no-ops on the base. Concrete subclasses override to push onto a per-phase dirty queue once a renderer is wired up. `HeadlessTarget.Render` is fully synchronous and doesn't use them; `HtmlTarget` has them stubbed pending the SvgRenderer.

### [visual-engine/targets/html-target.ts](../visual-engine/targets/html-target.ts)
- **OK.** DOM-side wiring: `<svg>` mount, `ResizeObserver`, `devicePixelRatio` read.
- **OK.** `Canvas` backend explicitly throws — loud failure beats silent unimplementation.
- **DESIGN.** Renderer instantiation is `TODO step 12.8`. Setting `Content` is observable but no painting happens yet.
- **DEAD.** `private renderer: SvgRenderer | undefined; // build-order step 12.8` is commented-out. Will activate when the renderer lands.

### [visual-engine/targets/file-target.ts](../visual-engine/targets/file-target.ts)
- **OK.** Scaffold. `Save()` returns a rejected Promise with a clear message.
- **OK.** DPI handling correct: `DeviceScale = dpi / 96` (96 DPI is the DIP baseline).

### [visual-engine/targets/headless-target.ts](../visual-engine/targets/headless-target.ts)
- **OK.** Full one-shot render pipeline: paint Background → Measure → Arrange → walk tree pushing translates.
- **DESIGN.** `childrenOf` dispatches via `instanceof Single` / `instanceof Panel`. Adding a new Visual subtype with children (e.g., a future ItemsControl) requires touching this method. Pre-existing design tension; a `visitChildren(visitor)` virtual on Visual would centralize the dispatch.

---

## Controls/

### [Controls/border.ts](../Controls/border.ts)
- **OK.** MeasureOverride / ArrangeOverride correctly account for `BorderThickness + Padding` insets on each axis.
- **DESIGN.** RenderOverride uses `BorderThickness.Top` for stroke thickness — non-uniform borders render as uniform. Documented limitation; per-side stroke needs a path geometry.
- **DESIGN.** `CornerRadius` is registered with `MetaData.Render` but the RenderOverride doesn't honor it (no `DrawRoundedRectangle` in the DC interface yet). Setting CornerRadius invalidates render but has no visual effect. Documented limitation.
- **IMPROVE.** RenderOverride allocates a fresh `Pen` per render (`new Pen(this.BorderBrush, thickness)`). Cheap but unnecessary churn; could cache and invalidate when BorderBrush / BorderThickness change.

### [Controls/text-block.ts](../Controls/text-block.ts)
- **OK.** Font properties all `MetaData.Inherits` — cross-class inheritance via the standard mechanism.
- **OK.** Caches `_metrics` between MeasureOverride and RenderOverride so SvgDrawingContext can use real `Ascent` for baseline.
- **DESIGN.** Empty text returns `Size.Zero` and skips DrawText. Distinct from a single-space string (which produces a measurable but invisible glyph).

### [Controls/index.ts](../Controls/index.ts)
- **OK.** Two-line barrel.

---

## Top-priority follow-ups

All four small items flagged at first-pass review have been addressed in
the same commit that landed this document:

1. ✅ `svg-drawing-context.ts` `formatNumber` — collapsed to one line.
2. ✅ `pen.ts` MarkRenderDirty reference — refreshed to `InvalidateVisual`.
3. ✅ `model.ts` `find_descriptor_on` — removed; call sites use `find_descriptor` directly.
4. ✅ `primitives.ts` `Color.FromHex` validation — rejects non-hex characters with a distinct error.

The remaining bigger items below are pre-existing tech debt, not bugs.
Pick up next time the surrounding code gets touched:

- **LRU caching in `FontMetricsMeasurer`** — the same `(text, family, size,
  weight, style)` measurement re-walks every glyph on each call. A small
  bounded cache would be a clean win on layout-heavy passes.
- **`walk_children(visitor)` refactor on `Visual`** — collapses the three
  parallel `propagate_*` methods on `Single` / `Panel` (inheritance subtree,
  inheritance for descriptor, target) into a single tree-walk primitive
  with three callers.
- **Shared empty-array default hardening** — `Object.freeze([])` for the
  shared defaults of `GradientStops`, `PathGeometry.Figures`,
  `GeometryGroup.Children` so a buggy consumer mutating "their" empty
  array can't accidentally affect other instances.
- **`Color` channel clamping** — constructor accepts any number; values
  outside [0, 255] propagate through `ToCss()` and rely on the renderer
  to clamp.
