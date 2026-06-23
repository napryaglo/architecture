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
        for (const visual of this._visuals.values())
        {
            this._mount(visual);
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
        this._unmount(visual);
        this._visuals.delete(item);
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
        for (const visual of this._visuals.values()) this._unmount(visual);
        this._visuals.clear();
    }
}
