import { FillBehavior, Storyboard } from '../../visual-engine/animation/index.js';
import { Application } from '../application.js';
import { Binding, BindingMode } from './binding.js';
import { MetaData } from '../metadata.js';
import { Model } from '../model.js';
import { getSchemeTransitionAnimator, ThemeManager } from '../../visual-engine/theme/index.js';
import type { Visual } from '../../visual-engine/visual.js';

// Internal Model that holds the most-recent resolved value of a
// resource lookup. Used as the source of the Binding handed back by
// DynamicResource — when the watcher's Value changes (because some
// dictionary along the resolution path was mutated), the Binding's
// change-notification machinery fires and pushes the new value to the
// EVD that owns the binding.
//
// Not exported — DynamicResource owns the lifecycle.
class ResourceWatcher extends Model
{
    // MetaData.None — this Model isn't a Visual, so the
    // Measure / Arrange / Render flags are inert; Value purely
    // serves as the binding source's signal channel.
    public static readonly ValueKey = Model.RegisterProperty<unknown>(
        ResourceWatcher, 'Value', undefined, MetaData.None);

    public get Value(): unknown { return this.get_property_value(ResourceWatcher.ValueKey); }
    public set Value(v: unknown) { this.set_property_value(ResourceWatcher.ValueKey, v); }
}

// Binding subclass for resource references. The binding source is an
// internal ResourceWatcher whose Value is kept in sync with the
// resolved resource. Overrides dispose so subscriptions on the
// resource dictionaries along the resolution path are torn down when
// the binding is replaced or cleared.
//
// The reactive subscription is established at construction by walking
// the host Visual's ancestor chain at that moment. Subsequent tree
// mutations (re-parenting, adding a Resources dict to an ancestor
// that didn't have one) WON'T re-wire subscriptions automatically —
// a known limitation of this first-cut implementation, called out so
// callers know to re-create the binding if they reshape the tree.
// Lightweight duck-test for "is this object a Visual". Avoids importing
// the Visual class concretely (would create a runtime circular import).
// A Visual exposes TryFindResource AND _subscribe_dynamic_resource —
// both are needed by the wiring path below.
function isVisualHost(host: object): host is Visual
{
    return typeof (host as { TryFindResource?: unknown }).TryFindResource === 'function';
}

class DynamicResourceBinding extends Binding
{
    private readonly watcher: ResourceWatcher;
    private readonly subscriptions: Array<() => void>;
    private readonly host: Visual | Model;
    private readonly key: string;
    private readonly unsubscribeRewire: (() => void) | undefined;
    // In-flight scheme-transition animation driven by this binding. Held
    // so the next refresh / dispose can Stop() it cleanly; otherwise a
    // back-to-back scheme swap would leave the prior animation pinning
    // the animated slot.
    private activeStoryboard: Storyboard | undefined;

    constructor(host: Visual | Model, key: string)
    {
        const watcher = new ResourceWatcher();
        super(watcher, 'Value', BindingMode.OneWay);
        this.watcher = watcher;
        this.subscriptions = [];
        this.host = host;
        this.key = key;
        this.wireSubscriptions();
        this.refresh();
        // Re-walk the ancestor chain whenever the host is attached /
        // detached. Visual._refresh_dynamic_resources_subtree fires this
        // callback on every binding registered against any node in the
        // affected subtree. Non-Visual hosts (Pen resources, Brush
        // resources, …) have no visual tree, so no re-wire hook.
        this.unsubscribeRewire = isVisualHost(host)
            ? host._subscribe_dynamic_resource(() => { this.rewire(); })
            : undefined;
    }

    public override dispose(): void
    {
        super.dispose();
        this.unsubscribeRewire?.();
        for (const unsub of this.subscriptions) unsub();
        this.subscriptions.length = 0;
        this.activeStoryboard?.Stop();
        this.activeStoryboard = undefined;
    }

    // Tear down the current ancestor-chain subscriptions and re-walk.
    // Called on AttachLogical / DetachLogical via the host's re-wire
    // listener list.
    private rewire(): void
    {
        for (const unsub of this.subscriptions) unsub();
        this.subscriptions.length = 0;
        this.wireSubscriptions();
        this.refresh();
    }

    // Walks the host's logical ancestor chain (with templatedParent
    // fallback — same path as TryFindResource) and subscribes to each
    // ResourceDictionary encountered. After the chain walk also
    // subscribes to Application.current.Resources — the Application
    // is NOT a Visual, so the ancestor walk never reaches its
    // dictionary, but TryFindResource's Application-level fallback
    // does consult it. Theme dictionaries (Material light/dark) live
    // there, so a SetTheme swap has to propagate to existing bindings
    // even when the host has no resource-bearing visual ancestors.
    // Any change in any of them triggers a re-resolve.
    private wireSubscriptions(): void
    {
        // Bracket access into Visual's private resource field is
        // intentional — same pattern as model.test.ts's parent_of
        // helper. Reading via the public Resources getter would
        // allocate empty dicts on every walk step. Non-Visual hosts
        // (resource-block instances like Pen / Brush) have no visual
        // tree, so the ancestor walk is skipped and only Application's
        // Resources subscription drives re-resolution.
        type VisualBack = {
            ['_resources']: { Subscribe(l: () => void): () => void } | undefined;
            ['_logicalParent']: Visual | undefined;
            ['_templatedParent']: Visual | undefined;
        };
        if (isVisualHost(this.host))
        {
            let cursor: Visual | undefined = this.host;
            while (cursor !== undefined)
            {
                const back = cursor as unknown as VisualBack;
                const dict = back['_resources'];
                if (dict !== undefined)
                {
                    this.subscriptions.push(dict.Subscribe(() => this.refresh()));
                }
                cursor = back['_logicalParent'] ?? back['_templatedParent'];
            }
        }
        const app = Application.current;
        if (app !== undefined && app !== null)
        {
            this.subscriptions.push(app.Resources.Subscribe(() => this.refresh()));
        }
    }

    private refresh(): void
    {
        const oldValue = this.watcher.Value;
        // Visual hosts walk their ancestor chain (Style → logical
        // parent → ambient scheme → Application defaults). Non-Visual
        // hosts skip straight to the Application-level fallback —
        // that's where theme bundles live, so theme-token references
        // (`@Primary`, …) still resolve from a Pen / Brush resource.
        const newValue = isVisualHost(this.host)
            ? this.host.TryFindResource(this.key)
            : Application.ResolveDefaultResource(this.key);
        if (oldValue === newValue) return;

        // Animation gate. Skip the factory entirely when no transition is
        // effective, when policy says 'none', when there's nothing to
        // animate from (initial resolution), or when no factory has been
        // registered. The factory itself returns undefined for value
        // pairs it can't animate (non-Brush, mixed types, …) — that path
        // also snaps.
        let timeline = undefined;
        const transition = ThemeManager.EffectiveSchemeTransition;
        const factory    = getSchemeTransitionAnimator();
        if (transition !== undefined
            && transition.tokens !== 'none'
            && factory    !== undefined
            && oldValue   !== undefined)
        {
            timeline = factory(oldValue, newValue, transition);
        }

        if (timeline === undefined)
        {
            // Snap path. Drop any in-flight animation so a subsequent
            // resolution doesn't inherit a stale storyboard.
            this.activeStoryboard?.Stop();
            this.activeStoryboard = undefined;
            this.watcher.Value = newValue;
            return;
        }

        // Animate path. FillBehavior.Stop releases the animated slot at
        // the end so the LocalValue (= newValue, written below) becomes
        // the steady-state visible value rather than a perpetually-pinned
        // animation slot. The factory's chosen FillBehavior is ignored —
        // scheme transitions always release.
        timeline.FillBehavior = FillBehavior.Stop;

        const sb = new Storyboard();
        sb.Add(this.watcher, 'Value', timeline);
        sb.AddCompletedListener(() =>
        {
            if (this.activeStoryboard === sb) this.activeStoryboard = undefined;
        });

        // Stop the prior animation before replacing the slot. The Stop
        // clears the animated slot and surfaces whatever LocalValue the
        // watcher carries; the immediate Local write below overwrites
        // it; then Begin() captures the new Local as baseValue and
        // AdvanceTo(0) writes the new animated slot. All three steps
        // run in one synchronous block, so the consumer's render
        // invalidation batches into a single redraw at the next frame.
        this.activeStoryboard?.Stop();
        this.activeStoryboard = sb;
        this.watcher.Value = newValue;
        sb.Begin();
    }
}

// Reactive resource reference — install on a property to track a
// resource key. As long as this binding is active, changes to the
// resolved resource (via Set on a dictionary along the resolution
// chain, AddMergedDictionary, etc.) propagate to the target property
// automatically.
//
// Usage:
//   border.set_property_value(Border.BackgroundKey, DynamicResource(border, 'AccentBrush'));
//
// Behaviorally equivalent to a Binding source, so it composes with
// the EVD's value-source priority (Binding sits above LocalValue and
// InheritedValue). Replacing the binding (or calling ClearValue)
// disposes the resource subscriptions.
//
// Reactivity to tree changes:
//   * Subscriptions are wired at construction from the host's current
//     ancestor chain AND re-wired automatically on every
//     AttachLogical / DetachLogical that affects the host's subtree
//     (via Visual._refresh_dynamic_resources_subtree). So reparenting
//     "just works" — any new ancestor's Resources dict becomes
//     observable on attach, dropped ancestors stop firing on detach.
//   * A dictionary that joins the resolution chain later WITHOUT a
//     tree mutation (an ancestor having its first Resources access
//     AFTER construction without being detached / re-attached) won't
//     be observed. The common case of consuming resources from a
//     fixed ancestor (Application / Window / templated control) is
//     fully supported.
export function DynamicResource(host: Visual | Model, key: string): Binding
{
    return new DynamicResourceBinding(host, key);
}
