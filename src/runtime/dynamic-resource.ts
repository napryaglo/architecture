import { Binding, BindingMode } from './binding.js';
import { MetaData } from './metadata.js';
import { Model } from './model.js';
import type { Visual } from './visual.js';

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
    static {
        // MetaData.None — this Model isn't a Visual, so the
        // Measure / Arrange / Render flags are inert; Value purely
        // serves as the binding source's signal channel.
        Model.RegisterProperty(ResourceWatcher, 'Value', undefined, MetaData.None);
    }

    public get Value(): unknown { return this.get_property_value('Value'); }
    public set Value(v: unknown) { this.set_property_value('Value', v); }
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
class DynamicResourceBinding extends Binding
{
    private readonly watcher: ResourceWatcher;
    private readonly subscriptions: Array<() => void>;
    private readonly host: Visual;
    private readonly key: string;

    constructor(host: Visual, key: string)
    {
        const watcher = new ResourceWatcher();
        super(watcher, 'Value', BindingMode.OneWay);
        this.watcher = watcher;
        this.subscriptions = [];
        this.host = host;
        this.key = key;
        this.wireSubscriptions();
        this.refresh();
    }

    public override dispose(): void
    {
        super.dispose();
        for (const unsub of this.subscriptions) unsub();
        this.subscriptions.length = 0;
    }

    // Walks the host's logical ancestor chain (with templatedParent
    // fallback — same path as TryFindResource) and subscribes to each
    // ResourceDictionary encountered. Any change in any of them
    // triggers a re-resolve.
    private wireSubscriptions(): void
    {
        // Bracket access into Visual's private resource field is
        // intentional — same pattern as model.test.ts's parent_of
        // helper. Reading via the public Resources getter would
        // allocate empty dicts on every walk step.
        type VisualBack = {
            ['_resources']: { Subscribe(l: () => void): () => void } | undefined;
            ['_logicalParent']: Visual | undefined;
            ['_templatedParent']: Visual | undefined;
        };
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

    private refresh(): void
    {
        this.watcher.Value = this.host.TryFindResource(this.key);
    }
}

// Reactive resource reference — install on a property to track a
// resource key. As long as this binding is active, changes to the
// resolved resource (via Set on a dictionary along the resolution
// chain, AddMergedDictionary, etc.) propagate to the target property
// automatically.
//
// Usage:
//   border.set_property_value('Background', DynamicResource(border, 'AccentBrush'));
//
// Behaviorally equivalent to a Binding source, so it composes with
// the EVD's value-source priority (Binding sits above LocalValue and
// InheritedValue). Replacing the binding (or calling ClearValue)
// disposes the resource subscriptions.
//
// Limitations:
//   * Subscriptions are wired at construction from the host's current
//     ancestor chain. Re-parenting the host AFTER construction won't
//     re-wire — re-create the binding if you reshape the tree under
//     the host.
//   * A dictionary that joins the resolution chain later (an ancestor
//     having its first Resources access AFTER construction) won't be
//     observed. The common case of consuming resources from a fixed
//     ancestor (Application / Window / templated control) is fully
//     supported.
export function DynamicResource(host: Visual, key: string): Binding
{
    return new DynamicResourceBinding(host, key);
}
