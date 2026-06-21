// Diagrammer — node-only MVVM, geometry-first model.
//
// Every node is a single `ShapeNodeVM` carrying a `Geometry`
// (PathGeometry) DP that the canvas template renders via the generic
// `Shape` primitive's DrawGeometry path. The per-kind silhouette comes
// from `SHAPE_CATALOG` (./shape-catalog.mjs): at module load the
// catalog extracts a normalized unit-1 PathGeometry from each Shape
// subclass's RenderOverride; per-node Geometry composes that base with
// a `ScaleTransform(Width, Height)` so resize stretches the silhouette
// without re-extracting the path.
//
// Surface:
//   * ShapeNodeVM    — single class. DPs: Id, Kind (catalog key), X, Y,
//                      Width, Height, IsSelected, FillBrush, Stroke,
//                      LabelText, Geometry. Width / Height changes
//                      rebuild Geometry via the catalog's
//                      buildNodeGeometry helper.
//   * ToolboxShapeVM — one per tile. DPs: Kind, Label, PreviewNode (a
//                      48×48 ShapeNodeVM the tile renders via the same
//                      single DataTemplate the canvas uses),
//                      BeginKindDragData.
//   * DiagramVM      — host. Holds Nodes + ToolboxShapes catalogue
//                      (driven by SHAPE_CATALOG) + Save / Load
//                      commands. CreateNode builds a ShapeNodeVM with
//                      catalog-supplied geometry.

import {
    DataObject, DragDropEffects,
    MetaData, Model, ObservableCollection, RelayCommand,
} from '@visualisation-sub/mural/runtime';
import {
    Pen,
    SolidColorBrush,
    pathGeometryFromSvgD,
    pathGeometryToSvgD,
} from '@visualisation-sub/mural/visual-engine';
import { Color } from '@visualisation-sub/mural/runtime';
import {
    GeometryCombineMode,
    SHAPE_CATALOG,
    SHAPE_CATALOG_MAP,
    mergeShapes,
    scaleGeometry,
} from './shape-catalog.mjs';

const STORAGE_KEY = 'diagram-demo-state-v1';

const brush = (hex) => new SolidColorBrush(Color.FromHex(hex));

// Canvas-node default fill — pastel tint that reads on @Surface in
// both Light and Dark Material schemes. Toolbox-preview default fill
// is a fuller @Primary-equivalent so the 48×48 picture stays legible.
const FILL_CANVAS  = brush('#bfdbfe');
const FILL_PREVIEW = brush('#1976d2');
// Stroke-brush ref shared between the per-instance default Pens —
// safe because Pen.Brush is a Brush REFERENCE, and the brush itself
// is never mutated (ShapeFormatControl replaces the Brush wholesale
// when the user edits the stroke colour).
const STROKE_BRUSH = brush('#1976d2');

export const NODE_DEFAULT_SIZE = 80;
export const PREVIEW_SIZE      = 48;

// Lookup from the by-name Pen property identifiers used by
// _attachFormatStrokeListeners / _detachFormatStrokeListeners to the
// typed Key handles exposed by the Pen class. Centralized so the
// listener attach / detach code can subscribe through the typed-key
// API without sprouting a switch per call site.
const PEN_PROP_KEYS = {
    Brush:      Pen.BrushKey,
    Thickness:  Pen.ThicknessKey,
    DashStyle:  Pen.DashStyleKey,
    LineCap:    Pen.LineCapKey,
    LineJoin:   Pen.LineJoinKey,
    MiterLimit: Pen.MiterLimitKey,
};

// ── ShapeNodeVM ──────────────────────────────────────────────────────
//
// Single class — no per-Kind subclasses. `Kind` is metadata (catalog
// key, drives Save/Load and toolbox preview); `Geometry` is the
// rendered PathGeometry, rebuilt from the catalog on every Width /
// Height change.

export class ShapeNodeVM extends Model
{
    static IdKey         = Model.RegisterProperty(ShapeNodeVM, 'Id',         undefined,         MetaData.None);
    static KindKey       = Model.RegisterProperty(ShapeNodeVM, 'Kind',       '',                MetaData.None);
    static XKey          = Model.RegisterProperty(ShapeNodeVM, 'X',          0,                 MetaData.None);
    static YKey          = Model.RegisterProperty(ShapeNodeVM, 'Y',          0,                 MetaData.None);
    static WidthKey      = Model.RegisterProperty(ShapeNodeVM, 'Width',      NODE_DEFAULT_SIZE, MetaData.None);
    static HeightKey     = Model.RegisterProperty(ShapeNodeVM, 'Height',     NODE_DEFAULT_SIZE, MetaData.None);
    static IsSelectedKey = Model.RegisterProperty(ShapeNodeVM, 'IsSelected', false,             MetaData.None);
    static FillBrushKey  = Model.RegisterProperty(ShapeNodeVM, 'FillBrush',  FILL_CANVAS,       MetaData.None);
    // Stroke = the shape's outline Pen. Per-instance — each shape gets
    // its own Pen so PenEditor's in-place mutations don't leak between
    // shapes. Default constructed in the ctor; DP default is undefined.
    static StrokeKey     = Model.RegisterProperty(ShapeNodeVM, 'Stroke',     undefined,         MetaData.None);
    static LabelTextKey  = Model.RegisterProperty(ShapeNodeVM, 'LabelText',  '',                MetaData.None);
    // Geometry = the rendered PathGeometry. Always present — either
    // built from the catalog (kind-based ctor / toolbox drop) or parsed
    // from a saved SVG-d string (Load). Width / Height changes rebuild
    // it via the catalog's buildNodeGeometry helper (or a transform-
    // re-scaling path for d-string nodes).
    static GeometryKey   = Model.RegisterProperty(ShapeNodeVM, 'Geometry',   undefined,         MetaData.None);

    // Three construction paths:
    //
    //   { kind }                — toolbox drop / CreateNode. Pulls the
    //                             unit-1 source from the catalog.
    //   { source }              — combined-geometry path (boolean ops,
    //                             custom paths). `source` is itself a
    //                             unit-1 PathGeometry; the caller is
    //                             responsible for normalizing.
    //   { source, kind }        — catalog-derived but pre-extracted by
    //                             the caller (Load with cached d-string).
    //
    // In every case the node holds `_source` (a unit-1 PathGeometry)
    // as the source of truth. The visible `Geometry` DP is computed by
    // scaling `_source` to (Width, Height); resize rebuilds it from
    // the same source — no information loss across repeated resizes.
    constructor(id, x, y, options) {
        super();
        this.set_property_value(ShapeNodeVM.IdKey, id);
        this.set_property_value(ShapeNodeVM.XKey,  x);
        this.set_property_value(ShapeNodeVM.YKey,  y);
        this.set_property_value(ShapeNodeVM.StrokeKey, new Pen(STROKE_BRUSH, 1.5));

        const opts = options ?? {};
        if (opts.width  !== undefined) this.set_property_value(ShapeNodeVM.WidthKey,  opts.width);
        if (opts.height !== undefined) this.set_property_value(ShapeNodeVM.HeightKey, opts.height);

        if (opts.source !== undefined)
        {
            this._source = opts.source;
            if (opts.kind !== undefined) this.set_property_value(ShapeNodeVM.KindKey, opts.kind);
        }
        else if (opts.kind !== undefined && SHAPE_CATALOG_MAP.has(opts.kind))
        {
            this.set_property_value(ShapeNodeVM.KindKey, opts.kind);
            this._source = SHAPE_CATALOG_MAP.get(opts.kind).unit();
        }
        else
        {
            throw new Error(`ShapeNodeVM: needs either a known kind or a source PathGeometry (got kind=${opts.kind})`);
        }

        this.set_property_value(ShapeNodeVM.GeometryKey,
            scaleGeometry(this._source, this.Width, this.Height));
        // Rebuild on size changes — the alignment / resize-adorner
        // paths write Width / Height directly on selected nodes.
        this.AddPropertyChangedListener(ShapeNodeVM.WidthKey,  () => this._rebuildGeometry());
        this.AddPropertyChangedListener(ShapeNodeVM.HeightKey, () => this._rebuildGeometry());

        // Group back-ref. undefined ≡ "top-level node" (not inside any
        // GroupVM). View-invisible structural metadata, so plain field.
        this.Parent = undefined;
    }

    get Id()          { return this.get_property_value(ShapeNodeVM.IdKey); }
    set Id(v)         { this.set_property_value(ShapeNodeVM.IdKey, v); }
    get Kind()        { return this.get_property_value(ShapeNodeVM.KindKey); }
    set Kind(v)       { this.set_property_value(ShapeNodeVM.KindKey, v); }
    get X()           { return this.get_property_value(ShapeNodeVM.XKey); }
    set X(v)          { this.set_property_value(ShapeNodeVM.XKey, v); }
    get Y()           { return this.get_property_value(ShapeNodeVM.YKey); }
    set Y(v)          { this.set_property_value(ShapeNodeVM.YKey, v); }
    get Width()       { return this.get_property_value(ShapeNodeVM.WidthKey); }
    set Width(v)      { this.set_property_value(ShapeNodeVM.WidthKey, v); }
    get Height()      { return this.get_property_value(ShapeNodeVM.HeightKey); }
    set Height(v)     { this.set_property_value(ShapeNodeVM.HeightKey, v); }
    get IsSelected()  { return this.get_property_value(ShapeNodeVM.IsSelectedKey); }
    set IsSelected(v) { this.set_property_value(ShapeNodeVM.IsSelectedKey, v); }
    get FillBrush()   { return this.get_property_value(ShapeNodeVM.FillBrushKey); }
    set FillBrush(v)  { this.set_property_value(ShapeNodeVM.FillBrushKey, v); }
    get Stroke()      { return this.get_property_value(ShapeNodeVM.StrokeKey); }
    set Stroke(v)     { this.set_property_value(ShapeNodeVM.StrokeKey, v); }
    get LabelText()   { return this.get_property_value(ShapeNodeVM.LabelTextKey); }
    set LabelText(v)  { this.set_property_value(ShapeNodeVM.LabelTextKey, v); }
    get Geometry()    { return this.get_property_value(ShapeNodeVM.GeometryKey); }
    set Geometry(v)   { this.set_property_value(ShapeNodeVM.GeometryKey, v); }

    _rebuildGeometry() {
        if (this._source === undefined) return;
        this.set_property_value(ShapeNodeVM.GeometryKey,
            scaleGeometry(this._source, this.Width, this.Height));
    }
}

// ── GroupVM ─────────────────────────────────────────────────────────
//
// First-class group entity (option C from the brainstorm). Holds an
// observable list of `Members` — each member is either a `ShapeNodeVM`
// (leaf) or another `GroupVM` (nested). Exposes the same X / Y / Width /
// Height shape as ShapeNodeVM so recursive bbox math on nested groups
// can read `.X / .Y / .Width / .Height` regardless of member type.
//
// X / Y / Width / Height are COMPUTED from the union bbox of members.
// They're real DPs (so they fire change notifications and a binding on
// the bbox-adorner picks them up live). Width / Height are read-only —
// driven by `_recomputeBounds` only. X / Y ALSO accept writes from
// alignment / distribute commands: the setter translates the assignment
// into a rigid shift of every member by the delta, then re-runs
// `_recomputeBounds` once. Nested groups recurse through the same
// setter, so a top-level shift settles every leaf at any depth.
//
// `IsSelected` is the same shape as on ShapeNodeVM. The selection bridge
// elevates a clicked member to its TOP-LEVEL ancestor and flips IsSelected
// on THAT entity only — members of a selected group stay IsSelected=false,
// so the group's bbox template (dashed border) is the single piece of
// selection chrome the user sees for the whole group.
//
// `Parent` is a back-reference — undefined when the group is at the top
// level of DiagramVM.Groups. Plain field (view-invisible structural
// metadata; per CLAUDE.md, DPs only for state the view reads / reacts to).
export class GroupVM extends Model
{
    static IsSelectedKey = Model.RegisterProperty(GroupVM, 'IsSelected', false, MetaData.None);
    static XKey          = Model.RegisterProperty(GroupVM, 'X',          0,     MetaData.None);
    static YKey          = Model.RegisterProperty(GroupVM, 'Y',          0,     MetaData.None);
    static WidthKey      = Model.RegisterProperty(GroupVM, 'Width',      0,     MetaData.None);
    static HeightKey     = Model.RegisterProperty(GroupVM, 'Height',     0,     MetaData.None);

    constructor(initialMembers)
    {
        super();
        // Members live in an ObservableCollection so the bounds-adorner
        // template ItemsControl could iterate them too if we ever want a
        // per-member chrome in addition to the per-shape Stroke triggers.
        this._members = new ObservableCollection();
        // Plain field — see class doc.
        this.Parent = undefined;
        // Per-member property-change listeners — keyed by member so we
        // can detach cleanly on remove / clear.
        this._memberListeners = new Map();
        this._members.Subscribe(change => this._handleMembersChange(change));

        if (Array.isArray(initialMembers))
        {
            for (const m of initialMembers)
            {
                // Detach from its current parent first so we don't end up
                // with a member sitting in two Members lists.
                if (m.Parent !== undefined) m.Parent._removeMember(m);
                m.Parent = this;
                this._members.Add(m);
            }
        }
    }

    get Members()      { return this._members; }
    get IsSelected()   { return this.get_property_value(GroupVM.IsSelectedKey); }
    set IsSelected(v)  { this.set_property_value(GroupVM.IsSelectedKey, v); }
    get X()            { return this.get_property_value(GroupVM.XKey); }
    get Y()            { return this.get_property_value(GroupVM.YKey); }
    get Width()        { return this.get_property_value(GroupVM.WidthKey); }
    get Height()       { return this.get_property_value(GroupVM.HeightKey); }

    // Writing X / Y shifts every member by the delta — the group moves
    // as a rigid unit (Visio / PowerPoint parity for align + distribute).
    // Each member's X / Y setter then propagates: leaves write through to
    // the DP, nested groups recurse with the same shift semantics. The
    // bbox follows automatically through _recomputeBounds. Width and
    // Height stay read-only — alignment never writes them, and resizing
    // a group is a different gesture (would require scaling members,
    // out of scope for this code path).
    set X(v)
    {
        const cur = this.get_property_value(GroupVM.XKey);
        const dx  = v - cur;
        if (dx === 0) return;
        this._shiftBy(dx, 0);
    }

    set Y(v)
    {
        const cur = this.get_property_value(GroupVM.YKey);
        const dy  = v - cur;
        if (dy === 0) return;
        this._shiftBy(0, dy);
    }

    // Translate every member by (dx, dy). The per-member X / Y change
    // listener (_listenMember handler) would re-run _recomputeBounds for
    // each member-write — partial state, transient wrong bbox, cascade
    // up to enclosing groups N times. Suppress those during the shift
    // and fire one final _recomputeBounds when every member has moved.
    _shiftBy(dx, dy)
    {
        this._shiftSuppressed = true;
        try
        {
            for (let i = 0; i < this._members.Count; i++)
            {
                const m = this._members.Get(i);
                if (dx !== 0) m.X = m.X + dx;
                if (dy !== 0) m.Y = m.Y + dy;
            }
        }
        finally
        {
            this._shiftSuppressed = false;
        }
        this._recomputeBounds();
    }

    _handleMembersChange(change)
    {
        switch (change.kind)
        {
            case 'inserted':
                for (const m of change.items) this._listenMember(m);
                break;
            case 'removed':
                for (const m of change.items) this._unlistenMember(m);
                break;
            case 'replaced':
                this._unlistenMember(change.oldItem);
                this._listenMember(change.newItem);
                break;
            case 'cleared':
                for (const m of [...this._memberListeners.keys()]) this._unlistenMember(m);
                break;
        }
        this._recomputeBounds();
    }

    _listenMember(m)
    {
        // The four geometry DPs share the same name across NodeVM and
        // GroupVM, but the Key objects differ. Pick the right Key based
        // on the member's class.
        const isGroup = m instanceof GroupVM;
        const xKey = isGroup ? GroupVM.XKey      : ShapeNodeVM.XKey;
        const yKey = isGroup ? GroupVM.YKey      : ShapeNodeVM.YKey;
        const wKey = isGroup ? GroupVM.WidthKey  : ShapeNodeVM.WidthKey;
        const hKey = isGroup ? GroupVM.HeightKey : ShapeNodeVM.HeightKey;
        const handler = () => {
            if (this._shiftSuppressed) return;
            this._recomputeBounds();
        };
        m.AddPropertyChangedListener(xKey, handler);
        m.AddPropertyChangedListener(yKey, handler);
        m.AddPropertyChangedListener(wKey, handler);
        m.AddPropertyChangedListener(hKey, handler);
        this._memberListeners.set(m, { handler, xKey, yKey, wKey, hKey });
    }

    _unlistenMember(m)
    {
        const entry = this._memberListeners.get(m);
        if (entry === undefined) return;
        m.RemovePropertyChangedListener(entry.xKey, entry.handler);
        m.RemovePropertyChangedListener(entry.yKey, entry.handler);
        m.RemovePropertyChangedListener(entry.wKey, entry.handler);
        m.RemovePropertyChangedListener(entry.hKey, entry.handler);
        this._memberListeners.delete(m);
    }

    // Internal — called by GroupVM siblings during a Group operation
    // to relocate a member out of this group without firing extra
    // events. Members.Remove fires Subscribe's removed-change, which
    // detaches listeners through the normal path.
    _removeMember(m)
    {
        const idx = this._members.IndexOf(m);
        if (idx >= 0) this._members.RemoveAt(idx);
    }

    _recomputeBounds()
    {
        if (this._members.Count === 0)
        {
            this.set_property_value(GroupVM.XKey, 0);
            this.set_property_value(GroupVM.YKey, 0);
            this.set_property_value(GroupVM.WidthKey, 0);
            this.set_property_value(GroupVM.HeightKey, 0);
            return;
        }
        let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < this._members.Count; i++)
        {
            const m = this._members.Get(i);
            const x = m.X, y = m.Y, w = m.Width, h = m.Height;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        }
        this.set_property_value(GroupVM.XKey,      minX);
        this.set_property_value(GroupVM.YKey,      minY);
        this.set_property_value(GroupVM.WidthKey,  maxX - minX);
        this.set_property_value(GroupVM.HeightKey, maxY - minY);
    }

    // Recursively enumerate every leaf ShapeNodeVM contained (transitively).
    // Used by the selection bridge to flip IsSelected on every member of
    // a selected group's top-level ancestor.
    *EnumerateLeaves()
    {
        for (let i = 0; i < this._members.Count; i++)
        {
            const m = this._members.Get(i);
            if (m instanceof GroupVM) yield* m.EnumerateLeaves();
            else                      yield m;
        }
    }

    // Recursively enumerate every descendant GroupVM (excluding self).
    *EnumerateSubGroups()
    {
        for (let i = 0; i < this._members.Count; i++)
        {
            const m = this._members.Get(i);
            if (m instanceof GroupVM)
            {
                yield m;
                yield* m.EnumerateSubGroups();
            }
        }
    }
}

// Walk Parent links up to the root. Works for both ShapeNodeVM and
// GroupVM. Returns the entity itself when it has no Parent (already
// top-level). Used by the selection bridge to elevate a clicked leaf to
// its outermost containing group.
export function topLevelOf(entity)
{
    let cur = entity;
    while (cur.Parent !== undefined) cur = cur.Parent;
    return cur;
}

// kind → catalog entry lookup, drives CreateNode + Load-from-serialized.
// SHAPE_CATALOG_MAP lives in shape-catalog.mjs and is keyed by the same
// strings the toolbox / Save format use.

// ── ToolboxShapeVM ──────────────────────────────────────────────────
//
// One per tile. PreviewNode is a fresh ShapeNodeVM sized to 48×48 that
// the tile renders through the single canvas DataTemplate. LabelText
// on the preview is empty so the picture is glyph-only; the tile
// renders the Label TextBlock separately, below the picture.

export class ToolboxShapeVM extends Model
{
    static KindKey              = Model.RegisterProperty(ToolboxShapeVM, 'Kind',              '',        MetaData.None);
    static LabelKey             = Model.RegisterProperty(ToolboxShapeVM, 'Label',             '',        MetaData.None);
    static PreviewNodeKey       = Model.RegisterProperty(ToolboxShapeVM, 'PreviewNode',       undefined, MetaData.None);
    static BeginKindDragDataKey = Model.RegisterProperty(ToolboxShapeVM, 'BeginKindDragData', undefined, MetaData.None);

    constructor(kind, label) {
        super();
        const preview = new ShapeNodeVM('preview', 0, 0, {
            kind,
            width:  PREVIEW_SIZE,
            height: PREVIEW_SIZE,
        });
        preview.FillBrush = FILL_PREVIEW;
        this.set_property_value(ToolboxShapeVM.KindKey,        kind);
        this.set_property_value(ToolboxShapeVM.LabelKey,       label);
        this.set_property_value(ToolboxShapeVM.PreviewNodeKey, preview);
        this.set_property_value(ToolboxShapeVM.BeginKindDragDataKey, () => ({
            data: new DataObject().Set('mural/node-kind', this.Kind),
            effects: DragDropEffects.Copy,
        }));
    }

    get Kind()               { return this.get_property_value(ToolboxShapeVM.KindKey); }
    set Kind(v)              { this.set_property_value(ToolboxShapeVM.KindKey, v); }
    get Label()              { return this.get_property_value(ToolboxShapeVM.LabelKey); }
    set Label(v)             { this.set_property_value(ToolboxShapeVM.LabelKey, v); }
    get PreviewNode()        { return this.get_property_value(ToolboxShapeVM.PreviewNodeKey); }
    set PreviewNode(v)       { this.set_property_value(ToolboxShapeVM.PreviewNodeKey, v); }
    get BeginKindDragData()  { return this.get_property_value(ToolboxShapeVM.BeginKindDragDataKey); }
    set BeginKindDragData(v) { this.set_property_value(ToolboxShapeVM.BeginKindDragDataKey, v); }
}

// ── DiagramVM ───────────────────────────────────────────────────────

export class DiagramVM extends Model
{
    static NodesKey                       = Model.RegisterProperty(DiagramVM, 'Nodes',         undefined,                          MetaData.None);
    static ToolboxShapesKey               = Model.RegisterProperty(DiagramVM, 'ToolboxShapes', undefined,                          MetaData.None);
    static StatusKey                      = Model.RegisterProperty(DiagramVM, 'Status',        'drag a shape from the toolbox →', MetaData.None);
    static SaveCommandKey                 = Model.RegisterProperty(DiagramVM, 'SaveCommand',   undefined,                          MetaData.None);
    static LoadCommandKey                 = Model.RegisterProperty(DiagramVM, 'LoadCommand',   undefined,                          MetaData.None);
    static AlignLeftCommandKey            = Model.RegisterProperty(DiagramVM, 'AlignLeftCommand',            undefined, MetaData.None);
    static AlignRightCommandKey           = Model.RegisterProperty(DiagramVM, 'AlignRightCommand',           undefined, MetaData.None);
    static AlignTopCommandKey             = Model.RegisterProperty(DiagramVM, 'AlignTopCommand',             undefined, MetaData.None);
    static AlignMiddleCommandKey          = Model.RegisterProperty(DiagramVM, 'AlignMiddleCommand',          undefined, MetaData.None);
    static AlignCenterCommandKey          = Model.RegisterProperty(DiagramVM, 'AlignCenterCommand',          undefined, MetaData.None);
    static DistributeHorizontalCommandKey = Model.RegisterProperty(DiagramVM, 'DistributeHorizontalCommand', undefined, MetaData.None);
    static DistributeVerticalCommandKey   = Model.RegisterProperty(DiagramVM, 'DistributeVerticalCommand',   undefined, MetaData.None);
    static GroupCommandKey                = Model.RegisterProperty(DiagramVM, 'GroupCommand',                undefined, MetaData.None);
    static UngroupCommandKey              = Model.RegisterProperty(DiagramVM, 'UngroupCommand',              undefined, MetaData.None);
    static CombineUnionCommandKey         = Model.RegisterProperty(DiagramVM, 'CombineUnionCommand',         undefined, MetaData.None);
    static CombineIntersectCommandKey     = Model.RegisterProperty(DiagramVM, 'CombineIntersectCommand',     undefined, MetaData.None);
    static CombineSubtractCommandKey      = Model.RegisterProperty(DiagramVM, 'CombineSubtractCommand',      undefined, MetaData.None);
    static CombineExcludeCommandKey       = Model.RegisterProperty(DiagramVM, 'CombineExcludeCommand',       undefined, MetaData.None);
    // Selection bounding rect — union bbox of every entity with
    // IsSelected=true, recomputed on selection / geometry changes by
    // _updateSelectionBounds. SelectionCount lets the adorner overlay
    // toggle Visibility purely from a binding-friendly numeric DP.
    // The resize-adorner behavior binds its bbox border and uses
    // these to position its 8 handles — keys captured as static
    // properties so the behavior can subscribe via
    // AddPropertyChangedListener.
    static SelectionXKey      = Model.RegisterProperty(DiagramVM, 'SelectionX',      0, MetaData.None);
    static SelectionYKey      = Model.RegisterProperty(DiagramVM, 'SelectionY',      0, MetaData.None);
    static SelectionWidthKey  = Model.RegisterProperty(DiagramVM, 'SelectionWidth',  0, MetaData.None);
    static SelectionHeightKey = Model.RegisterProperty(DiagramVM, 'SelectionHeight', 0, MetaData.None);
    static SelectionCountKey  = Model.RegisterProperty(DiagramVM, 'SelectionCount',  0, MetaData.None);
    // §19.3 — list of AlignmentGuide records currently displayed
    // by AlignmentGuidesAdorner. Mutated by align-edges-behavior
    // on every PointerMove during a node drag, cleared on
    // PointerUp. Plain array (not ObservableCollection) — the
    // adorner re-arranges on PropertyChanged of the whole DP, no
    // per-element notification needed.
    static AlignmentGuidesKey = Model.RegisterProperty(DiagramVM, 'AlignmentGuides', [], MetaData.None);
    // FormatFill / FormatStroke — bound by the right-side
    // ShapeFormatControl. Selection-change seeds them from the
    // first selected leaf; user edits on them are broadcast to
    // every selected leaf via _broadcastFill /
    // _broadcastStrokeProp. FormatStroke holds an EDITOR-OWNED Pen
    // cloned from the first leaf's Stroke — broadcasting copies
    // its property values onto each selected leaf's own Pen,
    // preserving per-shape Pen identity (so a later selection of
    // one shape doesn't accidentally edit the others through a
    // shared ref).
    static FormatFillKey   = Model.RegisterProperty(DiagramVM, 'FormatFill',   undefined, MetaData.None);
    static FormatStrokeKey = Model.RegisterProperty(DiagramVM, 'FormatStroke', undefined, MetaData.None);

    constructor(storage) {
        super();
        this._storage = storage;
        // Nodes is a flat collection of ALL diagram entities — both leaf
        // ShapeNodeVMs AND GroupVMs. A GroupVM rendering as a transparent
        // bbox-Border via its DataTemplate sits in this collection
        // alongside the shape members it represents; the Parent back-ref
        // on each member describes the tree, but Nodes stays a single flat
        // list so the Diagram's ItemsControl reaches every visual entity
        // with one binding. Nested groups also live here at top level —
        // tree depth is encoded in Parent links, not in collection shape.
        this.set_property_value(DiagramVM.NodesKey, new ObservableCollection());
        this.set_property_value(DiagramVM.ToolboxShapesKey,
            SHAPE_CATALOG.map(e => new ToolboxShapeVM(e.kind, e.label)));
        this._nextId = 1;

        this.set_property_value(DiagramVM.SaveCommandKey,
            new RelayCommand(() => this.Save(), undefined,
                { Text: 'Save',
                  Description: 'Serialize the current canvas to local storage.' }));
        this.set_property_value(DiagramVM.LoadCommandKey,
            new RelayCommand(() => this.Load(), undefined,
                { Text: 'Load',
                  Description: 'Restore the most recently saved canvas.' }));

        // ── Alignment + distribute commands ─────────────────────────
        // Align needs ≥ 2 selected nodes; Distribute needs ≥ 3 (the
        // PowerPoint convention — distributing 2 shapes is a no-op,
        // distributing 3+ spaces the inner shapes evenly between the
        // extremes). The CanExecute guards return back to the bound
        // Buttons, which surface them as enabled / disabled chrome.
        this.set_property_value(DiagramVM.AlignLeftCommandKey,
            new RelayCommand(() => this.AlignLeft(),  () => this._countSelected() >= 2,
                { Text: 'Align Left',
                  Description: 'Align selected shapes to the left edge of the leftmost shape.' }));
        this.set_property_value(DiagramVM.AlignRightCommandKey,
            new RelayCommand(() => this.AlignRight(), () => this._countSelected() >= 2,
                { Text: 'Align Right',
                  Description: 'Align selected shapes to the right edge of the rightmost shape.' }));
        this.set_property_value(DiagramVM.AlignTopCommandKey,
            new RelayCommand(() => this.AlignTop(),   () => this._countSelected() >= 2,
                { Text: 'Align Top',
                  Description: 'Align selected shapes to the top edge of the topmost shape.' }));
        this.set_property_value(DiagramVM.AlignMiddleCommandKey,
            new RelayCommand(() => this.AlignMiddle(),() => this._countSelected() >= 2,
                { Text: 'Align Middle',
                  Description: 'Center selected shapes vertically on a shared horizontal axis.' }));
        this.set_property_value(DiagramVM.AlignCenterCommandKey,
            new RelayCommand(() => this.AlignCenter(),() => this._countSelected() >= 2,
                { Text: 'Align Center',
                  Description: 'Center selected shapes horizontally on a shared vertical axis.' }));
        this.set_property_value(DiagramVM.DistributeHorizontalCommandKey,
            new RelayCommand(() => this.DistributeHorizontal(), () => this._countSelected() >= 3,
                { Text: 'Distribute Horizontally',
                  Description: 'Space three or more shapes evenly between the leftmost and rightmost.' }));
        this.set_property_value(DiagramVM.DistributeVerticalCommandKey,
            new RelayCommand(() => this.DistributeVertical(),   () => this._countSelected() >= 3,
                { Text: 'Distribute Vertically',
                  Description: 'Space three or more shapes evenly between the topmost and bottommost.' }));

        // ── Group / Ungroup commands ────────────────────────────────
        // Group needs ≥ 2 selected TOP-LEVEL entities (anything that
        // could become the new group's members). Ungroup needs ≥ 1
        // selected top-level GroupVM. CanExecute is re-evaluated by
        // the same selection-listener pipeline as the align commands.
        this.set_property_value(DiagramVM.GroupCommandKey,
            new RelayCommand(() => this.Group(),   () => this._selectedTopLevel().length >= 2,
                { Text: 'Group',
                  Description: 'Bundle the selected shapes into a single group that moves and resizes together.' }));
        this.set_property_value(DiagramVM.UngroupCommandKey,
            new RelayCommand(() => this.Ungroup(), () => this._selectedTopLevelGroups().length >= 1,
                { Text: 'Ungroup',
                  Description: 'Dissolve the selected groups back into their member shapes.' }));

        // ── Combine (boolean ops) ──────────────────────────────────
        // PowerPoint's Merge-Shapes counterpart. Needs ≥ 2 selected
        // LEAVES — groups don't combine as a unit yet (the kernel
        // operates per-leaf and we'd need a normalization pass to
        // collapse the group bbox into a single PathGeometry first).
        const canCombine = () => this._formatLeaves().length >= 2;
        this.set_property_value(DiagramVM.CombineUnionCommandKey,
            new RelayCommand(() => this.CombineSelection(GeometryCombineMode.Union),     canCombine,
                { Text: 'Union',
                  Description: 'Merge the selected shapes into a single shape covering the union of their areas.' }));
        this.set_property_value(DiagramVM.CombineIntersectCommandKey,
            new RelayCommand(() => this.CombineSelection(GeometryCombineMode.Intersect), canCombine,
                { Text: 'Intersect',
                  Description: 'Keep only the overlapping region of the selected shapes.' }));
        this.set_property_value(DiagramVM.CombineSubtractCommandKey,
            new RelayCommand(() => this.CombineSelection(GeometryCombineMode.Exclude),   canCombine,
                { Text: 'Subtract',
                  Description: 'Cut the additional shapes out of the first selected shape.' }));
        this.set_property_value(DiagramVM.CombineExcludeCommandKey,
            new RelayCommand(() => this.CombineSelection(GeometryCombineMode.Xor),       canCombine,
                { Text: 'Exclude',
                  Description: 'Keep the non-overlapping regions of the selected shapes.' }));

        // Selection-change tracking — each node's IsSelected change
        // (driven from the bootstrap's selection bridge mirroring
        // Selector.SelectedItems → NodeVM.IsSelected) must re-evaluate
        // every alignment command's CanExecute so the toolbar chrome
        // tracks the live selection without polling. The Map below
        // pins one listener per realized NodeVM; Nodes.Subscribe
        // installs / detaches as items come and go.
        this._selectionWatchers = new Map();
        this.Nodes.Subscribe(change => this._handleNodesChange(change));

        // ShapeFormatControl wiring. Seed-from-selection writes are
        // guarded by _seedingFormat so the broadcast listeners below
        // bail without echoing the seed back onto the selected shapes
        // (which would override every other selected shape's brush
        // with the first one's on every click).
        this._seedingFormat = false;
        this._formatStrokeListeners = [];
        this.AddPropertyChangedListener(DiagramVM.FormatFillKey,   () => this._broadcastFill());
        this.AddPropertyChangedListener(DiagramVM.FormatStrokeKey, () => this._onFormatStrokeChanged());
    }

    get Nodes()                       { return this.get_property_value(DiagramVM.NodesKey); }
    get GroupCommand()                { return this.get_property_value(DiagramVM.GroupCommandKey); }
    get UngroupCommand()              { return this.get_property_value(DiagramVM.UngroupCommandKey); }
    get CombineUnionCommand()         { return this.get_property_value(DiagramVM.CombineUnionCommandKey); }
    get CombineIntersectCommand()     { return this.get_property_value(DiagramVM.CombineIntersectCommandKey); }
    get CombineSubtractCommand()      { return this.get_property_value(DiagramVM.CombineSubtractCommandKey); }
    get CombineExcludeCommand()       { return this.get_property_value(DiagramVM.CombineExcludeCommandKey); }
    get ToolboxShapes()               { return this.get_property_value(DiagramVM.ToolboxShapesKey); }
    get Status()                      { return this.get_property_value(DiagramVM.StatusKey); }
    set Status(v)                     { this.set_property_value(DiagramVM.StatusKey, v); }
    get SaveCommand()                 { return this.get_property_value(DiagramVM.SaveCommandKey); }
    get LoadCommand()                 { return this.get_property_value(DiagramVM.LoadCommandKey); }
    get AlignLeftCommand()            { return this.get_property_value(DiagramVM.AlignLeftCommandKey); }
    get AlignRightCommand()           { return this.get_property_value(DiagramVM.AlignRightCommandKey); }
    get AlignTopCommand()             { return this.get_property_value(DiagramVM.AlignTopCommandKey); }
    get AlignMiddleCommand()          { return this.get_property_value(DiagramVM.AlignMiddleCommandKey); }
    get AlignCenterCommand()          { return this.get_property_value(DiagramVM.AlignCenterCommandKey); }
    get DistributeHorizontalCommand() { return this.get_property_value(DiagramVM.DistributeHorizontalCommandKey); }
    get DistributeVerticalCommand()   { return this.get_property_value(DiagramVM.DistributeVerticalCommandKey); }
    get SelectionX()                  { return this.get_property_value(DiagramVM.SelectionXKey); }
    get SelectionY()                  { return this.get_property_value(DiagramVM.SelectionYKey); }
    get SelectionWidth()              { return this.get_property_value(DiagramVM.SelectionWidthKey); }
    get SelectionHeight()             { return this.get_property_value(DiagramVM.SelectionHeightKey); }
    get SelectionCount()              { return this.get_property_value(DiagramVM.SelectionCountKey); }
    get AlignmentGuides()             { return this.get_property_value(DiagramVM.AlignmentGuidesKey); }
    set AlignmentGuides(value)        { this.set_property_value(DiagramVM.AlignmentGuidesKey, value); }
    get FormatFill()                  { return this.get_property_value(DiagramVM.FormatFillKey); }
    set FormatFill(v)                 { this.set_property_value(DiagramVM.FormatFillKey, v); }
    get FormatStroke()                { return this.get_property_value(DiagramVM.FormatStrokeKey); }
    set FormatStroke(v)               { this.set_property_value(DiagramVM.FormatStrokeKey, v); }

    CreateNode(kind, x, y) {
        if (!SHAPE_CATALOG_MAP.has(kind)) return null;
        const id = 'n' + this._nextId++;
        const node = new ShapeNodeVM(id, x, y, { kind });
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
        // Per-node record carries position, size, and the SVG
        // d-string of the unit-1 SOURCE PathGeometry (figure coords
        // pre-normalized to [0,1]×[0,1] — same form the catalog
        // produces, same form a combined-geometry source takes).
        // `kind` is a hint that lets Load skip d-string parsing when
        // the catalog recognizes it. Groups aren't persisted yet —
        // only the leaf ShapeNodeVMs.
        const nodes = [];
        const items = this.Nodes;
        for (let i = 0; i < items.Count; i++) {
            const v = items.Get(i);
            if (!(v instanceof ShapeNodeVM)) continue;
            const d = v._source !== undefined ? pathGeometryToSvgD(v._source) : '';
            nodes.push({
                id:   v.Id,
                kind: v.Kind,
                x:    v.X,
                y:    v.Y,
                w:    v.Width,
                h:    v.Height,
                d,
            });
        }
        return { nodes, nextId: this._nextId };
    }

    deserialize(payload) {
        if (payload === null || typeof payload !== 'object') return;
        const snapshot = [];
        for (let i = 0; i < this.Nodes.Count; i++) snapshot.push(this.Nodes.Get(i));
        for (const node of snapshot) this.removeNode(node);
        for (const n of payload.nodes ?? []) {
            const id = n.id ?? ('n' + this._nextId++);
            // Prefer catalog when kind is known — guarantees the
            // shape stays in lock-step with library updates. Fall
            // back to the saved unit-1 d-string for combined
            // geometries or unrecognized kinds.
            let node;
            if (n.kind !== undefined && SHAPE_CATALOG_MAP.has(n.kind)) {
                node = new ShapeNodeVM(id, n.x ?? 0, n.y ?? 0, {
                    kind:   n.kind,
                    width:  n.w,
                    height: n.h,
                });
            }
            else if (typeof n.d === 'string' && n.d.length > 0) {
                node = new ShapeNodeVM(id, n.x ?? 0, n.y ?? 0, {
                    source: pathGeometryFromSvgD(n.d),
                    kind:   n.kind,
                    width:  n.w,
                    height: n.h,
                });
            }
            else {
                continue;
            }
            this.Nodes.Add(node);
        }
    }

    // ── Align / Distribute ────────────────────────────────────────
    //
    // PowerPoint convention: alignment lines up the selected shapes'
    // edges (left / right / top) or centres (middle = horizontal mid-
    // line) using the selection's bounding box as the reference frame.
    // Distribute spaces the inner shapes evenly between the extremes.
    //
    // All commands write VM.X / VM.Y on the selected nodes. The Style-
    // tier TwoWay binding installed by DiagramNodeStyle propagates the
    // new positions onto each container; because DiagramNode.OnPointer-
    // Move clears its Local-tier value at drag-end, the Style push is
    // visible (no Local shadowing). The Canvas re-arranges on the next
    // layout pass because Canvas.Left / Canvas.Top are flagged
    // Measure | Arrange.

    AlignLeft() {
        const sel = this._getSelected();
        if (sel.length < 2) return;
        const minX = Math.min(...sel.map(n => n.X));
        for (const n of sel) n.X = minX;
        this.Status = `Aligned ${sel.length} shapes left.`;
    }

    AlignRight() {
        const sel = this._getSelected();
        if (sel.length < 2) return;
        // Right alignment lines up the shapes' right edges; each
        // shape's X = sharedRight - itsWidth.
        const sharedRight = Math.max(...sel.map(n => n.X + n.Width));
        for (const n of sel) n.X = sharedRight - n.Width;
        this.Status = `Aligned ${sel.length} shapes right.`;
    }

    AlignTop() {
        const sel = this._getSelected();
        if (sel.length < 2) return;
        const minY = Math.min(...sel.map(n => n.Y));
        for (const n of sel) n.Y = minY;
        this.Status = `Aligned ${sel.length} shapes top.`;
    }

    AlignMiddle() {
        // "Middle" in PowerPoint = horizontal middle line — every
        // shape's vertical centre lines up. We use the selection bbox
        // centre as the reference (matches PowerPoint's behaviour).
        const sel = this._getSelected();
        if (sel.length < 2) return;
        const top    = Math.min(...sel.map(n => n.Y));
        const bottom = Math.max(...sel.map(n => n.Y + n.Height));
        const midY   = (top + bottom) / 2;
        for (const n of sel) n.Y = midY - n.Height / 2;
        this.Status = `Aligned ${sel.length} shapes middle.`;
    }

    AlignCenter() {
        // "Center" in PowerPoint = vertical centre line — every shape's
        // horizontal centre lines up on a shared vertical axis. The bbox
        // centre is the reference (same convention as AlignMiddle).
        const sel = this._getSelected();
        if (sel.length < 2) return;
        const left  = Math.min(...sel.map(n => n.X));
        const right = Math.max(...sel.map(n => n.X + n.Width));
        const midX  = (left + right) / 2;
        for (const n of sel) n.X = midX - n.Width / 2;
        this.Status = `Aligned ${sel.length} shapes center.`;
    }

    DistributeHorizontal() {
        const sel = this._getSelected();
        if (sel.length < 3) return;
        // Edge-gap distribution: leftmost / rightmost stay put, inner
        // shapes get equal horizontal gaps between consecutive right /
        // left edges. Sort by current X so the operation is order-
        // stable regardless of selection order.
        sel.sort((a, b) => a.X - b.X);
        const leftmost  = sel[0];
        const rightmost = sel[sel.length - 1];
        const totalSpan = (rightmost.X + rightmost.Width) - leftmost.X;
        const widthSum  = sel.reduce((acc, n) => acc + n.Width, 0);
        const gap       = (totalSpan - widthSum) / (sel.length - 1);
        let cursor = leftmost.X + leftmost.Width + gap;
        for (let i = 1; i < sel.length - 1; i++) {
            sel[i].X = cursor;
            cursor += sel[i].Width + gap;
        }
        this.Status = `Distributed ${sel.length} shapes horizontally.`;
    }

    DistributeVertical() {
        const sel = this._getSelected();
        if (sel.length < 3) return;
        sel.sort((a, b) => a.Y - b.Y);
        const topmost    = sel[0];
        const bottommost = sel[sel.length - 1];
        const totalSpan = (bottommost.Y + bottommost.Height) - topmost.Y;
        const heightSum = sel.reduce((acc, n) => acc + n.Height, 0);
        const gap       = (totalSpan - heightSum) / (sel.length - 1);
        let cursor = topmost.Y + topmost.Height + gap;
        for (let i = 1; i < sel.length - 1; i++) {
            sel[i].Y = cursor;
            cursor += sel[i].Height + gap;
        }
        this.Status = `Distributed ${sel.length} shapes vertically.`;
    }

    // ── Selection bookkeeping ─────────────────────────────────────

    _getSelected() {
        const out = [];
        const items = this.Nodes;
        for (let i = 0; i < items.Count; i++) {
            const n = items.Get(i);
            if (n.IsSelected) out.push(n);
        }
        return out;
    }

    _countSelected() {
        let n = 0;
        const items = this.Nodes;
        for (let i = 0; i < items.Count; i++) {
            if (items.Get(i).IsSelected) n++;
        }
        return n;
    }

    // Nodes-collection change handler. Installs / detaches IsSelected
    // listeners on the affected NodeVMs so the alignment commands'
    // CanExecute re-evaluates exactly when selection might flip. Each
    // change kind is forwarded by CollectionView verbatim now (post
    // incremental-projection fix), so the branches stay surgical.
    _handleNodesChange(change) {
        switch (change.kind) {
            case 'inserted':
                for (const n of change.items) this._watchSelection(n);
                break;
            case 'removed':
                for (const n of change.items) this._unwatchSelection(n);
                break;
            case 'replaced':
                this._unwatchSelection(change.oldItem);
                this._watchSelection(change.newItem);
                break;
            case 'cleared':
                for (const n of [...this._selectionWatchers.keys()]) {
                    this._unwatchSelection(n);
                }
                break;
            case 'moved': /* selection identity unchanged */ break;
        }
        this._raiseAllCanExecute();
        this._updateSelectionBounds();
        this._seedFormatFromSelection();
    }

    _watchSelection(node) {
        // Nodes hold both ShapeNodeVMs and GroupVMs; their IsSelected /
        // X / Y / Width / Height DPs are registered on different classes,
        // so the Key objects differ even though the names match. Pick
        // the right Key per member instance.
        //
        // Two listeners per node:
        //   * onSelected   — IsSelected flipped. Toolbar CanExecute and
        //                    the selection bbox both depend on the
        //                    selected SET, so re-evaluate both.
        //   * onGeometry   — X / Y / W / H moved. Only matters if THIS
        //                    node is currently selected — otherwise the
        //                    bbox doesn't include it. Cheap early-out.
        const isGroup = node instanceof GroupVM;
        const sKey = isGroup ? GroupVM.IsSelectedKey : ShapeNodeVM.IsSelectedKey;
        const xKey = isGroup ? GroupVM.XKey          : ShapeNodeVM.XKey;
        const yKey = isGroup ? GroupVM.YKey          : ShapeNodeVM.YKey;
        const wKey = isGroup ? GroupVM.WidthKey      : ShapeNodeVM.WidthKey;
        const hKey = isGroup ? GroupVM.HeightKey     : ShapeNodeVM.HeightKey;
        const onSelected = () => {
            this._raiseAllCanExecute();
            this._updateSelectionBounds();
            this._seedFormatFromSelection();
        };
        const onGeometry = () => {
            if (node.IsSelected) this._updateSelectionBounds();
        };
        node.AddPropertyChangedListener(sKey, onSelected);
        node.AddPropertyChangedListener(xKey, onGeometry);
        node.AddPropertyChangedListener(yKey, onGeometry);
        node.AddPropertyChangedListener(wKey, onGeometry);
        node.AddPropertyChangedListener(hKey, onGeometry);
        this._selectionWatchers.set(node, {
            sKey, xKey, yKey, wKey, hKey, onSelected, onGeometry,
        });
    }

    _unwatchSelection(node) {
        const entry = this._selectionWatchers.get(node);
        if (entry === undefined) return;
        node.RemovePropertyChangedListener(entry.sKey, entry.onSelected);
        node.RemovePropertyChangedListener(entry.xKey, entry.onGeometry);
        node.RemovePropertyChangedListener(entry.yKey, entry.onGeometry);
        node.RemovePropertyChangedListener(entry.wKey, entry.onGeometry);
        node.RemovePropertyChangedListener(entry.hKey, entry.onGeometry);
        this._selectionWatchers.delete(node);
    }

    // Recompute the union bbox of every currently-selected entity in the
    // flat Nodes collection (leaves AND groups). The adorner overlay binds
    // SelectionX / Y / Width / Height directly; the behavior reads
    // SelectionCount to gate handle visibility. Called whenever a
    // selection flips, a selected entity moves / resizes, or the Nodes
    // collection itself changes.
    _updateSelectionBounds() {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        let count = 0;
        const items = this.Nodes;
        for (let i = 0; i < items.Count; i++) {
            const n = items.Get(i);
            if (!n.IsSelected) continue;
            count++;
            if (n.X < minX) minX = n.X;
            if (n.Y < minY) minY = n.Y;
            if (n.X + n.Width  > maxX) maxX = n.X + n.Width;
            if (n.Y + n.Height > maxY) maxY = n.Y + n.Height;
        }
        if (count === 0) {
            this.set_property_value(DiagramVM.SelectionXKey,      0);
            this.set_property_value(DiagramVM.SelectionYKey,      0);
            this.set_property_value(DiagramVM.SelectionWidthKey,  0);
            this.set_property_value(DiagramVM.SelectionHeightKey, 0);
            this.set_property_value(DiagramVM.SelectionCountKey,  0);
            return;
        }
        this.set_property_value(DiagramVM.SelectionXKey,      minX);
        this.set_property_value(DiagramVM.SelectionYKey,      minY);
        this.set_property_value(DiagramVM.SelectionWidthKey,  maxX - minX);
        this.set_property_value(DiagramVM.SelectionHeightKey, maxY - minY);
        this.set_property_value(DiagramVM.SelectionCountKey,  count);
    }

    // ── ShapeFormatControl: seed + broadcast ──────────────────────────
    //
    // The right-side ShapeFormatControl edits FormatFill (a Brush) and
    // FormatStroke (a Pen the editor mutates in place). Two flows:
    //
    //   * Seed: selection flips → FormatFill = first leaf's FillBrush;
    //     FormatStroke = a freshly-cloned Pen carrying the first leaf's
    //     Stroke values. Done under _seedingFormat so the broadcast
    //     listeners don't re-write every selected shape with the first
    //     one's values just because the selection happens to change.
    //
    //   * Broadcast:
    //       - FormatFill DP change → write the new brush ref onto every
    //         selected leaf's FillBrush. Fine to share refs across leaves:
    //         FillEditor swaps the brush wholesale on each edit, so a
    //         later edit of one leaf produces a NEW brush — the others
    //         keep the old one.
    //       - FormatStroke per-property change (PenEditor mutates the
    //         pen in place) → copy that property's value onto every
    //         selected leaf's own Stroke pen. Each leaf keeps its OWN
    //         Pen instance, so editing a single shape later (after
    //         multi-select) won't leak through a shared ref.

    _formatLeaves() {
        // GroupVMs don't carry FillBrush/Stroke; treat a selected
        // group as "every leaf transitively inside". Plain shape
        // selections pass straight through. Dedupe via Set so a
        // multi-group selection of nested groups doesn't double-
        // broadcast onto shared leaves.
        const seen = new Set();
        const out = [];
        const add = (n) => { if (!seen.has(n)) { seen.add(n); out.push(n); } };
        const items = this.Nodes;
        for (let i = 0; i < items.Count; i++) {
            const n = items.Get(i);
            if (!n.IsSelected) continue;
            if (n instanceof GroupVM) {
                for (const leaf of n.EnumerateLeaves()) add(leaf);
            } else {
                add(n);
            }
        }
        return out;
    }

    _seedFormatFromSelection() {
        const leaves = this._formatLeaves();
        this._seedingFormat = true;
        try {
            if (leaves.length === 0) {
                this.set_property_value(DiagramVM.FormatFillKey,   undefined);
                this.set_property_value(DiagramVM.FormatStrokeKey, undefined);
                return;
            }
            const first = leaves[0];
            this.set_property_value(DiagramVM.FormatFillKey, first.FillBrush);
            // Clone the pen for the editor — keeps per-shape Pen
            // identity intact (see class doc above). The clone's
            // property changes feed _broadcastStrokeProp.
            this.set_property_value(DiagramVM.FormatStrokeKey, clonePen(first.Stroke));
        } finally {
            this._seedingFormat = false;
        }
    }

    _broadcastFill() {
        if (this._seedingFormat) return;
        const brush = this.FormatFill;
        for (const leaf of this._formatLeaves()) leaf.FillBrush = brush;
    }

    _onFormatStrokeChanged() {
        // Detach from the prior pen first; re-attach to the new one.
        // Fires once per FormatStroke DP write — seed (clone) or
        // wholesale replacement by an external caller both go through
        // here.
        this._detachFormatStrokeListeners();
        const pen = this.FormatStroke;
        if (pen !== undefined) this._attachFormatStrokeListeners(pen);
        // The replacement itself is a kind of broadcast — copy every
        // property of the new pen onto each selected leaf's pen. Seed-
        // driven replacements are gated by _seedingFormat so we don't
        // override every other selected leaf with the first one's
        // values on each click.
        if (!this._seedingFormat) this._broadcastWholePen();
    }

    _attachFormatStrokeListeners(pen) {
        const watch = (prop) => {
            const h = () => this._broadcastStrokeProp(prop);
            pen.AddPropertyChangedListener(PEN_PROP_KEYS[prop], h);
            this._formatStrokeListeners.push({ pen, prop, h });
        };
        watch('Brush');
        watch('Thickness');
        watch('DashStyle');
        watch('LineCap');
        watch('LineJoin');
        watch('MiterLimit');
    }

    _detachFormatStrokeListeners() {
        for (const e of this._formatStrokeListeners) {
            e.pen.RemovePropertyChangedListener(PEN_PROP_KEYS[e.prop], e.h);
        }
        this._formatStrokeListeners = [];
    }

    _broadcastStrokeProp(prop) {
        if (this._seedingFormat) return;
        const pen = this.FormatStroke;
        if (pen === undefined) return;
        const value = pen[prop];
        for (const leaf of this._formatLeaves()) {
            const target = leaf.Stroke;
            if (target === undefined) continue;
            target[prop] = value;
        }
    }

    _broadcastWholePen() {
        const pen = this.FormatStroke;
        if (pen === undefined) return;
        for (const leaf of this._formatLeaves()) {
            const target = leaf.Stroke;
            if (target === undefined) continue;
            target.Brush      = pen.Brush;
            target.Thickness  = pen.Thickness;
            target.DashStyle  = pen.DashStyle;
            target.LineCap    = pen.LineCap;
            target.LineJoin   = pen.LineJoin;
            target.MiterLimit = pen.MiterLimit;
        }
    }

    _raiseAllCanExecute() {
        this.AlignLeftCommand?.RaiseCanExecuteChanged();
        this.AlignRightCommand?.RaiseCanExecuteChanged();
        this.AlignTopCommand?.RaiseCanExecuteChanged();
        this.AlignMiddleCommand?.RaiseCanExecuteChanged();
        this.AlignCenterCommand?.RaiseCanExecuteChanged();
        this.DistributeHorizontalCommand?.RaiseCanExecuteChanged();
        this.DistributeVerticalCommand?.RaiseCanExecuteChanged();
        this.GroupCommand?.RaiseCanExecuteChanged();
        this.UngroupCommand?.RaiseCanExecuteChanged();
        this.CombineUnionCommand?.RaiseCanExecuteChanged();
        this.CombineIntersectCommand?.RaiseCanExecuteChanged();
        this.CombineSubtractCommand?.RaiseCanExecuteChanged();
        this.CombineExcludeCommand?.RaiseCanExecuteChanged();
    }

    // ── Group / Ungroup ───────────────────────────────────────────────

    // Currently-selected TOP-LEVEL entities — leaves with no Parent, plus
    // top-level GroupVMs whose IsSelected bridge elevation marked them
    // (or that the user clicked directly on the bbox border). Walks each
    // selected entity's Parent chain to find its outermost ancestor, then
    // dedupes via Set so sibling selections inside the same top-level
    // group collapse to one entry.
    _selectedTopLevel() {
        const out = new Set();
        const nodes = this.Nodes;
        for (let i = 0; i < nodes.Count; i++)
        {
            const n = nodes.Get(i);
            if (n.IsSelected) out.add(topLevelOf(n));
        }
        return [...out];
    }

    _selectedTopLevelGroups() {
        return this._selectedTopLevel().filter(e => e instanceof GroupVM);
    }

    // Ctrl+G — wrap the current top-level selection in a new GroupVM.
    // The new GroupVM lands IN the flat Nodes collection — inserted at
    // the LOWEST index of any selected member so the bbox renders BEHIND
    // those members in z-order (members on top of bbox = members catch
    // pointer first; clicks in the empty-bbox gap fall through to the
    // group container). Members stay where they were in Nodes; only their
    // Parent back-ref flips to the new group. Same shape for shapes and
    // for already-existing GroupVMs (nesting).
    Group() {
        const selection = this._selectedTopLevel();
        if (selection.length < 2) return;
        const group = new GroupVM();
        // Find the lowest member index so the bbox is inserted there.
        let minIdx = this.Nodes.Count;
        for (const m of selection)
        {
            const idx = this.Nodes.IndexOf(m);
            if (idx >= 0 && idx < minIdx) minIdx = idx;
        }
        // Re-parent every selected entity (NodeVM or nested GroupVM)
        // to the new group. Both stay in DiagramVM.Nodes — only Parent
        // and the group's Members list change.
        for (const m of selection)
        {
            m.Parent = group;
            group.Members.Add(m);
        }
        this.Nodes.Insert(minIdx, group);
        // Selector.SelectedItems didn't change (the same items the user
        // picked are still in it), so the bridge won't re-fire on its
        // own — flip IsSelected here to match what it WOULD set: the
        // new group ON, every member (leaf or sub-group) OFF, since the
        // group's bbox is now the only chrome we want the user to see.
        group.IsSelected = true;
        for (const leaf of group.EnumerateLeaves()) leaf.IsSelected = false;
        for (const sub of group.EnumerateSubGroups()) sub.IsSelected = false;
        this._raiseAllCanExecute();
        this.Status = `Grouped ${selection.length} item${selection.length === 1 ? '' : 's'}.`;
    }

    // Ctrl+Shift+G — dissolve every currently-selected top-level group.
    // Members lift to the dissolved group's parent (or to no-parent if
    // top-level). Members stay in DiagramVM.Nodes throughout (they were
    // always there); only their Parent back-ref and the dissolved group's
    // own slot in Nodes change.
    Ungroup() {
        const groups = this._selectedTopLevelGroups();
        if (groups.length === 0) return;
        let count = 0;
        for (const g of groups)
        {
            const parent = g.Parent;
            const members = [];
            for (let i = 0; i < g.Members.Count; i++) members.push(g.Members.Get(i));
            for (const m of members)
            {
                g._removeMember(m);
                m.Parent = parent;
                if (parent !== undefined) parent.Members.Add(m);
            }
            // Remove `g` from its parent group's Members (if nested) AND
            // from the flat Nodes collection (always — top-level or
            // nested, groups always live in Nodes too in this model).
            if (parent !== undefined) parent._removeMember(g);
            const idx = this.Nodes.IndexOf(g);
            if (idx >= 0) this.Nodes.RemoveAt(idx);
            count++;
        }
        this._raiseAllCanExecute();
        this.Status = `Ungrouped ${count} group${count === 1 ? '' : 's'}.`;
    }

    // ── Combine (boolean ops) ─────────────────────────────────────────
    //
    // PowerPoint's Merge-Shapes counterpart. Takes the currently-
    // selected leaves (groups expand to their leaf members via
    // `_formatLeaves`), feeds them through `mergeShapes` (translate
    // into diagram-space → reduce-left over `combine` kernel →
    // normalize to unit-1), and replaces the inputs with a single
    // result node carrying the unit-1 source on its `_source` field.
    //
    // Properties of the result node:
    //   * X / Y / W / H  — bbox of the combined geometry in diagram
    //                       space.
    //   * Source         — combined unit-1 PathGeometry. Kind is
    //                       implicitly '' (not a catalog shape).
    //   * FillBrush      — first leaf's brush ref. The brush itself
    //                       isn't cloned (FillEditor swaps wholesale,
    //                       so sharing a brush ref is safe).
    //   * Stroke         — fresh Pen cloned from the first leaf's,
    //                       since PenEditor mutates in place.
    //
    // Empty result (intersect of disjoint shapes, exclude that cancels
    // everything) → status message, no node insertion.
    CombineSelection(mode) {
        const leaves = this._formatLeaves();
        if (leaves.length < 2) return;
        const merged = mergeShapes(leaves, mode);
        if (merged === undefined) {
            this.Status = 'Combine produced an empty geometry.';
            return;
        }
        const template = leaves[0];
        const id = 'n' + this._nextId++;
        const node = new ShapeNodeVM(id, merged.x, merged.y, {
            source: merged.source,
            width:  merged.w,
            height: merged.h,
        });
        node.FillBrush = template.FillBrush;
        node.Stroke    = clonePen(template.Stroke);

        // Remove the input nodes. They might be members of groups —
        // detach from the group bookkeeping first so the group's
        // bounds recompute correctly.
        for (const leaf of leaves) {
            if (leaf.Parent !== undefined) leaf.Parent._removeMember(leaf);
            this.removeNode(leaf);
        }
        this.Nodes.Add(node);
        node.IsSelected = true;
        this._raiseAllCanExecute();
        this.Status = `Combined ${leaves.length} shapes (${combineModeName(mode)}).`;
    }

    // ── Selection resize ──────────────────────────────────────────────
    //
    // The resize-adorner behavior drives this trio. Begin captures the
    // initial geometry of every selected entity (and every leaf
    // transitively under any selected group); each Apply call computes a
    // fresh transform from THAT snapshot plus the (dw, dh) delta — never
    // incremental from the previous frame — so a slow user moving the
    // pointer in tiny jitter doesn't accumulate floating-point drift.
    // End drops the snapshot.
    //
    // Per-entity semantics (uniform delta for leaves, proportional
    // scale for groups). X / Y stay or shift based on the per-handle
    // anchor — the OPPOSITE side of the bbox stays put, the dragged
    // side follows the pointer:
    //
    //   xAnchor === 'left'  → newX = snap.x                 (E handle)
    //   xAnchor === 'right' → newX = snap.x + snap.w - newW (W handle)
    //   xAnchor === 'none'  → newW unchanged, newX = snap.x (N / S handles)
    //   yAnchor — same shape, vertical axis.
    //
    //   * leaf: newW = max(MIN, snap.w + dw), newH = max(MIN, snap.h + dh).
    //                  newX / newY follow the anchor. When clamping kicks
    //                  in for 'right' anchor, newX = snap.x + snap.w - MIN
    //                  keeps the right edge fixed even after W stops
    //                  shrinking — feels right under continued drag.
    //   * group: newGroupX / Y / W / H derived the same way; every leaf
    //                  inside scales proportionally relative to the group's
    //                  new origin and scale factors.
    //
    // MIN_SIZE clamps each LEAF dimension. For groups, only the group's
    // bbox is clamped — per-leaf MIN-inside-group would need a constraint
    // propagation pass we skipped for v1.

    BeginSelectionResize() {
        const entities = [];
        const items = this.Nodes;
        for (let i = 0; i < items.Count; i++) {
            const n = items.Get(i);
            if (!n.IsSelected) continue;
            if (n instanceof GroupVM) {
                const leafSnaps = [];
                for (const l of n.EnumerateLeaves()) {
                    leafSnaps.push({ leaf: l, x: l.X, y: l.Y, w: l.Width, h: l.Height });
                }
                entities.push({
                    kind: 'group',
                    group: n,
                    x: n.X, y: n.Y, w: n.Width, h: n.Height,
                    leaves: leafSnaps,
                    // Pre-collected so Apply doesn't re-walk the tree on
                    // every pointer-move event.
                    allGroups: [n, ...n.EnumerateSubGroups()],
                });
            } else {
                entities.push({
                    kind: 'leaf',
                    leaf: n,
                    x: n.X, y: n.Y, w: n.Width, h: n.Height,
                });
            }
        }
        this._resizeSnapshot = { entities };
    }

    ApplySelectionResize(dw, dh, xAnchor, yAnchor) {
        if (this._resizeSnapshot === undefined) return;
        const MIN = 8;
        // Per-entity anchor math. xAnchor === 'right' keeps the right
        // edge at snap.x + snap.w and lets X slide with W changes;
        // 'left' pins X; 'none' is a no-W-change pass.
        const newPosX = (sx, sw, nw) => {
            if (xAnchor === 'right') return sx + sw - nw;
            return sx;
        };
        const newPosY = (sy, sh, nh) => {
            if (yAnchor === 'bottom') return sy + sh - nh;
            return sy;
        };
        for (const e of this._resizeSnapshot.entities) {
            if (e.kind === 'leaf') {
                const newW = Math.max(MIN, e.w + dw);
                const newH = Math.max(MIN, e.h + dh);
                e.leaf.X      = newPosX(e.x, e.w, newW);
                e.leaf.Y      = newPosY(e.y, e.h, newH);
                e.leaf.Width  = newW;
                e.leaf.Height = newH;
            } else {
                const newW = Math.max(MIN, e.w + dw);
                const newH = Math.max(MIN, e.h + dh);
                const newGroupX = newPosX(e.x, e.w, newW);
                const newGroupY = newPosY(e.y, e.h, newH);
                const scaleX = e.w === 0 ? 1 : newW / e.w;
                const scaleY = e.h === 0 ? 1 : newH / e.h;
                // Suppress every nested group's _recomputeBounds during
                // the inner leaf writes — same pattern as _shiftBy. Each
                // group fires recompute exactly once at the end, inner-
                // most first so enclosing groups read settled inner
                // bounds.
                for (const g of e.allGroups) g._shiftSuppressed = true;
                try {
                    for (const ls of e.leaves) {
                        ls.leaf.X      = newGroupX + (ls.x - e.x) * scaleX;
                        ls.leaf.Y      = newGroupY + (ls.y - e.y) * scaleY;
                        ls.leaf.Width  = Math.max(MIN, ls.w * scaleX);
                        ls.leaf.Height = Math.max(MIN, ls.h * scaleY);
                    }
                } finally {
                    for (const g of e.allGroups) g._shiftSuppressed = false;
                }
                for (let i = e.allGroups.length - 1; i >= 0; i--) {
                    e.allGroups[i]._recomputeBounds();
                }
            }
        }
    }

    EndSelectionResize() {
        this._resizeSnapshot = undefined;
    }
}

// Human-readable label for status-line feedback. The numeric enum
// matches the WPF / Skia ordering: 0=Union, 1=Intersect, 2=Xor,
// 3=Exclude (= asymmetric A − B).
function combineModeName(mode) {
    switch (mode) {
        case GeometryCombineMode.Union:     return 'Union';
        case GeometryCombineMode.Intersect: return 'Intersect';
        case GeometryCombineMode.Xor:       return 'Exclude';
        case GeometryCombineMode.Exclude:   return 'Subtract';
        default: return String(mode);
    }
}

// Clone a Pen so the editor's working pen is decoupled from any
// shape's Pen — broadcasting copies values, never references.
// undefined input maps to undefined (no-op pen).
function clonePen(pen) {
    if (pen === undefined) return undefined;
    const out = new Pen(pen.Brush, pen.Thickness);
    out.DashStyle  = pen.DashStyle;
    out.LineCap    = pen.LineCap;
    out.LineJoin   = pen.LineJoin;
    out.MiterLimit = pen.MiterLimit;
    return out;
}

// Backwards-compat re-export — diagram.mjs imports NodeVM as the type
// for instanceof-checks in the selection bridge. ShapeNodeVM IS the
// base now, so alias it under the old name.
export { ShapeNodeVM as NodeVM };
