import type { Brush } from './drawing/brush.js';
import { Model } from '../runtime/model.js';
import { peekPropertyBag, propertyValues } from '../runtime/model-internals.js';
import type { PropertyDescriptor } from '../runtime/property-descriptor.js';
import { PropertyValueSource } from '../runtime/binding/effective-value.js';
import { MetaData, affectsArrange, affectsMeasure, affectsRender, inherits } from '../runtime/metadata.js';

import { NameScope } from './namescope.js';
import { ObservableCollection } from '../runtime/observable-collection.js';
import { ResourceDictionary, type ResourceKey } from '../runtime/resource-dictionary.js';
import { Application } from '../runtime/application.js';
import { Setter, Style, PropertyTrigger, MultiTrigger, DataTrigger, MultiDataTrigger } from '../runtime/style.js';
import { Point, Rect, Size, Thickness } from './primitives.js';
import type { DrawingContext } from './drawing-context.js';
import type { TextMeasurer } from './text-measurer.js';
import type {
    PointerEventArgs,
    WheelEventArgs,
    KeyEventArgs,
    TextInputEventArgs,
    FocusEventArgs,
    DragEventArgs,
} from './routed-event.js';
import { Storyboard } from './animation/storyboard.js';
import type { AnimationTimeline } from './animation/timeline.js';
import { applyImplicitTransition } from './animation/implicit-transition-engine.js';
import { PropertyTransition } from './animation/property-transition.js';
import { EventTrigger } from '../runtime/event-trigger.js';
import { DragDrop, DragDropEffects, type DataObject, type DragPreviewKind } from './drag-drop.js';
import type { Effect } from './drawing/effect.js';
import type { Transform } from './drawing/transform.js';
import type { Geometry } from './geometry/geometry.js';
import { StyleApplicator } from './style-applicator.js';
import { TriggerHost } from './trigger-host.js';
import { ResourceResolver } from './resource-resolver.js';


// Routed event names that map to the per-instance _routedListeners
// registry. These are the public NAMES authors use in `on Xxx { … }`
// markup; the routed-event dispatcher fires them after each
// bubble-phase virtual.
/** @internal — shared with TriggerHost (§ 1.8) for the
 *  "is this RoutedEvent a known generic dispatch name" check inside
 *  EventTrigger install. Library-internal: not re-exported from any
 *  barrel. */
export const KNOWN_ROUTED_EVENTS = new Set([
    'PointerDown', 'PointerUp', 'PointerMove', 'PointerWheel',
    'PointerEnter', 'PointerLeave',
    'KeyDown', 'KeyUp', 'TextInput',
    'GotFocus', 'LostFocus',
    'DragEnter', 'DragLeave', 'DragOver', 'Drop',
]);

// Snapshot-then-iterate helper used by every per-instance listener
// fan-out — routed events, Loaded, Unloaded, DynamicResource
// re-wire. Without the snapshot, a listener that registers /
// unregisters another listener mid-fire would mutate the Set / Array
// we're iterating; with it, the iteration sees a stable view and
// the registration takes effect on the NEXT fire. Same pattern that
// used to be inlined four times (§ 1.16). Accepts iterables so both
// Set<Fn> and Array<Fn> sites share the same helper.
/** @internal — shared with Element (§ Phase B) for its lifecycle
 *  listener fan-outs. Library-internal; not re-exported. */
export function safeFire<A extends unknown[]>(
    listeners: Iterable<(...args: A) => void> | undefined,
    ...args: A
): void
{
    if (listeners === undefined) return;
    // `Array.from` for both Set and Array — a Set iterator would
    // otherwise mutate-during-iteration if a listener calls add or
    // delete on the same Set.
    for (const l of Array.from(listeners)) l(...args);
}

// Horizontal positioning of a Visual within its parent-given slot when
// the rendered area is smaller than the slot. Stretch fills the slot
// when no explicit Width is set; with an explicit Width, Stretch falls
// back to Center (WPF semantics).
export enum HorizontalAlignment
{
    Left    = 'left',
    Center  = 'center',
    Right   = 'right',
    Stretch = 'stretch',
}

// Vertical counterpart of HorizontalAlignment.
export enum VerticalAlignment
{
    Top     = 'top',
    Center  = 'center',
    Bottom  = 'bottom',
    Stretch = 'stretch',
}

// WPF-parity Visibility. Controls whether a Visual is rendered, takes
// part in hit-testing, AND occupies layout space:
//
//   * Visible   — measured, arranged, rendered, hit-tested. Default.
//   * Hidden    — measured + arranged normally (still occupies its slot
//                 in the parent), NOT rendered, NOT hit-tested. Used to
//                 reserve space without painting (placeholder spacers).
//   * Collapsed — DesiredSize forced to Zero, arrange skipped, NOT
//                 rendered, NOT hit-tested. The visual takes NO space —
//                 siblings flow as if it weren't in the tree. This is
//                 what consumers want when toggling sections on/off.
//
// String values mirror member names so .mu parsers can write
// `[Visibility=Collapsed]` literally without a separate enum mapping.
//
// Layout impact is enforced inside Visual.Measure / Visual.Arrange.
// Render suppression is enforced both inside Visual.Render (so headless
// targets honour it) and at the SVG-renderer walk (which also sets
// pointer-events=none so the dispatcher's hit-test source-finding skips
// the subtree — no separate gate in routed-event.ts).
export enum Visibility
{
    Visible   = 'Visible',
    Hidden    = 'Hidden',
    Collapsed = 'Collapsed',
}

// What a Visual sees of its host. Concrete implementation lives in the
// visual-engine layer (PresentationTarget and its subclasses). Defined
// here so Visual has typed references for routing layout/render
// invalidation without runtime importing visual-engine. The visual-
// engine class satisfies this contract structurally.
export interface VisualHost
{
    OnMeasureInvalidated(visual: Visual): void;
    OnArrangeInvalidated(visual: Visual): void;
    OnRenderInvalidated(visual: Visual): void;

    // Per-environment text measurement service. Visuals that need to
    // size text (TextBlock, future label-bearing controls) read this
    // during MeasureOverride. Defaults to APPROXIMATE_TEXT_MEASURER on
    // PresentationTarget unless a concrete subclass wires something more
    // accurate (FontMetricsMeasurer with loaded fonts, a future
    // CanvasTextMeasurer in HtmlTarget, etc.).
    readonly TextMeasurer: TextMeasurer;

    // Optional focus surface — populated on PresentationTarget by
    // delegating to its InputManager. Visual.Focus() / Blur() use this
    // back-channel; tests that mock VisualHost without focus support
    // can omit the methods and Focus() degrades to a no-op.
    SetFocus?(visual: Visual | undefined): void;
    GetFocusedVisual?(): Visual | undefined;

    // Overlay layer — attached as the visual hop of `Visual.AttachOverlayChild`
    // so popups / dropdowns / tooltips paint above the main Content
    // tree. The host materialises the layer lazily on first use. Visual
    // calls these through the VisualHost reference (not by importing
    // PresentationTarget) so the runtime layer stays independent of
    // visual-engine. PresentationTarget supplies the concrete shape.
    AttachOverlay(visual: Visual): void;
    DetachOverlay(visual: Visual): void;
}

// Tree-aware Model with WPF-style layout + render lifecycle.
//
// Public lifecycle entry points (called by the layout/render pass — do
// not override directly):
//   * Measure(availableSize)  → caches DesiredSize via MeasureOverride
//   * Arrange(finalRect)      → caches RenderSize + ArrangedRect via ArrangeOverride
//   * Render(dc)              → delegates to RenderOverride
//
// Subclass override points (where layout / drawing policy lives):
//   * MeasureOverride(availableSize): Size  — return the desired size
//   * ArrangeOverride(finalSize): Size      — place children, return actual used size
//   * RenderOverride(dc)                    — emit drawing primitives for THIS Visual
//
// Invalidation API (call these when something that affects layout or
// rendering changes — usually fired automatically through OnPropertyChanged
// per the property's MetaData flags):
//   * InvalidateMeasure()   — measure + arrange cache invalidated, host notified
//   * InvalidateArrange()   — arrange cache invalidated, host notified
//   * InvalidateVisual()    — render request, host notified
//
// Tree + host:
//   * parent: Visual | undefined  — set by Attach / Detach
//   * target: VisualHost | undefined — back-pointer to the PresentationTarget
//     owning this tree, propagated through Attach / Detach for O(1) lookup
//
// Plain Models stay storage-only. Only Visuals participate in layout,
// rendering, the visual tree, and property value inheritance.
export class Visual extends Model
{
    // Typed-key DPs. Inline static initializers run in declaration order
    // when the class is loaded, so by the time the first Visual is
    // constructed every key exists and every descriptor is registered.
    // The string names below are still the canonical binding-path
    // identities (`Binding(t, 'Width')` resolves them); the typed keys
    // are an opt-in faster, type-safe path for direct accessor code.

    // NaN is the "not set" sentinel for explicit size constraints —
    // matches WPF FrameworkElement.Width / .Height. Marked Measure so
    // changing either invalidates the layout pass.
    public static readonly WidthKey      = Model.RegisterProperty<number>(Visual, 'Width',     Number.NaN,               MetaData.Measure);
    public static readonly HeightKey     = Model.RegisterProperty<number>(Visual, 'Height',    Number.NaN,               MetaData.Measure);
    public static readonly MinWidthKey   = Model.RegisterProperty<number>(Visual, 'MinWidth',  0,                        MetaData.Measure);
    public static readonly MinHeightKey  = Model.RegisterProperty<number>(Visual, 'MinHeight', 0,                        MetaData.Measure);
    public static readonly MaxWidthKey   = Model.RegisterProperty<number>(Visual, 'MaxWidth',  Number.POSITIVE_INFINITY, MetaData.Measure);
    public static readonly MaxHeightKey  = Model.RegisterProperty<number>(Visual, 'MaxHeight', Number.POSITIVE_INFINITY, MetaData.Measure);
    public static readonly HorizontalAlignmentKey = Model.RegisterProperty<HorizontalAlignment>(Visual, 'HorizontalAlignment', HorizontalAlignment.Stretch, MetaData.Arrange);
    public static readonly VerticalAlignmentKey   = Model.RegisterProperty<VerticalAlignment>(  Visual, 'VerticalAlignment',   VerticalAlignment.Stretch,   MetaData.Arrange);

    // Outer spacing around this Visual. Eats into availableSize at
    // Measure time, inflates DesiredSize so the parent reserves the
    // space, and offsets the rendered area at Arrange time. Mirrors
    // WPF FrameworkElement.Margin.
    public static readonly MarginKey = Model.RegisterProperty<Thickness>(Visual, 'Margin', Thickness.Zero, MetaData.Measure);

    // Style isn't inherited (each Visual carries its own); changing
    // it can affect Measure/Arrange/Render via whichever setters
    // it contains, but the Style property itself doesn't need a
    // metadata flag — the underlying property changes from
    // SetStyleValue fire their own invalidation per their own
    // metadata. MetaData.None keeps OnPropertyChanged from doing
    // redundant work.
    public static readonly StyleKey = Model.RegisterProperty<Style | undefined>(Visual, 'Style', undefined, MetaData.None);

    // Effect — a renderer-side post-process applied to the Visual's
    // painted output. Concrete effect classes live in visual-engine
    // (DropShadowEffect, MaterialElevationEffect). The runtime side
    // accepts anything matching the Effect contract (toCssFilter())
    // so visual-engine can ship classes without runtime taking a
    // value-import dependency on it.
    //
    // MetaData.Render so changing the Effect re-emits via the
    // renderer (which reads the Effect during repaintOwn). The
    // renderer is allowed to no-op when the new filter string equals
    // the previously applied one — equality is the contract this DP
    // doesn't enforce.
    public static readonly EffectKey = Model.RegisterProperty<Effect | undefined>(Visual, 'Effect', undefined, MetaData.Render);

    // Background is the inherited fill brush — kept on Visual so Border
    // / Panel / Canvas / ContentControl all read it from the same slot.
    // Shape primitives expose their own typed `Fill: Brush | undefined`
    // DP on `Shape` and ignore Visual.Background entirely. Subclasses
    // that don't paint (Panel, ContentControl, …) leave Background at
    // its default undefined with zero render cost.
    public static readonly BackgroundKey      = Model.RegisterProperty<Brush | undefined>(Visual, 'Background',      undefined, MetaData.Render);

    // Affine transform applied to the Visual's painted output (and the
    // painted output of every descendant) at render time. WPF parity —
    // UIElement.RenderTransform. Does NOT participate in layout: Measure
    // and Arrange ignore RenderTransform, so a 100×40 button that's
    // scaled 2× still reserves 100×40 in its parent's layout slot. Pair
    // with Margin / explicit Width/Height for layout-affecting shape
    // changes. Default undefined ≡ identity.
    //
    // MetaData.Render so a whole-DP swap (`v.RenderTransform = new
    // RotateTransform(45)`) invalidates the Visual. Inner-property
    // changes on the Transform itself (a RotateTransform's Angle
    // tweening, a ScaleTransform's ScaleX bound to a slider) reach the
    // renderer through the Transform `_setRenderInvalidator` hook,
    // wired below in OnPropertyChanged when the DP is set / cleared.
    //
    // Hit-testing: the SVG renderer applies the transform via the
    // outer <g>, so `elementsFromPoint` automatically projects the
    // input coordinate into the visual's pre-transform local space —
    // a rotated button hit-tests by the rotated shape, matching WPF.
    public static readonly RenderTransformKey = Model.RegisterProperty<Transform | undefined>(
        Visual, 'RenderTransform', undefined, MetaData.Render);

    // Origin of the RenderTransform expressed as a fraction of the
    // Visual's RenderSize (each axis is in 0..1, values outside the
    // unit interval are accepted and shift the pivot outside the
    // bounding rect). (0, 0) means top-left — WPF parity default;
    // (0.5, 0.5) is the center (typical for rotations / scaling);
    // (1, 1) is the bottom-right. The renderer translates by
    // (Origin.X · RenderSize.Width, Origin.Y · RenderSize.Height)
    // before applying the matrix and back after, so a 45°
    // RotateTransform with Origin (0.5, 0.5) spins the visual around
    // its own center rather than around its top-left corner.
    public static readonly RenderTransformOriginKey = Model.RegisterProperty<Point>(
        Visual, 'RenderTransformOrigin', Point.Zero, MetaData.Render);

    // Per-subtree paint opacity. Default 1 = fully opaque. The SVG
    // renderer mirrors this onto the outer <g>'s `opacity` attribute, so
    // children of an opacity<1 visual visually fade with the parent
    // (SVG's `opacity` composes multiplicatively across nested groups).
    // WPF parity: Opacity is paint-only — hit-testing ignores it, so a
    // 0-opacity visual still receives pointer events unless
    // IsHitTestVisible is also false. Authors hide-without-interaction
    // by combining the two; pure visual fades flip just Opacity.
    public static readonly OpacityKey = Model.RegisterProperty<number>(Visual, 'Opacity', 1, MetaData.Render);

    // Type-keyed lookup for the theme-supplied default Style. Read-only
    // at the instance level (no public per-instance writes); subclasses
    // opt in by overriding metadata in their static init:
    //
    //     class Button extends ContentControl {
    //         static {
    //             Model.OverrideMetadata(Button, Visual.DefaultStyleKeyKey,
    //                 { default_value: Button });
    //         }
    //     }
    //
    // The value is a class function used as a key into the resource
    // chain. resolve_theme_style runs TryFindResource(DefaultStyleKey)
    // and applies the matching Style on a fallback slot below the user
    // ImplicitStyle. A subclass that doesn't override DefaultStyleKey
    // inherits its base's value, so MyFancyButton renders with Button's
    // theme chrome until it opts into its own. Default is undefined —
    // a Visual whose DefaultStyleKey is undefined skips theme lookup.
    //
    // Key is public so subclasses can pass it to Model.OverrideMetadata;
    // the read-only gate on set_property_value / by-name paths still
    // prevents per-instance writes (set_property_value_with_key is the
    // documented framework-internal escape hatch).
    public static readonly DefaultStyleKeyKey = Model.RegisterReadOnlyProperty<Function | undefined>(
        Visual, 'DefaultStyleKey', undefined, MetaData.None,
    );

    // Optional clip geometry applied to this Visual and its visual
    // subtree at render time. Typed as `unknown` here so the runtime
    // doesn't depend on visual-engine's Geometry class — the host's
    // DrawingContext.PushClip is what reads it. MetaData.Render so
    // changes re-render.
    public static readonly ClipKey = Model.RegisterProperty<unknown>(Visual, 'Clip', undefined, MetaData.Render);

    // Ambient data root for bindings. Inherits down the logical tree so
    // a binding written as `$Path` on a descendant resolves against the
    // nearest ancestor's DataContext. No measure / arrange / render
    // impact — pure data plumbing — hence the inherits-only flag.
    public static readonly DataContextKey = Model.RegisterProperty<unknown>(Visual, 'DataContext', undefined, MetaData.Inherits | MetaData.IsAnimationProhibited);

    // Disabled-state surface. WPF parity: a disabled Visual swallows
    // pointer / keyboard input across its entire subtree, and templates
    // can observe `when (not IsEnabled)` to dim the chrome. Inherited
    // downward — setting it on a control disables every descendant —
    // matching WPF's FrameworkElement.IsEnabled (which uses CoreEnabled
    // AND the inherited Inherited value). Default `true` so untouched
    // visuals stay interactive.
    //
    // Input gating lives in the routed-event dispatcher
    // (input/routed-event.ts): dispatchPointer / dispatchPointerDirect
    // / dispatchKey skip tunnels/bubbles when any ancestor (or the
    // source itself) reports IsEnabled=false. Enter/Leave still update
    // IsMouseOver on enabled ancestors so hover chrome on a disabled
    // descendant's surrounding container behaves naturally.
    public static readonly IsEnabledKey = Model.RegisterProperty<boolean>(
        Visual, 'IsEnabled', true, MetaData.Inherits | MetaData.IsAnimationProhibited);

    // Input state flags. Maintained by the InputManager + per-control
    // press chrome (Button / ClickableBorder), not by user code.
    // Promoted to `RegisterReadOnlyProperty` in § 1.13 — the
    // "read-only by convention" comment that lived here is now an
    // enforced invariant: external `set_property_value` writes throw.
    // Maintainers route their writes through the typed `_setIsXxx`
    // @internal methods below (which use the privileged
    // `set_property_value_with_key` path under the hood).
    public static readonly IsMouseOverKey = Model.RegisterReadOnlyProperty<boolean>(Visual, 'IsMouseOver', false, MetaData.None);
    public static readonly IsPressedKey   = Model.RegisterReadOnlyProperty<boolean>(Visual, 'IsPressed',   false, MetaData.None);

    // Implicit per-DP transition specs — CSS-`transition`-style. When a
    // DP whose name matches a PropertyTransition.Property changes on
    // this Visual, the implicit-transition engine cancels any running
    // animation for that DP and starts a fresh one from oldValue →
    // newValue over the spec's Duration / Easing. Unmatched DPs snap as
    // usual. See animation/implicit-transition-engine.ts for the
    // mechanism + type dispatch (number / Color / Thickness only;
    // brushes route through their own scheme-transition factory).
    //
    // The DP is undefined by default (no allocation cost when no
    // transitions are declared). The `Transitions` JS getter below
    // auto-instantiates the collection on first access — matches the
    // mutate-then-set pattern of `CommandBindings` / `InputBindings`
    // on Control. The compiler's `Transitions { … }` body block routes
    // its inner PropertyTransition elements through this getter, so
    // markup authoring never deals with the undefined case.
    public static readonly TransitionsKey = Model.RegisterProperty<ObservableCollection<PropertyTransition> | undefined>(
        Visual, 'Transitions', undefined, MetaData.None);

    // Drop-target flags. Maintained by the InputManager during drag
    // dispatch, in lock-step with IsMouseOver during normal hover.
    // AllowDrop is consumer-set (defaults to false so a random Visual
    // never accidentally accepts drops); IsDragOver is framework-written
    // and behaves like IsMouseOver — public read, no public setter
    // (Style triggers like `when{ IsDragOver }` read it).
    public static readonly AllowDropKey  = Model.RegisterProperty<boolean>(Visual, 'AllowDrop',  false, MetaData.None);
    // IsDragOver — read-only as of § 1.13; InputManager writes
    // through `_setIsDragOver`. See IsMouseOver / IsPressed for the
    // pattern.
    public static readonly IsDragOverKey = Model.RegisterReadOnlyProperty<boolean>(Visual, 'IsDragOver', false, MetaData.None);

    // Hit-test opt-out (WPF parity — UIElement.IsHitTestVisible). When
    // false, this visual AND its visual subtree are transparent to the
    // hit-test pipeline: pointer events fall through to whatever sits
    // below. Pure-decoration adorners (insertion lines, validation
    // chrome, drag ghosts) flip this off so they don't intercept clicks
    // meant for the controls they decorate. Default true — opt-out
    // model matches WPF.
    //
    // Renderer side: a false value emits `pointer-events="none"` on
    // the outer <g>, which CSS-cascades to every descendant element.
    // MetaData.Render so flips repaint without further wiring.
    public static readonly IsHitTestVisibleKey = Model.RegisterProperty<boolean>(Visual, 'IsHitTestVisible', true, MetaData.Render);

    // WPF-parity Visibility (see the enum's doc for the three semantics).
    // Measure | Arrange | Render — a Visible↔Collapsed flip changes the
    // DesiredSize the parent reads (need re-measure), a Visible↔Hidden
    // flip keeps DesiredSize but changes paint + hit-test output. The
    // single Render flag handles the paint refresh on both transitions;
    // Measure | Arrange ensure the parent re-lays out around a newly
    // (un)collapsed child. Default Visible matches WPF and is what every
    // existing visual already assumes — switching the default later
    // would silently break every consumer that never sets the DP.
    public static readonly VisibilityKey = Model.RegisterProperty<Visibility>(
        Visual, 'Visibility', Visibility.Visible,
        MetaData.Measure | MetaData.Arrange | MetaData.Render);

    // Precise-shape hit testing (§19.2.7). When set, the target consults
    // Geometry.Contains(localPoint) after the browser-side
    // elementsFromPoint pick — if the geometry rejects the point, the
    // hit walk falls through to the parent Visual. Default undefined
    // keeps today's AABB hit-testing behavior.
    //
    // The geometry is interpreted in this Visual's local coordinate
    // space (the outer <g>'s frame on the SVG backend). MetaData.None —
    // the renderer doesn't paint geometry; the input pipeline only
    // reads it on hit-test.
    //
    // Pairs with §5.7: a Visual with HitTestGeometry set is by
    // definition interactive in the precise-shape sense, so the SVG
    // renderer can drop the `mural-hit` pad — the geometry IS the pad.
    public static readonly HitTestGeometryKey = Model.RegisterProperty<Geometry | undefined>(
        Visual, 'HitTestGeometry', undefined, MetaData.None);

    // Hover-cursor affordance. String value passes through to the SVG
    // renderer which stamps it as the `cursor` attribute on the outer
    // <g>; the host inherits SVG's standard cursor cascade. Accepts any
    // CSS cursor keyword ('default', 'pointer', 'ew-resize', 'ns-resize',
    // 'grab', 'crosshair', …) or a `url(...)` value. Default `undefined`
    // means "inherit from the parent visual / host" — no attribute
    // emitted, browser's default cursor wins. MetaData.Render so flips
    // repaint without further wiring. WPF parity — UIElement.Cursor.
    public static readonly CursorKey = Model.RegisterProperty<string | undefined>(
        Visual, 'Cursor', undefined, MetaData.Render);

    // Declarative drag source. When IsDraggable = true the framework
    // installs a PointerDown / Move / Up latch that calls OnDragStart
    // after the pointer travels > DragDrop.DragThreshold pixels. The
    // callback returns either null (cancel) or
    // { data, effects, preview? } which the framework feeds straight
    // into DragDrop.DoDragDrop. Spec § 6.
    public static readonly IsDraggableKey = Model.RegisterProperty<boolean>(
        Visual, 'IsDraggable', false, MetaData.None);

    public static readonly OnDragStartKey = Model.RegisterProperty<
        ((source: Visual) =>
            {
                data: DataObject;
                effects: DragDropEffects;
                preview?: DragPreviewKind;
                // Optional source-side hooks (backlog 8.3). When
                // returned, the framework wires them onto the
                // freshly-started DragSession before DoDragDrop hands
                // control back to the InputManager. Lets a declarative
                // drag source attach GiveFeedback / QueryContinueDrag
                // without imperatively reaching into the session.
                onFeedback?:      (effect: DragDropEffects) => void;
                onContinueQuery?: () => boolean;
            } | null
        ) | undefined
    >(Visual, 'OnDragStart', undefined, MetaData.None);

    // Focusable — opt-in for keyboard focus. Default false so a random
    // Border / TextBlock / Panel never accidentally swallows keys;
    // controls that handle keyboard input (TextBox, Button) set this to
    // true. The InputManager refuses to focus a Visual whose Focusable
    // is false.
    public static readonly FocusableKey = Model.RegisterProperty<boolean>(Visual, 'Focusable', false, MetaData.None);

    // IsFocused — true when this Visual is the InputManager's current
    // focused target. Read-only from consumer code; setting it directly
    // does NOT actually take focus (use Focus() for that). The flag is
    // here so Style triggers can branch on it
    // (`when{ IsFocused }{ BorderBrush = #1976d2 }`) and so tests can
    // assert state without reaching into the InputManager.
    public static readonly IsFocusedKey = Model.RegisterReadOnlyProperty<boolean>(Visual, 'IsFocused', false, MetaData.None);

    // Generic consumer-side handle, mirroring WPF's FrameworkElement.Tag.
    // Common use: bind a domain object to a Visual so a click handler /
    // selection listener can recover the consumer's data without an
    // external WeakMap. Pure storage — never read by the framework
    // itself — hence MetaData.None.
    public static readonly TagKey = Model.RegisterProperty<unknown>(Visual, 'Tag', undefined, MetaData.None);

    // Input state — read-only mirrors of the DPs. Both flags are set
    // exclusively by the InputManager during pointer dispatch.
    public get IsMouseOver(): boolean { return this.get_property_value(Visual.IsMouseOverKey); }
    public get IsPressed():   boolean { return this.get_property_value(Visual.IsPressedKey); }

    /** @internal — InputManager only. Typed writeback for the
     *  read-only `IsMouseOver` DP (§ 1.13). Routes through
     *  `set_property_value_with_key` — the registered class's
     *  privileged write — so the read-only contract holds for
     *  external callers. */
    public _setIsMouseOver(value: boolean): void
    {
        this.set_property_value_with_key(Visual.IsMouseOverKey, value);
    }

    /** @internal — Button / ClickableBorder / InputManager only.
     *  Typed writeback for the read-only `IsPressed` DP (§ 1.13). */
    public _setIsPressed(value: boolean): void
    {
        this.set_property_value_with_key(Visual.IsPressedKey, value);
    }

    // Read-only getter — returns `undefined` when no transitions
    // collection has been allocated. Bindings / consumers wanting the
    // pure-read shape touch this. Mutators (the compiler's
    // `Transitions { … }` block, runtime push / remove) call
    // `EnsureTransitions()` below, which lazy-allocates AND fires the
    // DP write that subscribers expect.
    public get Transitions(): ObservableCollection<PropertyTransition> | undefined
    {
        return this.get_property_value(Visual.TransitionsKey);
    }

    /** Lazy-allocate the Transitions collection if missing, then
     *  return it. The collection is mutate-in-place — pushes /
     *  removes take effect immediately because the engine reads the
     *  current Transitions on every matched DP write rather than
     *  caching per-Visual. § 1.16 — separated from the bare getter so
     *  a read-only consumer (binding observer) doesn't accidentally
     *  fire the `set_property_value` write that allocation triggers.
     *
     *  § 1.14 — also registers the implicit-transition pre-write
     *  listener on first allocation. Visuals without any
     *  PropertyTransition pay zero per-write overhead: no listener,
     *  no Set, no fanout. Subscribers added via the public
     *  `AddBaseValueWriteListener` on Model. */
    public EnsureTransitions(): ObservableCollection<PropertyTransition>
    {
        let t = this.get_property_value(Visual.TransitionsKey);
        if (t === undefined)
        {
            t = new ObservableCollection<PropertyTransition>();
            // Subscribe BEFORE the write so a future
            // `set_property_value(TransitionsKey, …)` consumer can't
            // race past the registration. The listener self-skips on
            // descriptor.Name === 'Transitions' so this first write
            // (and any later collection re-assignment) is a no-op.
            this.AddBaseValueWriteListener(
                (descriptor, new_value) => this.handle_base_value_write(descriptor, new_value),
            );
            this.set_property_value(Visual.TransitionsKey, t);
        }
        return t;
    }
    // True when the InputManager has this Visual as its current focused
    // target. Read-only contract enforced via `RegisterReadOnlyProperty`
    // (§ 1.13); use `Focus()` / `Blur()` to change, or the @internal
    // `_setIsFocused` from InputManager.
    public get IsFocused():   boolean { return this.get_property_value(Visual.IsFocusedKey); }

    /** @internal — InputManager only. Typed writeback for the
     *  read-only `IsFocused` DP (§ 1.13). */
    public _setIsFocused(value: boolean): void
    {
        this.set_property_value_with_key(Visual.IsFocusedKey, value);
    }

    // Drop-target opt-in. The InputManager's drag dispatcher walks the
    // visual ancestor chain from the pointer-hit Visual until it finds
    // one with AllowDrop=true (`findAllowDropAncestor`); that Visual
    // becomes the drag receiver.
    public get AllowDrop():  boolean { return this.get_property_value(Visual.AllowDropKey); }
    public set AllowDrop(v:  boolean) { this.set_property_value(Visual.AllowDropKey, v); }
    // Framework-written mirror of "this Visual is the current drag
    // receiver". Read-only contract enforced via
    // `RegisterReadOnlyProperty` (§ 1.13) — InputManager writes
    // through `_setIsDragOver` below.
    public get IsDragOver(): boolean { return this.get_property_value(Visual.IsDragOverKey); }

    /** @internal — InputManager only. Typed writeback for the
     *  read-only `IsDragOver` DP (§ 1.13). */
    public _setIsDragOver(value: boolean): void
    {
        this.set_property_value_with_key(Visual.IsDragOverKey, value);
    }

    // Hit-test opt-out. WPF parity — IsHitTestVisible=false renders
    // this Visual (and every descendant) transparent to pointer-event
    // hit-testing.
    public get IsHitTestVisible():  boolean { return this.get_property_value(Visual.IsHitTestVisibleKey); }
    public set IsHitTestVisible(v: boolean) { this.set_property_value(Visual.IsHitTestVisibleKey, v); }

    // WPF Visibility — see the enum's doc. Hidden keeps the layout slot
    // but skips paint + hit; Collapsed forces zero DesiredSize so the
    // slot itself disappears. Default Visible.
    public get Visibility():  Visibility { return this.get_property_value(Visual.VisibilityKey); }
    public set Visibility(v: Visibility) { this.set_property_value(Visual.VisibilityKey, v); }

    // Precise-shape hit testing — see HitTestGeometryKey.
    public get HitTestGeometry():  Geometry | undefined { return this.get_property_value(Visual.HitTestGeometryKey); }
    public set HitTestGeometry(v: Geometry | undefined) { this.set_property_value(Visual.HitTestGeometryKey, v); }

    public get Cursor():  string | undefined { return this.get_property_value(Visual.CursorKey); }
    public set Cursor(v: string | undefined) { this.set_property_value(Visual.CursorKey, v); }

    // Declarative drag source. Set IsDraggable=true and supply an
    // OnDragStart callback; the framework calls the callback once the
    // pointer has moved past DragDrop.DragThreshold and starts a drag.
    // See `_onDragLatch*` listeners installed in OnPropertyChanged.
    public get IsDraggable(): boolean { return this.get_property_value(Visual.IsDraggableKey); }
    public set IsDraggable(v: boolean) { this.set_property_value(Visual.IsDraggableKey, v); }

    public get OnDragStart():
        ((source: Visual) =>
            {
                data: DataObject;
                effects: DragDropEffects;
                preview?: DragPreviewKind;
                onFeedback?:      (effect: DragDropEffects) => void;
                onContinueQuery?: () => boolean;
            } | null
        ) | undefined
    {
        return this.get_property_value(Visual.OnDragStartKey);
    }
    public set OnDragStart(
        v: ((source: Visual) =>
            {
                data: DataObject;
                effects: DragDropEffects;
                preview?: DragPreviewKind;
                onFeedback?:      (effect: DragDropEffects) => void;
                onContinueQuery?: () => boolean;
            } | null
        ) | undefined,
    ) { this.set_property_value(Visual.OnDragStartKey, v); }

    // Opt-in for keyboard focus. Controls that handle keyboard input
    // (TextBox, Button) flip this on in their constructor; everything
    // else stays unfocusable. Settable by consumers when they want to
    // make a custom hit-target focusable (e.g. a custom widget hosting
    // a keyboard handler).
    public get Focusable(): boolean { return this.get_property_value(Visual.FocusableKey); }
    public set Focusable(v: boolean) { this.set_property_value(Visual.FocusableKey, v); }

    // Take keyboard focus on this Visual. Delegates to the host's
    // InputManager via the optional `SetFocus` method on VisualHost.
    // No-op when the Visual is unattached, when Focusable is false, or
    // when the host doesn't implement SetFocus (tests that mock
    // VisualHost without the focus surface).
    public Focus(): void
    {
        if (!this.Focusable) return;
        this._target?.SetFocus?.(this);
    }

    // Clear focus from this Visual. No-op when this isn't the currently
    // focused Visual — Blur() always asks for "no focus", which the
    // InputManager applies only if we're actually the focused target.
    public Blur(): void
    {
        if (this._target?.SetFocus === undefined) return;
        if (this._target.GetFocusedVisual?.() !== this) return;
        this._target.SetFocus(undefined);
    }

    /** Animate the given property to the timeline's To value. Implicit
     *  Storyboard wrap — equivalent to `new Storyboard(); sb.Add(this,
     *  propertyName, timeline); sb.Begin();`. Returns the underlying
     *  Storyboard so the caller can Stop / AddCompletedListener / chain.
     *
     *  Convenience entry mirrors WPF's UIElement.BeginAnimation. Pass
     *  the same propertyName you'd pass to set_property_value. */
    public BeginAnimation(propertyName: string, timeline: AnimationTimeline): Storyboard
    {
        const sb = new Storyboard();
        sb.Add(this, propertyName, timeline);
        sb.Begin();
        return sb;
    }

    public get DataContext(): unknown { return this.get_property_value(Visual.DataContextKey); }
    public set DataContext(value: unknown) { this.set_property_value(Visual.DataContextKey, value); }

    public get IsEnabled(): boolean { return this.get_property_value(Visual.IsEnabledKey); }
    public set IsEnabled(value: boolean) { this.set_property_value(Visual.IsEnabledKey, value); }

    // Generic consumer-side handle. The framework never reads Tag;
    // consumers attach arbitrary data (a domain object, a routing key,
    // an action delegate) so click / selection handlers can recover it
    // without an out-of-band map. WPF parity.
    public get Tag(): unknown { return this.get_property_value(Visual.TagKey); }
    public set Tag(value: unknown) { this.set_property_value(Visual.TagKey, value); }

    // Two parent pointers: visual (renderer / hit-testing / target
    // propagation) and logical (property inheritance / future named-
    // element scoping / resource lookup). For all non-templated Visuals
    // both pointers reference the same parent — they only diverge when
    // a ControlTemplate slots user-supplied logical content into a
    // template-generated visual subtree (Phase 2 work). Default Attach
    // sets both; AttachVisual / AttachLogical exist for template code
    // to wire them independently.
    private _visualParent:  Visual | undefined;
    private _logicalParent: Visual | undefined;
    private _target: VisualHost | undefined;
    // Visuals that THIS Visual owns as overlay-mounted children — popups,
    // dropdowns, drag previews, tooltips. Distinct from visual children
    // (which paint as descendants in the visualParent's slot) and from
    // standard logical children: an overlay child has its VISUAL parent
    // set to the host's OverlayLayer (so the renderer paints it above
    // the main Content tree) but its LOGICAL parent set to this Visual
    // (so resource / DataContext / inheritable-DP cascades flow from the
    // owning control, not from the overlay layer — see § 18.10 in the
    // backlog history). Populated by `AttachOverlayChild`; cleared by
    // `DetachOverlayChild`. Walked by the inheritance / style /
    // dynamic-resource subtree cascades alongside `logicalChildren`.
    private _overlayChildren: Visual[] | undefined;
    // Set true when InvalidateVisual fires while _target is undefined
    // (the Visual is detached — typically sitting in a recycle pool
    // between Rebind and re-attach). On re-attach SetTarget invalidates
    // so the renderer sees the pending repaint. Without this flag, a
    // property change during the detached window (e.g. ListBoxItem's
    // IsSelected flipping during bindContainer for a recycled
    // container) silently never reaches the SVG and the stale paint
    // from the prior binding leaks through.
    private _renderInvalidatedWhileDetached: boolean = false;

    // The control whose ControlTemplate generated this Visual, or
    // undefined for Visuals authored by the consumer. Set by the
    // template-apply pipeline (Controls/control-template.ts) on every
    // node in the template's generated subtree. Read by TemplateBinding
    // and by walk_inherited (template internals fall back through here
    // to reach the templated control's logical ancestry).
    private _templatedParent: Visual | undefined;

    // Optional x:Name-equivalent — a stable identifier used by
    // FindName to look this Visual up later. Set freely by consumers
    // or by template factories; registration in a NameScope is
    // automatic when the Visual is later added to a tree under a
    // NameScope-bearing ancestor (template Apply auto-registers
    // every named Visual in the template's instance NameScope).
    public Name: string | undefined;

    // Per-instance NameScope attached to this Visual. When set, this
    // Visual is the boundary for FindName lookups from any logical
    // descendant — the walk stops here and resolves in this scope.
    // ControlTemplate.Apply attaches a fresh NameScope to the
    // template root so each template instance gets its own name
    // space (PART_Background in two Button templates don't collide).
    private _nameScope: NameScope | undefined;

    // Per-instance ResourceDictionary, lazy-created on first access.
    // Read directly (not through the public Resources getter) by
    // TryFindResource so an ancestor walk doesn't accidentally allocate
    // empty dicts on every node it passes through.
    private _resources: ResourceDictionary | undefined;

    // The Style currently driving the StyleValue slot lives on
    // `StyleApplicator` (§ 1.7) — `_styleApplicator?.ActiveStyle`.
    // The applicator is lazy: undefined for Visuals that never opt
    // into Style.
    private _styleApplicator: StyleApplicator | undefined;

    // The implicit style discovered by walking the logical chain at
    // AttachLogical and looking up `this.constructor` in the resource
    // dictionaries. Cached so DetachLogical knows what to unapply, and
    // so Style = undefined can re-promote it to active. Only populated
    // for Visuals whose ancestor chain contains a matching Style; left
    // undefined otherwise.
    private _implicitStyle: Style | undefined;

    // The theme style discovered by looking up `this.DefaultStyleKey`
    // in the same logical-chain walk as `_implicitStyle`. Sits below
    // `_implicitStyle` in `refresh_active_style`, so a user-side
    // `Style [TargetType=Button]` in app or element resources always
    // shadows the theme's `[TargetType=Button]` entry — which lives in
    // a merged theme dictionary lower in the resolver chain. Only
    // populated when DefaultStyleKey is set; left undefined otherwise.
    private _themeStyle: Style | undefined;

    // Subscriptions on ancestor ResourceDictionaries that, when fired,
    // re-trigger resolve_implicit_style AND resolve_theme_style — both
    // sources watch the same chain so they share one subscription list.
    // Wired at AttachLogical for every dict found in the current
    // ancestor chain; torn down at DetachLogical or when
    // _refresh_styles_subtree rebuilds them after a tree mutation.
    // Lazy collections — § 1.2. Visuals that never opt into Style,
    // Triggers, or DynamicResource (Border / TextBlock / etc. in plain
    // content roles) pay no allocation. Write sites use the `??=`
    // shape to materialize on first touch; read sites use `?.` or
    // explicit `=== undefined` guards. For a 1000-item virtualized
    // ListBox that's seven empty collections × 1000 containers
    // reclaimed.
    private _styleSubscriptions: Array<() => void> | undefined;

    // Per-setter bindings + writeback bookkeeping live on
    // `StyleApplicator` (§ 1.7) — moved out of Visual.

    // Trigger install / evaluation / teardown machinery lives on
    // `TriggerHost` (§ 1.8). Lazy: undefined for Visuals that never
    // opt into Style or Triggers.
    private _triggerHost: TriggerHost | undefined;

    // Per-event-name instance listener registry. Used by the routed-
    // event dispatcher to invoke per-Visual listeners alongside the
    // virtual handlers (OnPointerDown, OnKeyDown, etc.). EventTriggers
    // for PointerDown / PointerUp / KeyDown / etc. plug into this so
    // each Visual instance gets its own action invocation when the
    // event reaches it in the bubble phase. Lazy-allocated — most
    // Visuals never register a routed listener so the empty Map allo
    // stays cheap.
    private _routedListeners: Map<string, Set<(args: unknown) => void>> | undefined;

    // Declarative drag-source latch state. When IsDraggable=true the
    // ctor installs PointerDown/Move/Up listeners; the latch captures
    // the down position and arms; on a subsequent move past the
    // threshold it calls OnDragStart and DoDragDrop.
    private _draggableInstalled = false;
    private _draggableLatch:
        { downX: number; downY: number; pointerId: number; armed: boolean } | null = null;

    // Bound closure installed on a RenderTransform's _setRenderInvalidator
    // hook (see Transform). Captured once per Visual so install / clear
    // can identity-compare without allocating per call. Inner Transform
    // property changes (RotateTransform.Angle, ScaleTransform.ScaleX, …)
    // fire this and flag the Visual render-dirty.
    private readonly _renderTransformInvalidator = (): void => this.InvalidateVisual();

    private readonly _onDragLatchPointerDown = (raw: unknown): void => {
        const args = raw as PointerEventArgs;
        this._draggableLatch = {
            downX: args.HostX, downY: args.HostY,
            pointerId: args.PointerId,
            armed: true,
        };
    };
    private readonly _onDragLatchPointerMove = (raw: unknown): void => {
        const args = raw as PointerEventArgs;
        const latch = this._draggableLatch;
        if (latch === null || !latch.armed || latch.pointerId !== args.PointerId) return;
        const dx = args.HostX - latch.downX;
        const dy = args.HostY - latch.downY;
        if (Math.hypot(dx, dy) < DragDrop.DragThreshold) return;
        // Threshold reached — invoke OnDragStart and start the drag.
        // Disarm before the callback so a re-entrant move that fires
        // synchronously can't double-start.
        latch.armed = false;
        const start = this.OnDragStart;
        if (start === undefined) return;
        const r = start(this);
        if (r === null) return;
        // Press-relative offset within the source: how far the press
        // landed from the source's host-coord top-left. The HtmlTarget
        // subtracts this from each move sample so the cursor stays
        // anchored at the press point inside the ghost — without it, a
        // wide source (a stretched ItemsControl ContentPresenter) shows
        // the centered tile far from the cursor.
        let srcX = 0, srcY = 0;
        for (let cur: Visual | undefined = this; cur !== undefined; cur = cur.GetVisualParent())
        {
            srcX += cur.ArrangedRect.X;
            srcY += cur.ArrangedRect.Y;
        }
        const ghostCursorOffset = { x: latch.downX - srcX, y: latch.downY - srcY };
        const session = DragDrop.DoDragDrop(this, r.data, r.effects, { preview: r.preview, ghostCursorOffset });
        // Wire any optional source-side hooks (8.3) onto the freshly
        // started session before the InputManager polls and picks it up.
        if (r.onFeedback      !== undefined) session.OnFeedback(r.onFeedback);
        if (r.onContinueQuery !== undefined) session.OnContinueQuery(r.onContinueQuery);
    };
    private readonly _onDragLatchPointerUp = (raw: unknown): void => {
        const args = raw as PointerEventArgs;
        if (this._draggableLatch?.pointerId === args.PointerId)
        {
            this._draggableLatch = null;
        }
    };

    // Lifecycle listeners (Loaded / Attached / Unloaded / Detached)
    // and the Behaviors subsystem live on `Element` — see § Phase B
    // (and § 1.11 for the Attached/Detached symmetric pair design).

    // Layout state cache. Updated by Measure / Arrange runs; read by the
    // renderer and by parents during their own MeasureOverride /
    // ArrangeOverride passes. _isMeasureValid / _isArrangeValid track
    // whether the cached values reflect the current property state — a
    // freshly-constructed Visual starts invalid; Invalidate* flips it back.
    private _desiredSize: Size = Size.Zero;
    private _renderSize: Size = Size.Zero;
    private _arrangedRect: Rect = Rect.Zero;
    private _previousAvailableSize: Size = Size.Empty;
    private _isMeasureValid: boolean = false;
    private _isArrangeValid: boolean = false;

    // ------------------------------------------------------------------
    // Tree + host
    // ------------------------------------------------------------------

    // Parent in the VISUAL tree — what the renderer walks. Set by
    // AttachVisual / cleared by DetachVisual (and through the Attach /
    // Detach convenience methods that wire both trees at once).
    protected get visualParent(): Visual | undefined
    {
        return this._visualParent;
    }

    // Public accessor used by the routed-event dispatcher (lives
    // outside the class hierarchy, so the protected getter is out of
    // reach). Returns the same value as `visualParent` — no separate
    // book-keeping. Don't call this from subclass code; use the
    // protected getter instead.
    public GetVisualParent(): Visual | undefined
    {
        return this._visualParent;
    }

    // Parent in the LOGICAL tree — what property inheritance and
    // (future) named-element / resource lookup walk. Set by
    // AttachLogical / cleared by DetachLogical. For Visuals added
    // through Attach (i.e. every non-template-internal child today)
    // logicalParent === visualParent.
    protected get logicalParent(): Visual | undefined
    {
        return this._logicalParent;
    }

    // Public companion to the protected `logicalParent` getter. Used by
    // controls that walk the logical ancestry to find an owning host —
    // e.g. a TreeViewItem locating its containing TreeView for selection
    // updates. Symmetric with GetVisualParent; subclass code should still
    // use the protected getter.
    public GetLogicalParent(): Visual | undefined
    {
        return this._logicalParent;
    }

    // The control whose ControlTemplate generated this Visual, or
    // undefined for Visuals the consumer authored directly. Read by
    // TemplateBinding (future) and by debugging / tree-walking code
    // that needs to attribute a generated visual back to its owning
    // control. Not part of either tree's ancestor walk.
    public get templatedParent(): Visual | undefined
    {
        return this._templatedParent;
    }

    // The PresentationTarget hosting this Visual's tree, or undefined
    // when the Visual is unattached. WPF equivalent of
    // PresentationSource.FromVisual(v) — consumers reach for the host's
    // ActualWidth / ActualHeight / DeviceScale / TextMeasurer / overlay
    // surface without walking GetVisualParent() themselves. Returns the
    // structural VisualHost contract; consumers in the visual-engine
    // layer that need the concrete PresentationTarget surface cast at
    // the call site. The back-pointer is cascaded through SetTarget at
    // attach time, so this is an O(1) read despite the name — no
    // ancestor walk happens at call time.
    public FindAncestorPresentationTarget(): VisualHost | undefined
    {
        return this._target;
    }

    // Set by the template-apply pipeline (Controls/control-template.ts)
    // when stamping every node in a template's generated subtree.
    // Public-but-not-for-consumer-use: only the template machinery
    // should call this, but it can't be protected because the
    // machinery lives outside the Visual hierarchy.
    public SetTemplatedParent(p: Visual | undefined): void
    {
        const changed = this._templatedParent !== p;
        this._templatedParent = p;
        // Re-fire DynamicResource bindings attached to this Visual.
        // Bindings constructed inside a ControlTemplate factory walk
        // the ancestor chain at construction time — when the visual
        // had no templated parent yet — and would otherwise hold an
        // empty resolution chain. Stamping the templated parent
        // expands the chain (templatedParent fallback now reaches the
        // owning Application's Resources via the templated control's
        // ancestors), so the binding needs a chance to re-resolve
        // against the now-accessible token dictionary. The check
        // against `changed` keeps the no-op write a no-op so repeated
        // template applies don't churn resource lookups.
        if (changed) this.fire_dynamic_resource_listeners();
    }

    // The NameScope this Visual owns, or undefined. Read for FindName
    // boundary detection. Set by ControlTemplate.Apply (one per
    // template instance) and by future Window/PresentationTarget-level
    // scope creation. Public-but-not-for-consumer-use, same convention
    // as SetTemplatedParent.
    public get nameScope(): NameScope | undefined
    {
        return this._nameScope;
    }

    public SetNameScope(scope: NameScope | undefined): void
    {
        this._nameScope = scope;
    }

    // Resolves an x:Name to a Visual within the nearest enclosing
    // NameScope. Walks up logical ancestors (with templatedParent
    // fallback for template internals — same path as walk_inherited)
    // until it hits the first Visual carrying a NameScope, then
    // resolves in that scope.
    //
    // Returns undefined when no ancestor carries a scope, or when the
    // name isn't registered in the scope that's found. WPF semantics:
    // names are scoped, so the same name can exist in multiple
    // templates without collision — each lookup resolves only within
    // its own enclosing scope.
    public FindName(name: string): Visual | undefined
    {
        let cursor: Visual | undefined = this;
        while (cursor !== undefined)
        {
            if (cursor._nameScope !== undefined)
            {
                return cursor._nameScope.Find(name);
            }
            cursor = cursor._logicalParent ?? cursor._templatedParent;
        }
        return undefined;
    }

    // Lazy-created per-instance ResourceDictionary. Touching this
    // getter allocates an empty dict on first access — fine for
    // writers (`v.Resources.Set('Brush', …)`) but reads should go
    // through TryFindResource / FindResource, which check the
    // backing field directly and don't allocate at every walk step.
    //
    // First-access cascade (§ 12.1). Descendants whose DynamicResource
    // bindings were built BEFORE this point cached the (empty)
    // ancestor chain — they didn't subscribe here because there was
    // nothing to subscribe to. Without the cascade, a subsequent
    // `Set` would `notify()` into a dictionary nobody's listening on.
    // Re-walking dynamic-resource + style subscriptions across THIS
    // visual's subtree pulls every reachable binding back through
    // `_subscribe_dynamic_resource`, so the freshly-created dict
    // joins their wired ancestor chains. Same shape for implicit
    // Style + theme Style — the next `Set` of a `[TargetType=X]`
    // entry has to land in the descendants' resolved style.
    //
    // Cost: a single subtree walk per Visual per first access.
    // Visuals whose Resources field stays untouched pay nothing
    // (the lazy path never runs). Re-access after first allocation
    // skips the cascade because `_resources` is already defined.
    public get Resources(): ResourceDictionary
    {
        if (this._resources === undefined)
        {
            const dict = new ResourceDictionary();
            this._resources = dict;
            // § 1.12 — the subtree cascades that used to fire here on
            // first allocation are now deferred to actual change events
            // on the new dict. Subscribing once means a Set / Add /
            // Remove that mutates the empty dict fires
            // `_refresh_styles_subtree` + `_refresh_dynamic_resources_subtree`
            // on the same edge a Set on an existing dict already
            // triggers via the consumer-installed style subscriptions
            // (see `subscribe_styles`). Net effect: descendants pick up
            // any newly-added resources at the moment a value lands,
            // not at the unrelated moment the dict was lazy-allocated.
            // A pure-read consumer (`v.Resources.Has(key)`,
            // `v.Resources.Count`, a debugger inspecting the slot)
            // pays only the allocation, not the tree walk.
            dict.Subscribe(() => {
                this._refresh_styles_subtree();
                this._refresh_dynamic_resources_subtree();
            });
        }
        return this._resources;
    }

    // Logical-ancestor lookup for a resource key. Same walk pattern as
    // FindName / walk_inherited (logical parent, with templatedParent
    // fallback) — so template internals find resources defined on the
    // templated control or on the consumer's surrounding tree. Each
    // ancestor's dictionary is queried via Resolve so MergedDictionaries
    // are included; closer ancestors shadow farther ones. Returns
    // undefined when no ancestor's composition contains the key.
    public TryFindResource(key: ResourceKey): unknown | undefined
    {
        return (this._resourceResolver ??= new ResourceResolver(this)).TryFindResource(key);
    }

    // Resource-lookup machinery + ThemeManager-facing ambient-token
    // hook live on `ResourceResolver` (§ 1.9). Visual retains a lazy
    // `_resourceResolver` field; Visuals that never trigger a
    // TryFindResource pay no allocation.
    private _resourceResolver: ResourceResolver | undefined;

    // Explicit style for this Visual. When set, takes priority over any
    // implicit (TargetType-keyed) style discovered in the ancestor
    // resource chain. Setting it to undefined re-promotes the implicit
    // style (if one was found at AttachLogical).
    //
    // Style setters apply to the StyleValue priority tier in EVD —
    // they sit below LocalValue / Binding / Animated / Coerced, so
    // an explicit set or binding always shadows the styled value, but
    // above InheritedValue / Default.
    public get Style(): Style | undefined { return this.get_property_value(Visual.StyleKey); }
    public set Style(value: Style | undefined)
    {
        const old = this.Style;
        if (old === value) return;
        this.set_property_value(Visual.StyleKey, value);
        this.refresh_active_style();
    }

    // Visual Effect (DropShadow, MaterialElevation, …). Set this to
    // attach a renderer-side post-process. The renderer reads
    // effect.toCssFilter() and assigns the result to the visual's
    // wrapper element's CSS filter. Setting to undefined clears any
    // previously applied filter.
    public get Effect(): Effect | undefined { return this.get_property_value(Visual.EffectKey); }
    public set Effect(value: Effect | undefined) { this.set_property_value(Visual.EffectKey, value); }

    /** Fill brush. Read by Border + Shape subclasses' RenderOverride.
     *  Default undefined ≡ no fill. */
    public get Background(): Brush | undefined { return this.get_property_value(Visual.BackgroundKey); }
    public set Background(value: Brush | undefined) { this.set_property_value(Visual.BackgroundKey, value); }

    /** Affine transform applied at render time. See RenderTransformKey
     *  for semantics. Default undefined (identity). */
    public get RenderTransform(): Transform | undefined { return this.get_property_value(Visual.RenderTransformKey); }
    public set RenderTransform(value: Transform | undefined) { this.set_property_value(Visual.RenderTransformKey, value); }

    /** Origin point for RenderTransform, as a fraction of RenderSize.
     *  See RenderTransformOriginKey for semantics. Default (0, 0). */
    public get RenderTransformOrigin(): Point { return this.get_property_value(Visual.RenderTransformOriginKey); }
    public set RenderTransformOrigin(value: Point) { this.set_property_value(Visual.RenderTransformOriginKey, value); }

    /** Per-subtree paint opacity in [0, 1]. Default 1. Values outside
     *  the range are accepted by the DP but the renderer clamps before
     *  emitting the SVG attribute. */
    public get Opacity(): number       { return this.get_property_value(Visual.OpacityKey); }
    public set Opacity(value: number)  { this.set_property_value(Visual.OpacityKey, value); }

    // Read-only at the instance level. Subclasses override the default
    // value via Model.OverrideMetadata at type-init; see the docstring
    // on DefaultStyleKeyKey. Returns undefined for any Visual whose
    // class (or any base) hasn't opted in.
    public get DefaultStyleKey(): Function | undefined
    {
        return this.get_property_value(Visual.DefaultStyleKeyKey);
    }

    // Pick which Style should be driving the StyleValue tier. Priority
    // matches WPF: explicit Style > implicit (user-side
    // [TargetType=X] walked from the live tree, exact-match by
    // constructor) > theme (DefaultStyleKey-keyed, lives in merged
    // theme dictionaries). Delegates the diff-swap of setters +
    // triggers to `StyleApplicator` (§ 1.7); the applicator is
    // created lazily on first touch so Visuals that never opt into
    // Style pay zero allocation.
    private refresh_active_style(): void
    {
        const desired = this.Style ?? this._implicitStyle ?? this._themeStyle;
        if (desired === this._styleApplicator?.ActiveStyle) return;
        (this._styleApplicator ??= new StyleApplicator(this)).RefreshActiveStyle(desired);
    }

    // § 1.7 trampolines — apply_setter / unapply_setter now live on
    // StyleApplicator. Visual keeps thin wrappers so the trigger
    // install / uninstall machinery (still on Visual until § 1.8)
    // continues calling them without knowing about the applicator.
    private apply_setter(setter: Setter, tier: 'style' | 'trigger'): void
    {
        (this._styleApplicator ??= new StyleApplicator(this)).ApplySetter(setter, tier);
    }

    private unapply_setter(setter: Setter, tier: 'style' | 'trigger'): void
    {
        this._styleApplicator?.UnapplySetter(setter, tier);
    }

    // Public hooks used by DataTemplate triggers — they let a trigger
    // wired up at the template root apply/clear setters on a named
    // descendant ('TargetName' in WPF) at the Trigger priority tier,
    // exactly the way a Style-installed PropertyTrigger/DataTrigger
    // would but with the styled visual and the setter target being two
    // different Visuals. The setter machinery itself doesn't care about
    // the split; it just operates on `this`.
    public ApplyTriggerSetter(setter: Setter): void
    {
        this.apply_setter(setter, 'trigger');
    }
    public ClearTriggerSetter(setter: Setter): void
    {
        this.unapply_setter(setter, 'trigger');
    }

    // Wire the EventTrigger's RoutedEvent to a dispatch that invokes
    // every Action on each fire. Cleanly dispatches by event NAME so a
    // .mu author can write `on Click { … }` without the runtime knowing
    // which concrete Visual subclass is in play.
    //
    // Routing today:
    //   * 'Click' — only Button (and subclasses) expose AddClickHandler.
    //               If this Visual lacks it (an EventTrigger applied via
    //               an over-broad TargetType, say), we no-op silently
    //               rather than throw so a Style declared once and
    //               applied to a heterogeneous set degrades gracefully.
    //   * other  — not yet supported; logs to the host's console if
    //               available so the author sees the misconfiguration
    //               without breaking the page.
    //
    // Track the unsubscribe so unapply_style can detach cleanly when
    // the Style is removed.
    public AddEventTrigger(trigger: EventTrigger): void
    {
        this._install_event_trigger(trigger);
    }

    public RemoveEventTrigger(trigger: EventTrigger): void
    {
        this._uninstall_event_trigger(trigger);
    }

    /** @internal — § 1.8 trampoline. The install machinery lives on
     *  `TriggerHost`. Called from `StyleApplicator.RefreshActiveStyle`
     *  via the friend-interface cast and from public
     *  `AddEventTrigger`. Lazy-creates the host on first touch. */
    public _install_event_trigger(trigger: EventTrigger): void
    {
        (this._triggerHost ??= new TriggerHost(this)).InstallEventTrigger(trigger);
    }

    // ── Per-instance routed listener registry ──────────────────────────
    //
    // Routed events that pass through dispatchPointer / dispatchKey /
    // dispatchFocus invoke per-Visual virtuals (OnPointerDown, etc.) on
    // each node along the route. They ALSO invoke FireRoutedListeners
    // here so per-instance EventTriggers / consumer-attached listeners
    // get the same hooks subclasses do — but without forcing subclass
    // overrides to call `super` to keep listeners working.
    public AddRoutedEventListener(eventName: string, listener: (args: unknown) => void): void
    {
        // § 1.16 — validate at registration so a typo
        // (`'PointreDown'`) fails loudly instead of subscribing to a
        // name that will never fire. The check is throw-on-unknown,
        // matching `AttachVisual`'s policy for invalid wiring;
        // FireRoutedListeners stays free of the per-fire check.
        if (!KNOWN_ROUTED_EVENTS.has(eventName))
        {
            throw new Error(
                `Visual.AddRoutedEventListener: unknown routed event '${eventName}'. `
                + `Known names: ${Array.from(KNOWN_ROUTED_EVENTS).join(', ')}.`,
            );
        }
        if (this._routedListeners === undefined) this._routedListeners = new Map();
        let set = this._routedListeners.get(eventName);
        if (set === undefined)
        {
            set = new Set();
            this._routedListeners.set(eventName, set);
        }
        set.add(listener);
    }

    public RemoveRoutedEventListener(eventName: string, listener: (args: unknown) => void): void
    {
        this._routedListeners?.get(eventName)?.delete(listener);
    }

    // Called by the routed-event dispatcher's bubble loop. No-op when
    // no listeners are registered (the common case — most Visuals
    // never register).
    public FireRoutedListeners(eventName: string, args: unknown): void
    {
        safeFire(this._routedListeners?.get(eventName), args);
    }

    // Lifecycle listener public API (AddLoaded / AddAttached /
    // AddUnloaded / AddDetached and their Remove counterparts) and
    // the Behavior attachment surface (AddBehavior / RemoveBehavior /
    // Behaviors) live on `Element`. See [./element.ts](./element.ts)
    // (§ Phase B).

    // CommandBindings / InputBindings live on Control (the templated-
    // control base in `@visualisation-sub/mural/framework`). Routed
    // commands + InputBindings dispatch only reach Control-shaped
    // visuals — Border / Canvas / plain panels participate in routing
    // but don't carry per-instance binding tables. CommandManager and
    // the routed-event walker `instanceof Control` before reading the
    // collections.

    // ── Named storyboard registry ──────────────────────────────────────
    //
    // BeginStoryboardAction with a Name stashes the freshly-built
    // Storyboard here so later StopStoryboardAction /
    // PauseStoryboardAction / ResumeStoryboardAction can find it. The
    // map's `name` keys are SCOPED to this Visual — two Buttons that
    // both run a "fade" storyboard each have their own independent
    // copy, so a `StopStoryboard Name="fade"` on one Button doesn't
    // stop the other's. Last-write-wins semantics: re-firing
    // BeginStoryboard with the same Name silently replaces the prior
    // Storyboard reference (its lifecycle is up to the consumer —
    // typically still pinned at HoldEnd or already Stopped).
    private _namedStoryboards: Map<string, Storyboard> | undefined;

    public RegisterNamedStoryboard(name: string, sb: Storyboard): void
    {
        if (this._namedStoryboards === undefined) this._namedStoryboards = new Map();
        this._namedStoryboards.set(name, sb);
    }

    public GetNamedStoryboard(name: string): Storyboard | undefined
    {
        return this._namedStoryboards?.get(name);
    }

    /** @internal — § 1.8 trampoline. */
    public _uninstall_event_trigger(trigger: EventTrigger): void
    {
        this._triggerHost?.UninstallEventTrigger(trigger);
    }

    /** @internal — § 1.8 trampoline. */
    public _install_trigger(trigger: PropertyTrigger): void
    {
        (this._triggerHost ??= new TriggerHost(this)).InstallTrigger(trigger);
    }

    /** @internal — § 1.8 trampoline. */
    public _uninstall_trigger(trigger: PropertyTrigger | MultiTrigger | DataTrigger | MultiDataTrigger): void
    {
        this._triggerHost?.UninstallTrigger(trigger);
    }

    /** @internal — § 1.8 trampoline. */
    public _install_multi_trigger(trigger: MultiTrigger): void
    {
        (this._triggerHost ??= new TriggerHost(this)).InstallMultiTrigger(trigger);
    }

    /** @internal — § 1.8 trampoline. */
    public _install_data_trigger(trigger: DataTrigger): void
    {
        (this._triggerHost ??= new TriggerHost(this)).InstallDataTrigger(trigger);
    }

    /** @internal — § 1.8 trampoline. */
    public _install_multi_data_trigger(trigger: MultiDataTrigger): void
    {
        (this._triggerHost ??= new TriggerHost(this)).InstallMultiDataTrigger(trigger);
    }

    // Looks up an implicit Style keyed by this Visual's constructor in
    // the ancestor resource chain. Called from AttachLogical (newly in
    // a tree, may have an implicit Style above), from DetachLogical
    // (no chain anymore, implicit clears), and from the ancestor-
    // resource subscriptions wired by subscribe_styles (a dictionary
    // change might add / remove the implicit style).
    private resolve_implicit_style(): void
    {
        // Function-keyed entries in the resource chain may be Styles
        // (user-side `[TargetType=X]`) OR ControlTemplates (the bundled
        // controls theme's `[TargetType=X]` Templates). The implicit-Style
        // path takes Styles only — guard with `instanceof Style` so a
        // ControlTemplate registered under the same key doesn't get
        // mis-applied here (the control's constructor reads the
        // template directly via Application.ResolveDefaultResource).
        const raw = this.TryFindResource(this.constructor);
        const found = raw instanceof Style ? raw : undefined;
        if (found === this._implicitStyle) return;
        this._implicitStyle = found;
        this.refresh_active_style();
    }

    // Theme-style counterpart of resolve_implicit_style. Looks up
    // `this.DefaultStyleKey` (a class function picked by metadata
    // override) in the same ancestor resource chain. A Visual whose
    // DefaultStyleKey is undefined (the default) skips the lookup —
    // theme styling is opt-in per subclass. In practice the matching
    // entry lives in a merged theme dictionary on Application.Resources;
    // user-side [TargetType=X] entries closer in the chain hit
    // resolve_implicit_style first and shadow what we find here.
    private resolve_theme_style(): void
    {
        const key = this.DefaultStyleKey;
        const raw = key !== undefined ? this.TryFindResource(key) : undefined;
        // Same instanceof guard as resolve_implicit_style — Function
        // keys are shared with ControlTemplate registrations, so skip
        // anything that isn't a Style.
        const found = raw instanceof Style ? raw : undefined;
        if (found === this._themeStyle) return;
        this._themeStyle = found;
        this.refresh_active_style();
    }

    // Eagerly resolve the default Style and apply it. Convention for
    // templated controls: call this at the end of the subclass
    // constructor. The framework would otherwise only resolve styles
    // on AttachLogical (via _refresh_styles_subtree) — fine for tree-
    // mounted controls, but standalone tests / unmounted instances
    // would have a missing Template (and the visualChildren / Measure
    // contracts would observe an un-templated control). Calling this
    // is the WPF parity for the EnsureTemplate hook that runs lazily
    // in MeasureCore there; mural runs it eagerly at construction so
    // unattached visualChildren reads still see the default chrome.
    //
    // Idempotent: re-resolving the same Style is a no-op
    // (resolve_*_style short-circuits on identity match). Safe to call
    // multiple times during composition (e.g. when a subclass needs
    // the Template to be populated before its own ctor finishes).
    protected applyDefaultStyle(): void
    {
        this.resolve_implicit_style();
        this.resolve_theme_style();
    }

    // Subscribe to every ResourceDictionary in the ancestor chain so
    // changes to any of them re-resolve BOTH the implicit and theme
    // styles. Wired at AttachLogical; tree mutations rebuild via
    // _refresh_styles_subtree. Implicit and theme share one subscription
    // list because they consult the same chain — splitting would
    // double the subscribers on every dict for no benefit.
    private subscribe_styles(): void
    {
        this.unsubscribe_styles();
        const onChange = (): void =>
        {
            this.resolve_implicit_style();
            this.resolve_theme_style();
        };
        let cursor: Visual | undefined = this;
        while (cursor !== undefined)
        {
            const r = cursor._resources;
            if (r !== undefined)
            {
                (this._styleSubscriptions ??= []).push(r.Subscribe(onChange));
            }
            cursor = cursor._logicalParent ?? cursor._templatedParent;
        }
        // Mirror the Application-level fallback in TryFindResource —
        // theme / implicit-style changes on the app's root dict must
        // trigger re-resolution here too.
        const appRd = Application.current?.Resources;
        if (appRd !== undefined)
        {
            (this._styleSubscriptions ??= []).push(appRd.Subscribe(onChange));
        }
    }

    private unsubscribe_styles(): void
    {
        if (this._styleSubscriptions === undefined) return;
        for (const unsub of this._styleSubscriptions) unsub();
        this._styleSubscriptions = undefined;
    }

    // Throws when the resource isn't found anywhere up the chain — use
    // when the caller treats absence as a programming error. For
    // optional lookups use TryFindResource.
    public FindResource(key: ResourceKey): unknown
    {
        const v = this.TryFindResource(key);
        if (v === undefined)
        {
            const desc = typeof key === 'string' ? `'${key}'` : `[${(key as Function).name}]`;
            throw new Error(`Visual.FindResource: resource ${desc} not found in any logical ancestor.`);
        }
        return v;
    }

    // The VisualHost (PresentationTarget) that owns this Visual's tree,
    // or undefined when the Visual is unattached.
    protected get target(): VisualHost | undefined
    {
        return this._target;
    }

    protected SetVisualParent(p: Visual | undefined): void
    {
        const wasAttached = this._visualParent !== undefined;
        this._visualParent = p;
        // Fire the FE-tier detach hook on the defined → undefined
        // transition. Element overrides `on_detach_edge` to fire its
        // Unloaded / Detached listeners (which is where Behaviors hook
        // their teardown via Visual.AddBehavior → AddUnloadedListener).
        // Re-attach + detach cycles fire on each detach (not
        // one-shot like Loaded — see Element.fire_unloaded_listeners
        // contract).
        if (wasAttached && p === undefined)
        {
            this.on_detach_edge();
        }
    }

    /** Visual-tier hook fired on the defined → undefined `visualParent`
     *  transition. Empty on Visual; Element overrides to fan out to
     *  its Unloaded / Detached listener sets. § Phase B. */
    protected on_detach_edge(): void { }

    /** Visual-tier hook fired on the undefined → defined `_target`
     *  transition (the FE-tier "I am now mounted" edge). Empty on
     *  Visual; Element overrides to fan out to its Loaded / Attached
     *  listener sets. § Phase B. */
    protected on_attach_edge(): void { }

    protected SetLogicalParent(p: Visual | undefined): void
    {
        this._logicalParent = p;
    }

    // Sets this Visual's host back-pointer and cascades it down the
    // VISUAL subtree via propagate_target_to_visual_children. The host
    // is a rendering concept (where pixels go, where layout invalidation
    // routes to), so it follows visual ancestry — a template's
    // internally-generated visuals all share their templated control's
    // host, and consumer-supplied logical content slotted into them
    // picks up the same host through its visual parent.
    protected SetTarget(target: VisualHost | undefined): void
    {
        if (this._target === target) return;
        if (this._target !== undefined && target !== undefined)
        {
            throw new Error('Visual is already attached to a host; detach from the current host first.');
        }
        const wasLoaded = this._target !== undefined;
        this._target = target;
        this.propagate_target_to_visual_children();
        // Replay any pending render invalidation queued while detached.
        // Without this, a property change inside a recycle/rebind cycle
        // (the trigger un-applying a Background while the container
        // sits in the pool) silently never reaches the renderer and
        // the SVG keeps the prior binding's paint.
        if (target !== undefined && this._renderInvalidatedWhileDetached)
        {
            this._renderInvalidatedWhileDetached = false;
            target.OnRenderInvalidated(this);
        }
        // Delegate the FE-tier "Loaded once + Attached every-edge"
        // fan-out to Element's override of `on_attach_edge`. Visual
        // itself is render-tier only — the lifecycle listener state
        // lives on Element (§ Phase B).
        if (!wasLoaded && target !== undefined)
        {
            this.on_attach_edge();
        }
    }

    // § 1.15 — the four propagate_* virtuals now have one-line
    // bodies that delegate to the `forEachVisualChild` /
    // `forEachLogicalChild` virtuals below. Single and Panel only
    // need to override the two `forEachXxxChild` virtuals to wire
    // up their iteration shape; the four propagates fall through
    // automatically. Subclasses with non-uniform logical / visual
    // topology (ContentControl, ItemsControl, Drawer) keep their
    // custom propagate_* overrides — the helper-driven defaults
    // don't model the "Content slot + template root in two
    // different trees" case.
    protected propagate_target_to_visual_children(): void
    {
        const t = this['target'];
        this.forEachVisualChild(c => c['SetTarget'](t));
    }

    // Children iteration surface — every Visual exposes its visual
    // children (for the renderer / hit-testing) and its logical
    // children (for tree walks that need the consumer-authored
    // structure). Base default is empty (leaf Visual). Single and
    // Panel override; templated controls (Phase 2) override these
    // independently so the two collections can differ.
    public get visualChildren(): readonly Visual[]  { return []; }
    public get logicalChildren(): readonly Visual[] { return []; }

    // Cascade-iteration helper (§ 1.5). Yields every direct subtree
    // root that should receive a subtree-wide refresh — logical
    // children for the main tree, plus any overlay children
    // (popups / dropdowns / tooltips whose visual parent is the
    // OverlayLayer but whose LOGICAL parent is this Visual). Five
    // sites used to inline the (logicalChildren + overlayChildren)
    // duplication; centralizing it here means the overlay-inclusion
    // rule lives in one place — when (not if) it changes the
    // five-site lock-step becomes one edit.
    protected *allLogicalDescendantSubtreeRoots(): IterableIterator<Visual>
    {
        for (const c of this.logicalChildren) yield c;
        if (this._overlayChildren !== undefined)
        {
            for (const c of this._overlayChildren) yield c;
        }
    }

    // Companion helper for hot-path cascades that already use the
    // `propagate_*_to_logical_children` virtual quartet (which Single /
    // Panel override for zero-alloc iteration). Calling this immediately
    // after the propagate_* call covers the overlay branch without
    // re-traversing the main logical tree. Once the propagate_*
    // quartet collapses into a single `forEachLogicalChild` virtual
    // (§ 1.15), this helper merges with that one.
    protected forEachOverlayChild(fn: (child: Visual) => void): void
    {
        if (this._overlayChildren === undefined) return;
        for (const c of this._overlayChildren) fn(c);
    }

    // VISUAL-tree wiring only: sets the child's visual parent and
    // cascades the host (renderer needs both). Does NOT touch the
    // logical parent or refresh inheritance — those ride the logical
    // tree. Call this directly only from templating code that's
    // attaching template-generated visuals to their templated control;
    // for ordinary user-supplied children use Attach (which wires both
    // trees).
    protected AttachVisual(child: Visual): void
    {
        if (child === this)
        {
            throw new Error('A Visual cannot be its own child.');
        }
        if (child._visualParent !== undefined)
        {
            throw new Error('Visual already has a visual parent; detach it from the current parent first.');
        }
        child.SetVisualParent(this);
        child.SetTarget(this._target);
    }

    protected DetachVisual(child: Visual): void
    {
        if (child._visualParent !== this)
        {
            throw new Error('Cannot detach a Visual that is not a visual child of this.');
        }
        child.SetVisualParent(undefined);
        child.SetTarget(undefined);
    }

    // LOGICAL-tree wiring only: sets the child's logical parent and
    // refreshes property-value inheritance for the new ancestry. Use
    // directly from templating code when slotting consumer-supplied
    // logical content into a templated control (the child's visual
    // parent is set separately by the ContentPresenter / ItemsPresenter
    // doing the visual slotting).
    protected AttachLogical(child: Visual): void
    {
        if (child === this)
        {
            throw new Error('A Visual cannot be its own logical child.');
        }
        if (child._logicalParent !== undefined)
        {
            throw new Error('Visual already has a logical parent; detach it from the current parent first.');
        }
        child.SetLogicalParent(this);
        child._refresh_inheritance_subtree();
        // Style lookups run AFTER inheritance refresh — the resource
        // chain now reflects the child's new ancestry, so the
        // type-keyed Style lookup (implicit via constructor + theme
        // via DefaultStyleKey) sees what the consumer would see at
        // this position in the tree. Cascades through the ENTIRE
        // subtree because descendants' ancestor chain just grew above
        // them too (bottom-up construction is common: a Border with
        // `resources: { style[TargetType=Button] }` gets its inner
        // Buttons built and AddChild'd before the Border itself is
        // attached anywhere; the Buttons resolved an empty chain at
        // their original AddChild and only see the Border's style
        // when their chain extends up to it on THIS attach).
        child._refresh_styles_subtree();
        // DynamicResource bindings cached their ancestor-chain
        // subscriptions at construction. Reparenting grew (or shrank)
        // that chain — re-walk so any new ancestor's Resources dict
        // becomes observable, and so a fresh active theme lookup runs
        // for every bound DP across the subtree.
        child._refresh_dynamic_resources_subtree();
    }

    protected DetachLogical(child: Visual): void
    {
        if (child._logicalParent !== this)
        {
            throw new Error('Cannot detach a Visual that is not a logical child of this.');
        }
        // Tear down ancestor-resource subscriptions FIRST (whole
        // subtree) so a mutation on the now-detached chain doesn't
        // fire resolve_implicit_style / resolve_theme_style through
        // stale subs.
        child._unsubscribe_styles_subtree();
        child.SetLogicalParent(undefined);
        child._refresh_inheritance_subtree();
        // No ancestor chain anymore — re-resolve drops any inherited
        // implicit or theme style across the subtree. Explicit Style
        // stays active because refresh_active_style prefers Style over
        // _implicitStyle / _themeStyle.
        child._refresh_styles_subtree();
        // DynamicResource bindings re-walk their ancestor chain — the
        // detached subtree's bindings drop ancestor subscriptions and
        // fall back to Application-only resolution (still valid for
        // theme tokens).
        child._refresh_dynamic_resources_subtree();
    }

    // Cascades unsubscribe → resolve → subscribe through THIS visual
    // and every logical descendant. Used by AttachLogical / DetachLogical
    // to re-propagate implicit and theme style lookups when the
    // ancestor chain changes at any level above the subtree (which
    // invalidates every descendant's chain, not just the
    // directly-attached child).
    /** @internal — § 1.10. Public-with-underscore so collaborators
     *  on sibling Visuals can call it without a bracket-access cast.
     *  Walks this Visual and every logical / overlay descendant,
     *  re-resolving implicit + theme styles and re-subscribing to
     *  ancestor ResourceDictionary changes. */
    public _refresh_styles_subtree(): void
    {
        this.unsubscribe_styles();
        this.resolve_implicit_style();
        this.resolve_theme_style();
        this.subscribe_styles();
        for (const c of this.allLogicalDescendantSubtreeRoots()) c._refresh_styles_subtree();
    }

    // Cascades unsubscribe through THIS visual and every logical
    // descendant. Called before a subtree detach so subs torn down
    // FIRST can't fire through the still-attached ancestor chain.
    /** @internal — § 1.10. See `_refresh_styles_subtree`. Tears down
     *  ancestor ResourceDictionary subscriptions across the subtree
     *  before a detach so they can't fire through the still-attached
     *  chain. */
    public _unsubscribe_styles_subtree(): void
    {
        this.unsubscribe_styles();
        for (const c of this.allLogicalDescendantSubtreeRoots()) c._unsubscribe_styles_subtree();
    }

    // ── Overlay children — logical-owner-side wiring ─────────────────
    //
    // A popup / dropdown / tooltip whose visual parent is the host's
    // OverlayLayer but whose logical parent is THIS Visual. The visual
    // hop is what the renderer walks (so the popup paints above the
    // main Content); the logical hop is what resource / DataContext /
    // inheritable-DP cascades walk (so theme tokens, scheme overrides,
    // and inherited DPs flow from the owning control rather than from
    // the overlay layer). Without this split, every overlay-mounted
    // popup resolves resources through OverlayLayer → PresentationTarget,
    // never reaching a subtree `Scheme=@Foo` override on the owner's
    // ancestor — the gap tracked at § 18.10.
    //
    // Caller pattern:
    //     this.AttachOverlayChild(this._popup);   // on open
    //     this.DetachOverlayChild(this._popup);   // on close
    //
    // Symmetric with AddChild / RemoveChild for the in-tree case. Throws
    // if this Visual has no host target yet — the visual hop can't
    // resolve without one.
    public AttachOverlayChild(child: Visual): void
    {
        const t = this._target;
        if (t === undefined)
        {
            throw new Error(
                'Visual.AttachOverlayChild: this Visual is not attached to a presentation target — '
                + 'wait until the owner is mounted before attaching overlay children.',
            );
        }
        // Logical hop is idempotent — controls that re-mount their popup
        // across a host-target swap (MenuButton, MenuItem submenu) tear
        // down the visual hop directly via `oldTarget.DetachOverlay` and
        // then call AttachOverlayChild again. The logical relationship
        // (popup ⊂ this owner) persists across the swap; only the visual
        // hop flips between overlay layers. Skip the AttachLogical when
        // the child is already in our _overlayChildren collection, but
        // always execute the visual hop so the new target's OverlayLayer
        // picks up the popup.
        const alreadyOwned = this._overlayChildren?.includes(child) === true;
        if (!alreadyOwned)
        {
            if (this._overlayChildren === undefined) this._overlayChildren = [];
            this._overlayChildren.push(child);
            // Logical hop: child._logicalParent = this; runs the
            // inheritance / style / DynamicResource refreshes through
            // child's subtree.
            this.AttachLogical(child);
        }
        // Visual hop: the host materialises its OverlayLayer (if not yet
        // present) and adds the child as a VISUAL-only panel child — no
        // logical wiring on the OverlayLayer side, so the OverlayLayer
        // doesn't claim ownership of inheritance cascades.
        t.AttachOverlay(child);
    }

    public DetachOverlayChild(child: Visual): void
    {
        const t = this._target;
        // Visual hop first so the renderer drops the child before its
        // logical owner releases inheritance state — same teardown
        // ordering Panel.RemoveChild uses (RemoveVisualChild → DetachLogical).
        if (t !== undefined) t.DetachOverlay(child);
        if (this._overlayChildren !== undefined)
        {
            const i = this._overlayChildren.indexOf(child);
            if (i >= 0) this._overlayChildren.splice(i, 1);
        }
        // Detach the logical hop only if it still points here — the
        // child may have been re-parented externally (rare, but cheap
        // to guard).
        if (child._logicalParent === this) this.DetachLogical(child);
    }

    // Convenience for the common case where a child belongs to BOTH
    // trees with the same parent — every user-supplied child of a
    // non-templated Panel or Single goes through here. Templated
    // controls (Phase 2) call AttachVisual and AttachLogical
    // independently when the trees diverge.
    protected Attach(child: Visual): void
    {
        this.AttachVisual(child);
        this.AttachLogical(child);
    }

    protected Detach(child: Visual): void
    {
        this.DetachLogical(child);
        this.DetachVisual(child);
    }

    // ------------------------------------------------------------------
    // Layout / Render lifecycle
    // ------------------------------------------------------------------

    // Explicit size constraints. Width / Height: NaN means "size to
    // content" — MeasureOverride's result wins (clamped by Min/Max). Any
    // numeric value locks the size to exactly that value (clamped by
    // Min/Max in case of conflict). Min/Max: default 0 / +Infinity, so
    // by default they impose no constraint. Set them when you want a
    // fixed-size element ("100×100 box") or a range ("at least 40 wide,
    // never wider than 200"). All four contribute to a single per-axis
    // [min, max] range resolved in Measure.
    public get Width(): number { return this.get_property_value(Visual.WidthKey); }
    public set Width(value: number) { this.set_property_value(Visual.WidthKey, value); }

    public get Height(): number { return this.get_property_value(Visual.HeightKey); }
    public set Height(value: number) { this.set_property_value(Visual.HeightKey, value); }

    public get MinWidth(): number { return this.get_property_value(Visual.MinWidthKey); }
    public set MinWidth(value: number) { this.set_property_value(Visual.MinWidthKey, value); }

    public get MinHeight(): number { return this.get_property_value(Visual.MinHeightKey); }
    public set MinHeight(value: number) { this.set_property_value(Visual.MinHeightKey, value); }

    public get MaxWidth(): number { return this.get_property_value(Visual.MaxWidthKey); }
    public set MaxWidth(value: number) { this.set_property_value(Visual.MaxWidthKey, value); }

    public get MaxHeight(): number { return this.get_property_value(Visual.MaxHeightKey); }
    public set MaxHeight(value: number) { this.set_property_value(Visual.MaxHeightKey, value); }

    // Positioning within the parent-given slot when the rendered area
    // is smaller than the slot. Defaults to Stretch (fill the slot when
    // no explicit Width / Height is set; with explicit size, Stretch
    // falls back to Center per WPF semantics).
    public get HorizontalAlignment(): HorizontalAlignment { return this.get_property_value(Visual.HorizontalAlignmentKey); }
    public set HorizontalAlignment(value: HorizontalAlignment) { this.set_property_value(Visual.HorizontalAlignmentKey, value); }

    public get VerticalAlignment(): VerticalAlignment { return this.get_property_value(Visual.VerticalAlignmentKey); }
    public set VerticalAlignment(value: VerticalAlignment) { this.set_property_value(Visual.VerticalAlignmentKey, value); }

    // Outer spacing — distance from this Visual's rendered area to the
    // edges of its parent-given slot. Differs from a Border's Padding
    // (which is inside the border, around the child): Margin lives
    // OUTSIDE the Visual itself and is consumed by the parent's layout.
    public get Margin(): Thickness { return this.get_property_value(Visual.MarginKey); }
    public set Margin(value: Thickness) { this.set_property_value(Visual.MarginKey, value); }

    // Optional clip applied at render time — a Geometry in this
    // Visual's local coordinate space. The renderer pushes this clip
    // before RenderOverride and before walking visual children, pops
    // after children. Typed as `unknown` so runtime stays decoupled
    // from visual-engine's Geometry class; whatever shape DC.PushClip
    // accepts works here.
    public get Clip(): unknown | undefined { return this.get_property_value(Visual.ClipKey); }
    public set Clip(value: unknown | undefined) { this.set_property_value(Visual.ClipKey, value); }

    public get DesiredSize(): Size  { return this._desiredSize; }
    public get RenderSize(): Size   { return this._renderSize; }
    public get ArrangedRect(): Rect { return this._arrangedRect; }
    public get IsMeasureValid(): boolean { return this._isMeasureValid; }
    public get IsArrangeValid(): boolean { return this._isArrangeValid; }

    // Measure pass entry point. Computes DesiredSize via MeasureOverride.
    // Cached: returns immediately when measure state is valid AND the
    // availableSize matches the prior call.
    //
    // Do not override directly — override MeasureOverride for custom
    // layout policy.
    public Measure(availableSize: Size): void
    {
        if (this._isMeasureValid && this._previousAvailableSize.Equals(availableSize)) return;
        this._previousAvailableSize = availableSize;

        // Visibility=Collapsed forces DesiredSize=Zero so the parent's
        // layout treats this visual as taking no space at all. Hidden
        // falls through and measures normally (it keeps its layout slot).
        // WPF parity. Margin / Min-Max / MeasureOverride are all skipped
        // — there's no content to size when the visual is collapsed.
        if (this.Visibility === Visibility.Collapsed)
        {
            this._desiredSize    = Size.Zero;
            this._isMeasureValid = true;
            this._isArrangeValid = false;
            return;
        }

        // Subtract Margin first — that space belongs to the gap between
        // this Visual and its parent's slot edge, not to this Visual's
        // own content. MeasureOverride sees only the inner budget.
        const margin = this.Margin;
        const marginH = margin.Horizontal;
        const marginV = margin.Vertical;
        const inner = new Size(
            Math.max(0, availableSize.Width  - marginH),
            Math.max(0, availableSize.Height - marginV),
        );

        // Resolve the effective [min, max] per axis from Width /
        // Height / MinWidth / MinHeight / MaxWidth / MaxHeight. Explicit
        // Width is the special case where min === max === Width.
        const mm = this.resolveMinMax();

        // availableSize handed to MeasureOverride is clamped to that
        // range — when Width is set, MeasureOverride sees exactly Width
        // (children measure themselves against the asserted size, not
        // the parent's slot).
        const constrained = new Size(
            Visual.clamp(inner.Width,  mm.minW, mm.maxW),
            Visual.clamp(inner.Height, mm.minH, mm.maxH),
        );

        const measured = this.MeasureOverride(constrained);

        // Clamp MeasureOverride's result to the same range — Min/Max
        // act as floor/ceiling on the natural content size. With Width
        // set, this pins the inner size to Width regardless.
        const clamped = new Size(
            Visual.clamp(measured.Width,  mm.minW, mm.maxW),
            Visual.clamp(measured.Height, mm.minH, mm.maxH),
        );

        // Add Margin back so the parent reserves the full bounding box
        // (inner content + outer spacing) for this Visual.
        this._desiredSize = new Size(
            clamped.Width  + marginH,
            clamped.Height + marginV,
        );
        this._isMeasureValid = true;
        // A new desired size invalidates any prior arrangement that was
        // computed against the old desired size — the parent will need
        // to re-Arrange this Visual with a possibly different finalRect.
        this._isArrangeValid = false;
    }

    // Override to compute DesiredSize from this Visual's content and
    // (typically) its children's DesiredSize. Subclasses that contain
    // children must call child.Measure(constrainedSize) for each child
    // before reading child.DesiredSize.
    //
    // Default returns Size.Zero — the leaf-Visual case.
    protected MeasureOverride(_availableSize: Size): Size
    {
        return Size.Zero;
    }

    // Arrange pass entry point. Places this Visual into finalRect and
    // runs ArrangeOverride to position children. Forces a Measure if
    // measure state is invalid (using the previously-passed available
    // size, or finalRect.Size as a fallback). Cached: returns immediately
    // when arrange state is valid AND finalRect matches the prior call.
    //
    // Do not override directly — override ArrangeOverride.
    public Arrange(finalRect: Rect): void
    {
        if (this._isArrangeValid && this._arrangedRect.Equals(finalRect)) return;
        if (!this._isMeasureValid)
        {
            const available = this._previousAvailableSize.IsEmpty
                ? finalRect.Size
                : this._previousAvailableSize;
            this.Measure(available);
        }

        // Visibility=Collapsed — DesiredSize is already Zero from Measure;
        // pin the arranged rect to a degenerate point at the slot origin
        // (so hit-test math doesn't trip on a stale rect) and skip
        // ArrangeOverride entirely. There are no children to arrange and
        // no own rendering — the renderer will skip this subtree too.
        // Hidden falls through and arranges normally so the slot stays
        // reserved.
        if (this.Visibility === Visibility.Collapsed)
        {
            this._arrangedRect   = new Rect(finalRect.X, finalRect.Y, 0, 0);
            this._renderSize     = Size.Zero;
            this._isArrangeValid = true;
            return;
        }

        // Subtract Margin from the parent-given slot before computing
        // render size / alignment. The marginedRect is where this Visual's
        // own content actually lives; the margin gap is what's left
        // between marginedRect and finalRect on each side.
        const margin = this.Margin;
        const marginedRect = new Rect(
            finalRect.X + margin.Left,
            finalRect.Y + margin.Top,
            Math.max(0, finalRect.Width  - margin.Horizontal),
            Math.max(0, finalRect.Height - margin.Vertical),
        );

        const mm = this.resolveMinMax();
        const hAlign = this.HorizontalAlignment;
        const vAlign = this.VerticalAlignment;
        const explicitW = !Number.isNaN(this.Width);
        const explicitH = !Number.isNaN(this.Height);

        // Per-axis render size:
        //   * Explicit Width / Height — always wins, clamped to Min/Max.
        //   * Stretch alignment without explicit size — fill the margined
        //     slot (clamped to Min/Max).
        //   * Anything else — use DesiredSize minus margin (DesiredSize
        //     reported to the parent included margin, so peel it back
        //     out for the actual render size).
        const renderW = explicitW
            ? Visual.clamp(this.Width, mm.minW, mm.maxW)
            : hAlign === HorizontalAlignment.Stretch
                ? Visual.clamp(marginedRect.Width, mm.minW, mm.maxW)
                : Math.max(0, this._desiredSize.Width - margin.Horizontal);

        const renderH = explicitH
            ? Visual.clamp(this.Height, mm.minH, mm.maxH)
            : vAlign === VerticalAlignment.Stretch
                ? Visual.clamp(marginedRect.Height, mm.minH, mm.maxH)
                : Math.max(0, this._desiredSize.Height - margin.Vertical);

        const renderSize = new Size(renderW, renderH);

        // Position within the MARGINED slot per alignment. ArrangedRect
        // is the FINAL aligned rect (margined slot.X + alignment offset,
        // renderSize) — that's what the renderer pushes as a translate
        // and what hit-testing reads as the Visual's bounds. WPF Stretch
        // + explicit size falls back to centered; the same offset formula
        // handles both since Stretch with renderSize < slot has extra > 0.
        const offsetX = Visual.computeOffsetX(hAlign, marginedRect.Width,  renderW);
        const offsetY = Visual.computeOffsetY(vAlign, marginedRect.Height, renderH);

        this._arrangedRect = new Rect(
            marginedRect.X + offsetX,
            marginedRect.Y + offsetY,
            renderW,
            renderH,
        );
        this._renderSize = this.ArrangeOverride(renderSize);
        this._isArrangeValid = true;
    }

    // ------------------------------------------------------------------
    // Layout helpers
    // ------------------------------------------------------------------

    private resolveMinMax(): { minW: number; maxW: number; minH: number; maxH: number }
    {
        const w = this.Width;
        const h = this.Height;
        const minW0 = this.MinWidth;
        const maxW0 = this.MaxWidth;
        const minH0 = this.MinHeight;
        const maxH0 = this.MaxHeight;

        // Explicit Width collapses [min, max] to a single value (clamped
        // to the user's own min/max if they conflict). Same for Height.
        let minW = minW0, maxW = maxW0;
        if (!Number.isNaN(w))
        {
            const locked = Visual.clamp(w, minW0, maxW0);
            minW = locked;
            maxW = locked;
        }

        let minH = minH0, maxH = maxH0;
        if (!Number.isNaN(h))
        {
            const locked = Visual.clamp(h, minH0, maxH0);
            minH = locked;
            maxH = locked;
        }

        return { minW, maxW, minH, maxH };
    }

    private static clamp(v: number, min: number, max: number): number
    {
        return Math.max(min, Math.min(max, v));
    }

    private static computeOffsetX(align: HorizontalAlignment, slotWidth: number, renderWidth: number): number
    {
        const extra = slotWidth - renderWidth;
        if (extra <= 0) return 0; // overflow / exact fit → no offset (clipped at slot origin)
        switch (align)
        {
            case HorizontalAlignment.Left:    return 0;
            case HorizontalAlignment.Right:   return extra;
            case HorizontalAlignment.Center:  return extra / 2;
            case HorizontalAlignment.Stretch: return extra / 2; // Stretch + content < slot → center
        }
    }

    private static computeOffsetY(align: VerticalAlignment, slotHeight: number, renderHeight: number): number
    {
        const extra = slotHeight - renderHeight;
        if (extra <= 0) return 0;
        switch (align)
        {
            case VerticalAlignment.Top:     return 0;
            case VerticalAlignment.Bottom:  return extra;
            case VerticalAlignment.Center:  return extra / 2;
            case VerticalAlignment.Stretch: return extra / 2;
        }
    }

    // Override to place children inside finalSize. Subclasses that
    // contain children call child.Arrange(rect) for each child.
    // Returns the actual size used (typically finalSize).
    //
    // Default returns finalSize — accept whatever the parent provided.
    protected ArrangeOverride(finalSize: Size): Size
    {
        return finalSize;
    }

    // Render pass entry point. Called by the host's renderer when this
    // Visual is render-dirty. Delegates to RenderOverride.
    //
    // Do not override directly — override RenderOverride.
    //
    // Visibility gate: Hidden and Collapsed both suppress painting (WPF
    // parity). The headless target's tree walk also skips visualChildren
    // for non-Visible visuals; the SVG renderer's walk sets display=none
    // on the outer <g> (which CSS-cascades to descendants) and
    // pointer-events=none so the dispatcher's source-finding ignores it.
    public Render(dc: DrawingContext): void
    {
        if (this.Visibility !== Visibility.Visible) return;
        this.RenderOverride(dc);
    }

    // Override to draw this Visual's contribution into the DrawingContext.
    // Children are rendered separately by the renderer's tree walk —
    // RenderOverride should only emit primitives belonging to this Visual.
    //
    // Default is empty — most container Visuals (Single, Panel) are pure
    // composition and contribute nothing; their children do the drawing.
    protected RenderOverride(_dc: DrawingContext): void { }

    // ------------------------------------------------------------------
    // Input handlers
    // ------------------------------------------------------------------
    //
    // Routed-event virtuals. The dispatcher (`dispatchPointer` in
    // routed-event.ts) walks the visual tree twice per event — tunnel
    // root → target calling `OnPreview*`, then bubble target → root
    // calling `On*`. Subclasses override the pair they care about; the
    // base no-op lets every Visual participate in the tree walk
    // without forcing trivial overrides.
    //
    // Setting `args.Handled = true` from any handler stops the
    // remainder of BOTH passes for that event. The dispatcher rewrites
    // `args.Visual` before each call so a handler can branch on it,
    // and sets `args.Strategy` to `'tunnel'` or `'bubble'` so a
    // shared implementation can pick its side.
    //
    // These methods are intentionally not abstract: most Visuals don't
    // care about pointer events, and forcing every subclass to opt
    // into the dispatch interface would explode the override surface.
    //
    // Enter / Leave are direct routed events (WPF semantics) and have
    // no Preview counterpart — they fire on the visual that gained /
    // lost mouse-over only, never on ancestors. IsMouseOver propagation
    // up the ancestor chain happens via the InputManager regardless.

    protected OnPointerEnter       (_args: PointerEventArgs): void { }
    protected OnPointerLeave       (_args: PointerEventArgs): void { }
    protected OnPreviewPointerMove (_args: PointerEventArgs): void { }
    protected OnPointerMove        (_args: PointerEventArgs): void { }
    protected OnPreviewPointerDown (_args: PointerEventArgs): void { }
    protected OnPointerDown        (_args: PointerEventArgs): void { }
    protected OnPreviewPointerUp   (_args: PointerEventArgs): void { }
    protected OnPointerUp          (_args: PointerEventArgs): void { }
    protected OnPreviewPointerWheel(_args: WheelEventArgs): void { }
    protected OnPointerWheel       (_args: WheelEventArgs): void { }

    // Keyboard virtuals — dispatched by InputManager.InjectKeyDown /
    // InjectKeyUp / InjectTextInput when this Visual is the currently
    // focused target (or an ancestor of it for the tunnel / bubble
    // passes). Same Preview / bubble pair pattern as the pointer
    // virtuals; setting args.Handled = true short-circuits both passes.
    // TextInput is a separate event so a handler can subscribe only to
    // "textual" input without seeing every arrow / function key.
    protected OnPreviewKeyDown   (_args: KeyEventArgs): void { }
    protected OnKeyDown          (_args: KeyEventArgs): void { }
    protected OnPreviewKeyUp     (_args: KeyEventArgs): void { }
    protected OnKeyUp            (_args: KeyEventArgs): void { }
    protected OnPreviewTextInput (_args: TextInputEventArgs): void { }
    protected OnTextInput        (_args: TextInputEventArgs): void { }

    // Focus virtuals — fired by InputManager.SetFocus on the Visual that
    // lost focus and the Visual that gained it. Bubble only (no Preview);
    // the IsFocused DP write happens BEFORE the dispatch so handlers see
    // the post-change state.
    protected OnGotFocus  (_args: FocusEventArgs): void { }
    protected OnLostFocus (_args: FocusEventArgs): void { }

    // Drag-event virtuals. Default no-ops; subclasses (and consumer
    // Visuals via AddRoutedEventListener) override these. See
    // dispatchDrag in routed-event.ts for ordering — tunnel + bubble,
    // same shape as the pointer pair. Receivers are gated by AllowDrop;
    // the InputManager only invokes dispatchDrag against an ancestor
    // with AllowDrop=true (findAllowDropAncestor).
    protected OnPreviewDragEnter(_args: DragEventArgs): void { }
    protected OnDragEnter       (_args: DragEventArgs): void { }
    protected OnPreviewDragLeave(_args: DragEventArgs): void { }
    protected OnDragLeave       (_args: DragEventArgs): void { }
    protected OnPreviewDragOver (_args: DragEventArgs): void { }
    protected OnDragOver        (_args: DragEventArgs): void { }
    protected OnPreviewDrop     (_args: DragEventArgs): void { }
    protected OnDrop            (_args: DragEventArgs): void { }

    // ------------------------------------------------------------------
    // Invalidation API
    // ------------------------------------------------------------------

    // Mark this Visual's measure state invalid. Side effect: also
    // invalidates the arrange cache, because a new DesiredSize would
    // make the prior arrangement stale. Always notifies the host's
    // measure queue. Cascades UP the visual tree only if the cache
    // actually transitioned from valid to invalid — without that
    // upward walk, a parent whose own cache is still valid would
    // short-circuit the next top-down Measure pass and never reach
    // this Visual through its MeasureOverride. The "wasValid" check
    // dedups the cascade so it's O(depth-to-first-invalid) per call,
    // and prevents a paired InvalidateMeasure / InvalidateArrange on
    // the same property (Measure | Arrange metadata) from triggering
    // a duplicate upward walk.
    public InvalidateMeasure(): void
    {
        const wasValid = this._isMeasureValid;
        this._isMeasureValid = false;
        this._isArrangeValid = false;
        this._target?.OnMeasureInvalidated(this);
        if (wasValid)
        {
            this._visualParent?.InvalidateMeasure();
        }
    }

    // Mark arrange state invalid. Always notifies the host's arrange
    // queue — even if a prior InvalidateMeasure cleared the cache
    // already, the host still needs to know that arrange specifically
    // was requested for this Visual. Cascades up only on actual
    // transition (same reason as InvalidateMeasure).
    public InvalidateArrange(): void
    {
        const wasValid = this._isArrangeValid;
        this._isArrangeValid = false;
        this._target?.OnArrangeInvalidated(this);
        if (wasValid)
        {
            this._visualParent?.InvalidateArrange();
        }
    }

    // Request a re-render on the next render pass. Render state isn't
    // cached on the Visual (RenderOverride is always re-runnable), so
    // this is purely a host notification. When called on a detached
    // visual (no target), remember the pending invalidation so the
    // next attach can replay it — a recycled container's IsSelected
    // flip during bindContainer happens while the container sits in
    // the pool, and would otherwise never reach the renderer.
    public InvalidateVisual(): void
    {
        if (this._target !== undefined)
        {
            this._target.OnRenderInvalidated(this);
        }
        else
        {
            this._renderInvalidatedWhileDetached = true;
        }
    }

    // ------------------------------------------------------------------
    // Property-change routing
    // ------------------------------------------------------------------

    // Visual override of Model's virtual hook. Consults the property's
    // MetaData flags and routes to the matching Invalidate* method
    // plus — when the property is marked Inherits — pushes the change
    // down the subtree.
    // Pre-write hook — fires for every set_property_value before the
    // EVD's base-value tier is updated. The implicit-transition engine
    // hangs off here so a re-write during an in-flight animation can
    // see the new target value and re-engage (OnPropertyChanged would
    // miss it: the Animated tier is masking the Local write, so the
    // EVD doesn't observe an effective-value change).
    //
    // Skips the Transitions DP itself (changing the collection isn't
    // a property transition source) and any DP whose match against the
    // Transitions collection fails. Reads the current effective value
    // BEFORE the write so the animation starts from where the eye is
    // actually looking (including any in-flight animated value).
    /** § 1.14 — Pre-write listener body. Registered via
     *  `AddBaseValueWriteListener` from `EnsureTransitions` only when
     *  this Visual gains its first PropertyTransition; Visuals
     *  without transitions never see the fanout. */
    private handle_base_value_write(
        descriptor: PropertyDescriptor,
        new_value: any,
    ): void
    {
        if (descriptor.Name === 'Transitions') return;
        const transitions = this.get_property_value(Visual.TransitionsKey) as
            ObservableCollection<PropertyTransition> | undefined;
        if (transitions === undefined || transitions.Count === 0) return;
        for (const t of transitions)
        {
            if (t.Property !== descriptor.Name) continue;
            // Capture the effective value just before the write — picks
            // up an in-flight Animated value when one's active.
            const composed = Model.compose_key(descriptor.RootOwner, descriptor.Name);
            const evd = propertyValues(this).get(composed);
            const old_effective = evd !== undefined ? evd.value : descriptor.DefaultValue;
            applyImplicitTransition(this, descriptor.Name, old_effective, new_value, t);
            return;
        }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        _old_value: any,
        new_value: any,
    ): void
    {
        const meta = descriptor.MetaData;
        if (affectsMeasure(meta)) this.InvalidateMeasure();
        if (affectsArrange(meta)) this.InvalidateArrange();
        if (affectsRender(meta))  this.InvalidateVisual();
        if (inherits(meta))
        {
            this.propagate_inheritance_for_logical_children(descriptor);
            // Overlay children participate in the same inheritance
            // cascade as logical children — see _overlayChildren comment.
            this.forEachOverlayChild(c => c._refresh_inherited(descriptor));
            // Ambient resource triggers (§ 17.1) — ThemeManager registers
            // the Scheme and Theme descriptors as ambient-resource
            // triggers via `_registerAmbientResourceTriggerDp`. When one
            // of those values cascades to this Visual, every
            // DynamicResource binding rooted here must re-resolve so the
            // new scheme's token map drives the next paint.
            if (ResourceResolver.IsAmbientResourceTriggerDp(descriptor))
            {
                this.fire_dynamic_resource_listeners();
            }
        }
        // The public Style setter calls refresh_active_style after
        // writing — but anyone using set_property_value("Style", …)
        // (the compiler-emitted code path, runtime-installed bindings)
        // bypasses that. Detect the Style property here and re-run the
        // resolver so the new Style's setters / triggers install no
        // matter how the property is written.
        if (descriptor.Name === 'Style') this.refresh_active_style();
        // RenderTransform DP changed — rebind the inner-property
        // invalidator so an Angle / ScaleX / TransformGroup.Children
        // change on the new Transform value flags THIS Visual render-
        // dirty. The MetaData.Render flag above already invalidated for
        // the whole-DP swap; this hook covers subsequent inner writes.
        // Cleared on swap-out so a Transform detached from its host
        // doesn't keep an extinct Visual alive.
        if (descriptor.Name === 'RenderTransform' && descriptor.Owner === Visual)
        {
            const oldT = _old_value as Transform | undefined;
            const newT = new_value as Transform | undefined;
            if (oldT !== undefined && typeof oldT._setRenderInvalidator === 'function')
            {
                oldT._setRenderInvalidator(undefined);
            }
            if (newT !== undefined && typeof newT._setRenderInvalidator === 'function')
            {
                newT._setRenderInvalidator(this._renderTransformInvalidator);
            }
        }
        // Install / uninstall the declarative drag-source latch as
        // IsDraggable flips. Listening on PointerDown/Move/Up rather
        // than overriding the virtuals means subclass overrides of
        // OnPointerDown etc. are untouched — both run.
        if (descriptor.Name === 'IsDraggable')
        {
            const nowDraggable = new_value === true;
            if (nowDraggable && !this._draggableInstalled)
            {
                this.AddRoutedEventListener('PointerDown', this._onDragLatchPointerDown);
                this.AddRoutedEventListener('PointerMove', this._onDragLatchPointerMove);
                this.AddRoutedEventListener('PointerUp',   this._onDragLatchPointerUp);
                this._draggableInstalled = true;
            }
            else if (!nowDraggable && this._draggableInstalled)
            {
                this.RemoveRoutedEventListener('PointerDown', this._onDragLatchPointerDown);
                this.RemoveRoutedEventListener('PointerMove', this._onDragLatchPointerMove);
                this.RemoveRoutedEventListener('PointerUp',   this._onDragLatchPointerUp);
                this._draggableInstalled = false;
                this._draggableLatch = null;
            }
        }
    }

    // ------------------------------------------------------------------
    // Property value inheritance
    // ------------------------------------------------------------------

    private walk_inherited(key: string): any | undefined
    {
        // Inheritance follows the LOGICAL tree — DataContext, font
        // properties, etc. flow through "where the consumer wrote
        // this", not "where the template put it visually". For all
        // non-templated trees the logical and visual parents are the
        // same instance, so behavior matches the pre-split codebase.
        //
        // For template-generated Visuals (templatedParent set), the
        // top of the logical chain hops onto the templated control —
        // template internals inherit from the consumer's authored
        // ancestry, with the templated control as the bridge. WPF
        // does the same: a Border inside a Button's template inherits
        // Foreground from the Button, then from the Button's logical
        // ancestors.
        let cursor: Visual = this;
        while (true)
        {
            const next = cursor._logicalParent ?? cursor._templatedParent;
            if (next === undefined) return undefined;
            const evd = propertyValues(next).get(key);
            if (evd !== undefined && evd.Source !== PropertyValueSource.Default)
            {
                return evd.value;
            }
            cursor = next;
        }
    }

    // Re-resolves the inherited value for `descriptor` against the
    // current logical-ancestor chain and updates this Visual's EVD
    // cache. Runs unconditionally — even when a higher-priority source
    // (LocalValue / Binding / Trigger / Style / …) is currently the
    // active source — because the cached InheritedValue slot has to
    // stay fresh for the eventual fall-through when that higher source
    // clears. SetInheritedValue / ClearInherited internally suppress
    // the source flip and change-notification when shadowed, so this
    // method's `walk + push` is cheap when no descendant cascade is
    // warranted.
    /** @internal — § 1.10. Re-resolve the inherited value for the
     *  given descriptor on this Visual; cascade by recursing into
     *  Single / Panel children via their propagate_* overrides. */
    public _refresh_inherited(descriptor: PropertyDescriptor): void
    {
        if (!inherits(descriptor.MetaData)) return;

        const key = Model.compose_key(descriptor.RootOwner, descriptor.Name);
        const value = this.walk_inherited(key);
        if (value !== undefined)
        {
            this.ensure_effective_value_for(descriptor).SetInheritedValue(value);
        }
        else
        {
            propertyValues(this).get(key)?.ClearInherited();
        }
    }

    /** @internal — § 1.10. Refresh every inheritable DP on this
     *  Visual and cascade through the logical + overlay subtree.
     *  Fired when the ancestor chain restructures. */
    public _refresh_inheritance_subtree(): void
    {
        for (const descriptor of Visual.collect_inheritable_descriptors(this.constructor))
        {
            this._refresh_inherited(descriptor);
        }
        this.propagate_inheritance_to_logical_children();
        // Overlay children participate alongside logical children — they're
        // the SAME logical tree from the popup's perspective, just hosted
        // visually by the OverlayLayer instead of by a Panel in the main
        // Content tree.
        this.forEachOverlayChild(c => c._refresh_inheritance_subtree());
    }

    protected propagate_inheritance_to_logical_children(): void
    {
        this.forEachLogicalChild(c => c._refresh_inheritance_subtree());
    }

    protected propagate_inheritance_for_logical_children(descriptor: PropertyDescriptor): void
    {
        this.forEachLogicalChild(c => c._refresh_inherited(descriptor));
    }

    /** Iteration virtual — Single/Panel override. Default empty for
     *  leaf Visuals (the renderer doesn't recurse through children
     *  on a leaf). § 1.15. */
    protected forEachVisualChild(_fn: (child: Visual) => void): void { }

    /** Iteration virtual — Single/Panel override. Default empty.
     *  § 1.15. */
    protected forEachLogicalChild(_fn: (child: Visual) => void): void { }

    // ── DynamicResource re-wire support ──────────────────────────────
    //
    // DynamicResource bindings cache their ancestor-chain subscriptions
    // at construction. Reparenting changes the chain (new ancestors
    // visible, old ones gone), so the binding has to re-walk. Each
    // binding registers a re-wire callback via _subscribe_dynamic_resource;
    // AttachLogical / DetachLogical fire them across the subtree.
    private _dynamic_resource_listeners: Array<() => void> | undefined;

    /** @internal — DynamicResourceBinding only. Subscribes a callback
     *  that fires when this Visual's ancestor chain may have changed.
     *  Returns an unsubscribe thunk. */
    public _subscribe_dynamic_resource(listener: () => void): () => void
    {
        (this._dynamic_resource_listeners ??= []).push(listener);
        return (): void =>
        {
            if (this._dynamic_resource_listeners === undefined) return;
            const i = this._dynamic_resource_listeners.indexOf(listener);
            if (i >= 0) this._dynamic_resource_listeners.splice(i, 1);
        };
    }

    private fire_dynamic_resource_listeners(): void
    {
        safeFire(this._dynamic_resource_listeners);
    }

    /** @internal — § 1.10. Re-walk every DynamicResource binding
     *  rooted in this subtree so cached ancestor-chain subscriptions
     *  pick up the new chain after a reparent / theme override. */
    public _refresh_dynamic_resources_subtree(): void
    {
        this.fire_dynamic_resource_listeners();
        this.propagate_dynamic_resources_to_logical_children();
        // Overlay children's DynamicResource bindings cached against the
        // OLD chain (before this Visual joined / left its ancestor's
        // tree). Re-walking through the popup's subtree re-resolves
        // every `@Token` lookup so theme tokens flip when the owner's
        // chain changes (popup mounted, owner re-parented, etc.).
        this.forEachOverlayChild(c => c._refresh_dynamic_resources_subtree());
    }

    protected propagate_dynamic_resources_to_logical_children(): void
    {
        this.forEachLogicalChild(c => c._refresh_dynamic_resources_subtree());
    }

    private static collect_inheritable_descriptors(klass: Function): PropertyDescriptor[]
    {
        // The dedup key is `${RootOwner.name}.${Name}` — same composite
        // key the per-instance value store uses, so cross-class
        // properties on different owners stay distinct even when their
        // simple Name collides. (Without the RootOwner prefix, a
        // Border.Tag and a TextBlock.Tag would dedupe as one entry.)
        const seen = new Set<string>();
        const result: PropertyDescriptor[] = [];
        let current: Function | null = klass;
        while (current !== null && current !== Function.prototype)
        {
            const bag = peekPropertyBag(current);
            if (bag !== undefined)
            {
                for (const desc of bag.values())
                {
                    if (!inherits(desc.MetaData)) continue;
                    const key = `${desc.RootOwner.name}.${desc.Name}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    result.push(desc);
                }
            }
            current = Object.getPrototypeOf(current);
        }
        // Global cross-class inheritable registry (§ 15.2). Any
        // inheritable property registered on a class NOT in the target
        // Visual's prototype chain still cascades through the logical
        // tree — the registry exposes those descriptors so the
        // per-property _refresh_inherited walk picks them up.
        for (const desc of Model._getInheritableDescriptors())
        {
            const key = `${desc.RootOwner.name}.${desc.Name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(desc);
        }
        return result;
    }
}

// `Single` and `Panel` — child-collection helpers that used to live
// here — moved to [./element.ts](./element.ts) as part of § 1.1: both
// now extend `Element` so future Element-tier machinery (DataContext,
// Style, Resources, Triggers) attaches cleanly without re-touching
// every consumer.
