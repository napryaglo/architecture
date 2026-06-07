// Diagrammer — node-only MVVM. Edges, ports and any wiring that
// surrounds them have been removed; what remains is a Canvas-based
// scene of movable nodes plus a drag-from-toolbox placement gesture.
// Movement and click-to-select are handled INSIDE the DiagramNode
// control (see src/Controls/diagram-node.ts); selection state lives on
// the Diagram itself (a Selector subclass) — the bootstrap mirrors
// Diagram.SelectedItems onto each NodeVM.IsSelected for chrome.
//
// Surface:
//   * NodeVM         — base for the three shape kinds (DPs: Id, X, Y,
//                      IsSelected, FillBrush, LabelText). IsSelected is
//                      WRITTEN by the bootstrap selection bridge, READ
//                      by the per-shape DataTemplate triggers.
//   * RectNodeVM /
//     EllipseNodeVM /
//     NoteNodeVM     — per-shape defaults via Model.OverrideMetadata
//   * ToolboxShapeVM — one per toolbox tile (DPs: Kind, Label, Swatch,
//                      BeginKindDragData)
//   * DiagramVM      — the host (DPs + ICommands; no view reaches).
//                      Holds the Nodes collection + toolbox catalog +
//                      Save / Load commands. Selection-related commands
//                      moved out — the Selector owns that state now.

import {
    DataObject, DragDropEffects,
    MetaData, Model, ObservableCollection, RelayCommand,
} from '@visualisation-sub/mural/runtime';
import { SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { Color } from '@visualisation-sub/mural/runtime';

const STORAGE_KEY = 'diagram-demo-state-v1';

const brush = (hex) => new SolidColorBrush(Color.FromHex(hex));

const BG_RECT     = brush('#bfdbfe');
const BG_ELLIPSE  = brush('#bbf7d0');
const BG_NOTE     = brush('#fde68a');

export const NODE_W = 130;
export const NODE_H = 60;

// ── NodeVM (base) + per-shape subclasses ────────────────────────────
//
// One concrete subclass per shape kind. Per-kind defaults for FillBrush
// and LabelText ride on Model.OverrideMetadata so each subclass'
// instances pick up its own defaults without per-constructor writes.
// The .mu side has three DataTemplates, each `[DataType=<Subclass>]`,
// so ContentControl's implicit DataTemplate fallback dispatches by
// class identity — no ItemTemplateSelector needed.

export class NodeVM extends Model
{
    static IdKey         = Model.RegisterProperty(NodeVM, 'Id',         undefined, MetaData.None);
    static XKey          = Model.RegisterProperty(NodeVM, 'X',          0,         MetaData.None);
    static YKey          = Model.RegisterProperty(NodeVM, 'Y',          0,         MetaData.None);
    static IsSelectedKey = Model.RegisterProperty(NodeVM, 'IsSelected', false,     MetaData.None);
    static FillBrushKey  = Model.RegisterProperty(NodeVM, 'FillBrush',  undefined, MetaData.None);
    static LabelTextKey  = Model.RegisterProperty(NodeVM, 'LabelText',  '',        MetaData.None);

    static Kind = '';

    constructor(id, x, y) {
        super();
        this._set_property_value_by_name('Id', id);
        this._set_property_value_by_name('X',  x);
        this._set_property_value_by_name('Y',  y);
    }

    get Id()          { return this._get_property_value_by_name('Id'); }
    get Kind()        { return this.constructor.Kind; }
    get X()           { return this._get_property_value_by_name('X'); }
    set X(v)          { this._set_property_value_by_name('X', v); }
    get Y()           { return this._get_property_value_by_name('Y'); }
    set Y(v)          { this._set_property_value_by_name('Y', v); }
    get IsSelected()  { return this._get_property_value_by_name('IsSelected'); }
    set IsSelected(v) { this._set_property_value_by_name('IsSelected', v); }
    get FillBrush()   { return this._get_property_value_by_name('FillBrush'); }
    get LabelText()   { return this._get_property_value_by_name('LabelText'); }
}

export class RectNodeVM extends NodeVM
{
    static Kind = 'rect';
    static {
        Model.OverrideMetadata(RectNodeVM, NodeVM.FillBrushKey, { default_value: BG_RECT });
        Model.OverrideMetadata(RectNodeVM, NodeVM.LabelTextKey, { default_value: 'Rectangle' });
    }
}

export class EllipseNodeVM extends NodeVM
{
    static Kind = 'ellipse';
    static {
        Model.OverrideMetadata(EllipseNodeVM, NodeVM.FillBrushKey, { default_value: BG_ELLIPSE });
        Model.OverrideMetadata(EllipseNodeVM, NodeVM.LabelTextKey, { default_value: 'Ellipse' });
    }
}

export class NoteNodeVM extends NodeVM
{
    static Kind = 'note';
    static {
        Model.OverrideMetadata(NoteNodeVM, NodeVM.FillBrushKey, { default_value: BG_NOTE });
        Model.OverrideMetadata(NoteNodeVM, NodeVM.LabelTextKey, { default_value: 'Note' });
    }
}

const KIND_TO_CLASS = {
    rect:    RectNodeVM,
    ellipse: EllipseNodeVM,
    note:    NoteNodeVM,
};

// ── ToolboxShapeVM ──────────────────────────────────────────────────

export class ToolboxShapeVM extends Model
{
    static {
        Model.RegisterProperty(ToolboxShapeVM, 'Kind',              '',        MetaData.None);
        Model.RegisterProperty(ToolboxShapeVM, 'Label',             '',        MetaData.None);
        Model.RegisterProperty(ToolboxShapeVM, 'Swatch',            undefined, MetaData.None);
        Model.RegisterProperty(ToolboxShapeVM, 'BeginKindDragData', undefined, MetaData.None);
    }

    constructor(kind, label, swatch) {
        super();
        this._set_property_value_by_name('Kind',   kind);
        this._set_property_value_by_name('Label',  label);
        this._set_property_value_by_name('Swatch', swatch);
        this._set_property_value_by_name('BeginKindDragData', () => ({
            data: new DataObject().Set('mural/node-kind', this.Kind),
            effects: DragDropEffects.Copy,
        }));
    }

    get Kind()              { return this._get_property_value_by_name('Kind'); }
    get Label()             { return this._get_property_value_by_name('Label'); }
    get Swatch()            { return this._get_property_value_by_name('Swatch'); }
    get BeginKindDragData() { return this._get_property_value_by_name('BeginKindDragData'); }
}

// ── DiagramVM ───────────────────────────────────────────────────────

export class DiagramVM extends Model
{
    static {
        Model.RegisterProperty(DiagramVM, 'Nodes',         undefined,                          MetaData.None);
        Model.RegisterProperty(DiagramVM, 'ToolboxShapes', undefined,                          MetaData.None);
        Model.RegisterProperty(DiagramVM, 'Status',        'drag a shape from the toolbox →', MetaData.None);
        Model.RegisterProperty(DiagramVM, 'SaveCommand',   undefined,                          MetaData.None);
        Model.RegisterProperty(DiagramVM, 'LoadCommand',   undefined,                          MetaData.None);
    }

    constructor(storage) {
        super();
        this._storage = storage;
        this._set_property_value_by_name('Nodes', new ObservableCollection());
        this._set_property_value_by_name('ToolboxShapes', [
            new ToolboxShapeVM('rect',    'Rectangle', brush('#1976d2')),
            new ToolboxShapeVM('ellipse', 'Ellipse',   brush('#1976d2')),
            new ToolboxShapeVM('note',    'Note',      brush('#fde68a')),
        ]);
        this._nextId = 1;

        this._set_property_value_by_name('SaveCommand',
            new RelayCommand(() => this.Save()));
        this._set_property_value_by_name('LoadCommand',
            new RelayCommand(() => this.Load()));
    }

    get Nodes()         { return this._get_property_value_by_name('Nodes'); }
    get ToolboxShapes() { return this._get_property_value_by_name('ToolboxShapes'); }
    get Status()        { return this._get_property_value_by_name('Status'); }
    set Status(v)       { this._set_property_value_by_name('Status', v); }
    get SaveCommand()   { return this._get_property_value_by_name('SaveCommand'); }
    get LoadCommand()   { return this._get_property_value_by_name('LoadCommand'); }

    CreateNode(kind, x, y) {
        const Cls = KIND_TO_CLASS[kind];
        if (Cls === undefined) return null;
        const id = 'n' + this._nextId++;
        const node = new Cls(id, x, y);
        this.Nodes.Add(node);
        return node;
    }

    // Remove every node in `nodes` from the bound Nodes collection.
    // The Selector reacts via ClearContainerForItemOverride — selection
    // state for the removed rows drops out automatically, so the
    // bootstrap doesn't need to mirror the delete back into selector
    // state.
    DeleteNodes(nodes) {
        if (!Array.isArray(nodes) || nodes.length === 0) return;
        for (const node of nodes) this.removeNode(node);
        this.Status = `Deleted ${nodes.length} node${nodes.length === 1 ? '' : 's'}. ${this.Nodes.Count} remain.`;
    }

    removeNode(node) {
        const idx = this.Nodes.IndexOf(node);
        if (idx >= 0) this.Nodes.RemoveAt(idx);
    }

    // ── Save / Load ───────────────────────────────────────────────

    Save() {
        try {
            const json = JSON.stringify(this.serialize());
            this._storage.SetItem(STORAGE_KEY, json);
            this.Status = `Saved ${this.Nodes.Count} nodes.`;
        } catch (e) {
            this.Status = `Save failed: ${e?.message ?? String(e)}`;
        }
    }

    Load() {
        try {
            const json = this._storage.GetItem(STORAGE_KEY);
            if (json === null) {
                this.Status = 'Nothing saved yet — try Save first.';
                return;
            }
            this.deserialize(JSON.parse(json));
            this.Status = `Loaded ${this.Nodes.Count} nodes.`;
        } catch (e) {
            this.Status = `Load failed: ${e?.message ?? String(e)}`;
        }
    }

    serialize() {
        const nodes = [];
        const items = this.Nodes;
        for (let i = 0; i < items.Count; i++) {
            const v = items.Get(i);
            nodes.push({ id: v.Id, kind: v.Kind, x: v.X, y: v.Y });
        }
        return { nodes, nextId: this._nextId };
    }

    deserialize(payload) {
        if (payload === null || typeof payload !== 'object') return;
        const snapshot = [];
        for (let i = 0; i < this.Nodes.Count; i++) snapshot.push(this.Nodes.Get(i));
        for (const node of snapshot) this.removeNode(node);
        for (const n of payload.nodes ?? []) this.CreateNode(n.kind, n.x, n.y);
    }
}
