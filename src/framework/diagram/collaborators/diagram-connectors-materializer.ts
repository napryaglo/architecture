import {
    type CollectionChange,
    type Model,
    type Visual,
} from '../../../runtime/index.js';
import { Connector } from '../connector.js';
import { DiagramLayer, DiagramLayersPanel } from '../diagram-layers-panel.js';
import type { Diagram } from '../diagram.js';

// Internal collaborator owned by Diagram. Materializes one Visual per
// entry in Diagram.Connectors via ConnectorTemplate (or the built-in
// `new Connector()` fallback), tracks the item → Visual mapping, and
// mounts each one into the connectors layer of Diagram's ItemsPanel
// when that panel is a DiagramLayersPanel.
//
// Diagram listens to its own Connectors / ConnectorTemplate DPs and
// forwards changes via the public _on* methods — the collaborator
// itself doesn't subscribe to Diagram's DPs to keep the dependency
// direction one-way (Diagram → collaborator).
export class DiagramConnectorsMaterializer
{
    private readonly _diagram: Diagram;
    private readonly _visuals: Map<Model, Visual> = new Map();
    private _collectionUnsub: (() => void) | undefined = undefined;

    // Per-connector cap bookkeeping. `_mountedCaps` is the set of cap
    // visuals currently in the connectors layer for a given item;
    // `_capUnsubs` detaches the cap-template DP listeners that keep that
    // set in sync when a connector's Source/TargetCapTemplate flips.
    private readonly _mountedCaps: Map<Model, Visual[]> = new Map();
    private readonly _capUnsubs:   Map<Model, () => void> = new Map();

    // Per-connector label visual (§ Slice 5). The connector's ShapeText is
    // mounted as a connectors-layer sibling, just like a cap; the connector
    // positions it (Canvas.Left/Top) on each route recompute.
    private readonly _mountedLabels: Map<Model, Visual> = new Map();

    constructor(diagram: Diagram)
    {
        this._diagram = diagram;
    }

    public get MaterializedVisuals(): ReadonlyMap<Model, Visual> { return this._visuals; }

    /** @internal — called by Diagram.OnPropertyChanged on the Connectors DP. */
    public _onConnectorsCollectionChanged(): void
    {
        this._collectionUnsub?.();
        this._collectionUnsub = undefined;
        this._clearAll();

        const collection = this._diagram.Connectors;
        if (collection === undefined) return;

        for (let i = 0; i < collection.Count; i++)
        {
            const item = collection.Get(i)!;
            this._materializeAndMount(item);
        }
        this._collectionUnsub = collection.Subscribe(c => this._onCollectionChange(c));
    }

    /** @internal — called by Diagram.OnPropertyChanged on the ConnectorTemplate DP. */
    public _onTemplateChanged(): void
    {
        const collection = this._diagram.Connectors;
        if (collection === undefined) return;
        // Rebuild all current items against the new template.
        this._clearAll();
        for (let i = 0; i < collection.Count; i++)
        {
            this._materializeAndMount(collection.Get(i)!);
        }
    }

    /** @internal — Diagram calls this once its ItemsPanelInstance
     *  becomes available (the initial subscribe runs before the
     *  template materializes the panel; this re-mounts pending
     *  visuals once the panel is ready). */
    public _mountPending(): void
    {
        for (const [item, visual] of this._visuals)
        {
            this._mount(visual);
            // Caps + label couldn't mount while the panel was absent; sync now.
            if (visual instanceof Connector)
            {
                this._syncCaps(item, visual);
                this._mountLabel(item, visual);
            }
        }
    }

    private _onCollectionChange(change: CollectionChange<Model>): void
    {
        switch (change.kind)
        {
            case 'inserted':
                for (const item of change.items) this._materializeAndMount(item);
                break;
            case 'removed':
                for (const item of change.items) this._unmaterialize(item);
                break;
            case 'replaced':
                this._unmaterialize(change.oldItem);
                this._materializeAndMount(change.newItem);
                break;
            case 'cleared':
                this._clearAll();
                break;
            case 'moved':
                // Visual identity preserved; nothing to rebuild.
                break;
        }
    }

    private _materializeAndMount(item: Model): void
    {
        if (this._visuals.has(item)) return;
        const visual = this._instantiate(item);
        this._visuals.set(item, visual);
        this._mount(visual);
        this._wireCaps(item, visual);
        this._mountLabel(item, visual);
    }

    // Mount the connector's label ShapeText as a connectors-layer sibling.
    // Idempotent (_mountCap no-ops when already present), so _mountPending
    // can re-run it once the panel materializes. The connector positions the
    // label via Canvas.Left/Top in _placeLabel — the same absolute-canvas
    // coordinate space caps and the route line use.
    private _mountLabel(item: Model, visual: Visual): void
    {
        if (!(visual instanceof Connector)) return;
        const label = visual.LabelInstance;
        DiagramLayersPanel.SetLayer(label, DiagramLayer.Connectors);
        this._mountCap(label);
        this._mountedLabels.set(item, label);
    }

    private _teardownLabel(item: Model): void
    {
        const label = this._mountedLabels.get(item);
        if (label !== undefined)
        {
            this._unmountCap(label);
            this._mountedLabels.delete(item);
        }
    }

    // Mount the connector's cap visuals as siblings in the connectors
    // layer and keep that set live. Caps carry absolute diagram-host
    // coordinates via Canvas.Left/Top (placeCap) — the same space the
    // connector line paints in — so a plain sibling-in-the-Canvas mount
    // positions and rotates them correctly. The connector creates /
    // replaces its cap instances reactively (default cap in the ctor,
    // swaps when Source/TargetCapTemplate flips); we re-sync on those DP
    // changes. The connector's own OnPropertyChanged runs BEFORE this
    // listener (internal callback precedes user listeners), so the
    // *CapInstance getters already hold the fresh visuals here.
    private _wireCaps(item: Model, visual: Visual): void
    {
        if (!(visual instanceof Connector)) return;
        const connector = visual;
        const onCaps = (): void => this._syncCaps(item, connector);
        connector.AddPropertyChangedListener(Connector.SourceCapTemplateKey, onCaps);
        connector.AddPropertyChangedListener(Connector.TargetCapTemplateKey, onCaps);
        this._capUnsubs.set(item, () => {
            connector.RemovePropertyChangedListener(Connector.SourceCapTemplateKey, onCaps);
            connector.RemovePropertyChangedListener(Connector.TargetCapTemplateKey, onCaps);
        });
        this._syncCaps(item, connector);
    }

    private _syncCaps(item: Model, connector: Connector): void
    {
        const panel = this._diagram.ItemsPanelInstance;
        if (panel === undefined) return;          // wait for layout (_mountPending re-runs)

        const desired: Visual[] = [];
        const src = connector.SourceCapInstance;
        const tgt = connector.TargetCapInstance;
        if (src !== undefined) desired.push(src);
        if (tgt !== undefined) desired.push(tgt);

        const prev = this._mountedCaps.get(item) ?? [];
        for (const cap of prev)
        {
            if (!desired.includes(cap)) this._unmountCap(cap);
        }
        for (const cap of desired)
        {
            if (prev.includes(cap)) continue;
            // Route to the connectors layer (behind figures), same as the
            // connector line itself.
            DiagramLayersPanel.SetLayer(cap, DiagramLayer.Connectors);
            this._mountCap(cap);
        }
        if (desired.length === 0) this._mountedCaps.delete(item);
        else this._mountedCaps.set(item, desired);
    }

    private _mountCap(cap: Visual): void
    {
        const panel = this._diagram.ItemsPanelInstance;
        if (panel === undefined) return;
        if (panel instanceof DiagramLayersPanel)
        {
            if (panel.ConnectorsLayer.Children.IndexOf(cap) !== -1) return;
            panel.AddChild(cap);
            return;
        }
        if ((panel as { Children?: { IndexOf?(v: Visual): number } }).Children?.IndexOf?.(cap) !== -1) return;
        (panel as { AddChild?(v: Visual): void }).AddChild?.(cap);
    }

    private _unmountCap(cap: Visual): void
    {
        const panel = this._diagram.ItemsPanelInstance;
        if (panel === undefined) return;
        if (panel instanceof DiagramLayersPanel)
        {
            panel.RemoveChild(cap);
            return;
        }
        (panel as { RemoveChild?(v: Visual): void }).RemoveChild?.(cap);
    }

    private _instantiate(item: Model): Visual
    {
        // Items-are-Connectors convention (§ 1a). A Connector entry
        // IS the Visual that renders; skip template wrap so the same
        // model instance the consumer pushed into Connectors stays
        // the one on screen. Mirrors the items-are-Figures branch in
        // [diagram.ts]'s GetContainerForItemOverride.
        let visual: Visual;
        if (item instanceof Connector)
        {
            visual = item;
        }
        else
        {
            const template = this._diagram.ConnectorTemplate;
            visual = template !== undefined ? template.Apply(item) : new Connector();
            visual.DataContext = item;
        }
        // Mark this visual for the connectors layer; DiagramLayersPanel
        // reads the attached property at AddChild time and routes to
        // the inner connectors Canvas.
        DiagramLayersPanel.SetLayer(visual, DiagramLayer.Connectors);
        return visual;
    }

    private _mount(visual: Visual): void
    {
        const panel = this._diagram.ItemsPanelInstance;
        if (panel === undefined) return;          // wait for layout
        if (panel instanceof DiagramLayersPanel)
        {
            // Don't double-add. Already-mounted visuals are no-ops.
            if (panel.ConnectorsLayer.Children.IndexOf(visual) !== -1) return;
            panel.AddChild(visual);
            return;
        }
        // Non-layered panel fallback — add at the panel's tail.
        // Connectors end up co-mingled with figure containers; the
        // consumer wanting layered z-order opts into DiagramLayersPanel.
        if ((panel as { Children?: { IndexOf?(v: Visual): number } }).Children?.IndexOf?.(visual) !== -1) return;
        (panel as { AddChild?(v: Visual): void }).AddChild?.(visual);
    }

    private _unmaterialize(item: Model): void
    {
        const visual = this._visuals.get(item);
        if (visual === undefined) return;
        this._teardownCaps(item);
        this._teardownLabel(item);
        this._unmount(visual);
        this._visuals.delete(item);
    }

    // Detach the cap-template listeners and unmount any cap visuals this
    // item had in the connectors layer.
    private _teardownCaps(item: Model): void
    {
        this._capUnsubs.get(item)?.();
        this._capUnsubs.delete(item);
        const caps = this._mountedCaps.get(item);
        if (caps !== undefined)
        {
            for (const cap of caps) this._unmountCap(cap);
            this._mountedCaps.delete(item);
        }
    }

    private _unmount(visual: Visual): void
    {
        const panel = this._diagram.ItemsPanelInstance;
        if (panel === undefined) return;
        if (panel instanceof DiagramLayersPanel)
        {
            panel.RemoveChild(visual);
            return;
        }
        (panel as { RemoveChild?(v: Visual): void }).RemoveChild?.(visual);
    }

    private _clearAll(): void
    {
        for (const item of this._visuals.keys())
        {
            this._teardownCaps(item);
            this._teardownLabel(item);
        }
        for (const visual of this._visuals.values()) this._unmount(visual);
        this._visuals.clear();
    }
}
