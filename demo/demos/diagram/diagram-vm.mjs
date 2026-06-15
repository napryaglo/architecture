// Diagrammer — node-only MVVM, now backed by the full 35-shape M3
// shape library. Each shape kind has its own tiny ShapeNodeVM subclass
// (so DataTemplates can dispatch by DataType the standard way), the
// toolbox enumerates every kind, and dropping any tile creates a node
// of the matching kind on the canvas.
//
// Surface:
//   * ShapeNodeVM         — base. DPs: Id, X, Y, Width, Height,
//                           IsSelected, FillBrush, LabelText. Width /
//                           Height default to NODE_DEFAULT_SIZE so the
//                           per-Kind DataTemplate can bind chrome size
//                           through `$Width` / `$Height`.
//   * <Kind>ShapeVM       — 35 one-line subclasses (each carries only a
//                           static Kind discriminator). Defined and
//                           exported below so .mu can name them in
//                           [DataType=…] clauses.
//   * ToolboxShapeVM      — one per tile. DPs: Kind, Label, PreviewNode
//                           (a ShapeNodeVM instance the tile renders at
//                           48×48 via ContentControl), BeginKindDragData.
//   * DiagramVM           — host. Holds Nodes + ToolboxShapes catalogue
//                           + Save / Load commands. CreateNode picks the
//                           right subclass by kind through KIND_TO_CLASS.

import {
    DataObject, DragDropEffects,
    MetaData, Model, ObservableCollection, RelayCommand,
} from '@visualisation-sub/mural/runtime';
import { SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { Color } from '@visualisation-sub/mural/runtime';

const STORAGE_KEY = 'diagram-demo-state-v1';

const brush = (hex) => new SolidColorBrush(Color.FromHex(hex));

// Canvas-node default fill — pastel tint that reads on @Surface in
// both Light and Dark Material schemes. Toolbox-preview default fill
// is a fuller @Primary-equivalent so the 48×48 picture stays legible.
const FILL_CANVAS  = brush('#bfdbfe');
const FILL_PREVIEW = brush('#1976d2');

export const NODE_DEFAULT_SIZE = 80;
export const PREVIEW_SIZE      = 48;

// ── ShapeNodeVM (base) ──────────────────────────────────────────────

export class ShapeNodeVM extends Model
{
    static IdKey         = Model.RegisterProperty(ShapeNodeVM, 'Id',         undefined,         MetaData.None);
    static XKey          = Model.RegisterProperty(ShapeNodeVM, 'X',          0,                 MetaData.None);
    static YKey          = Model.RegisterProperty(ShapeNodeVM, 'Y',          0,                 MetaData.None);
    static WidthKey      = Model.RegisterProperty(ShapeNodeVM, 'Width',      NODE_DEFAULT_SIZE, MetaData.None);
    static HeightKey     = Model.RegisterProperty(ShapeNodeVM, 'Height',     NODE_DEFAULT_SIZE, MetaData.None);
    static IsSelectedKey = Model.RegisterProperty(ShapeNodeVM, 'IsSelected', false,             MetaData.None);
    static FillBrushKey  = Model.RegisterProperty(ShapeNodeVM, 'FillBrush',  FILL_CANVAS,       MetaData.None);
    static LabelTextKey  = Model.RegisterProperty(ShapeNodeVM, 'LabelText',  '',                MetaData.None);

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
    get Width()       { return this._get_property_value_by_name('Width'); }
    set Width(v)      { this._set_property_value_by_name('Width', v); }
    get Height()      { return this._get_property_value_by_name('Height'); }
    set Height(v)     { this._set_property_value_by_name('Height', v); }
    get IsSelected()  { return this._get_property_value_by_name('IsSelected'); }
    set IsSelected(v) { this._set_property_value_by_name('IsSelected', v); }
    get FillBrush()   { return this._get_property_value_by_name('FillBrush'); }
    set FillBrush(v)  { this._set_property_value_by_name('FillBrush', v); }
    get LabelText()   { return this._get_property_value_by_name('LabelText'); }
    set LabelText(v)  { this._set_property_value_by_name('LabelText', v); }
}

// ── Per-Kind ShapeNodeVM subclasses ─────────────────────────────────
//
// Each subclass exists ONLY as a DataType discriminator — the matching
// `DataTemplate [DataType=<Kind>ShapeVM]` in diagram.mu paints the
// kind-specific chrome. Behaviour-wise they're identical to the base.

export class RectangleShapeVM     extends ShapeNodeVM { static Kind = 'rectangle';     }
export class EllipseShapeVM       extends ShapeNodeVM { static Kind = 'ellipse';       }
export class SquircleShapeVM      extends ShapeNodeVM { static Kind = 'squircle';      }
export class SlantedShapeVM       extends ShapeNodeVM { static Kind = 'slanted';       }
export class PillShapeVM          extends ShapeNodeVM { static Kind = 'pill';          }
export class DiamondShapeVM       extends ShapeNodeVM { static Kind = 'diamond';       }
export class PentagonShapeVM      extends ShapeNodeVM { static Kind = 'pentagon';      }
export class GemShapeVM           extends ShapeNodeVM { static Kind = 'gem';           }
export class ArchShapeVM          extends ShapeNodeVM { static Kind = 'arch';          }
export class SemicircleShapeVM    extends ShapeNodeVM { static Kind = 'semicircle';    }
export class TriangleShapeVM      extends ShapeNodeVM { static Kind = 'triangle';      }
export class ArrowShapeVM         extends ShapeNodeVM { static Kind = 'arrow';         }
export class FanShapeVM           extends ShapeNodeVM { static Kind = 'fan';           }
export class ClamshellShapeVM     extends ShapeNodeVM { static Kind = 'clamshell';     }
export class FourCookieShapeVM    extends ShapeNodeVM { static Kind = '4-cookie';      }
export class SixCookieShapeVM     extends ShapeNodeVM { static Kind = '6-cookie';      }
export class SevenCookieShapeVM   extends ShapeNodeVM { static Kind = '7-cookie';      }
export class NineCookieShapeVM    extends ShapeNodeVM { static Kind = '9-cookie';      }
export class TwelveCookieShapeVM  extends ShapeNodeVM { static Kind = '12-cookie';     }
export class FourLeafCloverShapeVM  extends ShapeNodeVM { static Kind = '4-leaf-clover'; }
export class EightLeafCloverShapeVM extends ShapeNodeVM { static Kind = '8-leaf-clover'; }
export class SunnyShapeVM         extends ShapeNodeVM { static Kind = 'sunny';         }
export class VerySunnyShapeVM     extends ShapeNodeVM { static Kind = 'very-sunny';    }
export class BurstShapeVM         extends ShapeNodeVM { static Kind = 'burst';         }
export class SoftBurstShapeVM     extends ShapeNodeVM { static Kind = 'soft-burst';    }
export class BoomShapeVM          extends ShapeNodeVM { static Kind = 'boom';          }
export class SoftBoomShapeVM      extends ShapeNodeVM { static Kind = 'soft-boom';     }
export class FlowerShapeVM        extends ShapeNodeVM { static Kind = 'flower';        }
export class PuffyShapeVM         extends ShapeNodeVM { static Kind = 'puffy';         }
export class PuffyDiamondShapeVM  extends ShapeNodeVM { static Kind = 'puffy-diamond'; }
export class GhostishShapeVM      extends ShapeNodeVM { static Kind = 'ghostish';      }
export class BunShapeVM           extends ShapeNodeVM { static Kind = 'bun';           }
export class HeartShapeVM         extends ShapeNodeVM { static Kind = 'heart';         }
export class PixelCircleShapeVM   extends ShapeNodeVM { static Kind = 'pixel-circle';  }
export class PixelTriangleShapeVM extends ShapeNodeVM { static Kind = 'pixel-triangle';}

// kind → class lookup, drives CreateNode + Load-from-serialized.
const KIND_TO_CLASS = {
    'rectangle':      RectangleShapeVM,
    'ellipse':        EllipseShapeVM,
    'squircle':       SquircleShapeVM,
    'slanted':        SlantedShapeVM,
    'pill':           PillShapeVM,
    'diamond':        DiamondShapeVM,
    'pentagon':       PentagonShapeVM,
    'gem':            GemShapeVM,
    'arch':           ArchShapeVM,
    'semicircle':     SemicircleShapeVM,
    'triangle':       TriangleShapeVM,
    'arrow':          ArrowShapeVM,
    'fan':            FanShapeVM,
    'clamshell':      ClamshellShapeVM,
    '4-cookie':       FourCookieShapeVM,
    '6-cookie':       SixCookieShapeVM,
    '7-cookie':       SevenCookieShapeVM,
    '9-cookie':       NineCookieShapeVM,
    '12-cookie':      TwelveCookieShapeVM,
    '4-leaf-clover':  FourLeafCloverShapeVM,
    '8-leaf-clover':  EightLeafCloverShapeVM,
    'sunny':          SunnyShapeVM,
    'very-sunny':     VerySunnyShapeVM,
    'burst':          BurstShapeVM,
    'soft-burst':     SoftBurstShapeVM,
    'boom':           BoomShapeVM,
    'soft-boom':      SoftBoomShapeVM,
    'flower':         FlowerShapeVM,
    'puffy':          PuffyShapeVM,
    'puffy-diamond':  PuffyDiamondShapeVM,
    'ghostish':       GhostishShapeVM,
    'bun':            BunShapeVM,
    'heart':          HeartShapeVM,
    'pixel-circle':   PixelCircleShapeVM,
    'pixel-triangle': PixelTriangleShapeVM,
};

// ── ToolboxShapeVM ──────────────────────────────────────────────────
//
// One per tile. PreviewNode is a fresh kind-typed ShapeNodeVM the tile
// renders through a ContentControl — the per-Kind DataTemplate paints
// the actual shape at the preview's Width / Height (48×48 by default).
// LabelText on the preview is empty so the picture is glyph-only; the
// tile renders the Label TextBlock separately, below the picture.

export class ToolboxShapeVM extends Model
{
    static {
        Model.RegisterProperty(ToolboxShapeVM, 'Kind',              '',        MetaData.None);
        Model.RegisterProperty(ToolboxShapeVM, 'Label',             '',        MetaData.None);
        Model.RegisterProperty(ToolboxShapeVM, 'PreviewNode',       undefined, MetaData.None);
        Model.RegisterProperty(ToolboxShapeVM, 'BeginKindDragData', undefined, MetaData.None);
    }

    constructor(kind, label) {
        super();
        const Cls = KIND_TO_CLASS[kind];
        const preview = Cls !== undefined ? new Cls('preview', 0, 0) : new ShapeNodeVM('preview', 0, 0);
        preview.Width  = PREVIEW_SIZE;
        preview.Height = PREVIEW_SIZE;
        preview.FillBrush = FILL_PREVIEW;
        this._set_property_value_by_name('Kind',        kind);
        this._set_property_value_by_name('Label',       label);
        this._set_property_value_by_name('PreviewNode', preview);
        this._set_property_value_by_name('BeginKindDragData', () => ({
            data: new DataObject().Set('mural/node-kind', this.Kind),
            effects: DragDropEffects.Copy,
        }));
    }

    get Kind()              { return this._get_property_value_by_name('Kind'); }
    get Label()             { return this._get_property_value_by_name('Label'); }
    get PreviewNode()       { return this._get_property_value_by_name('PreviewNode'); }
    get BeginKindDragData() { return this._get_property_value_by_name('BeginKindDragData'); }
}

// Toolbox catalogue — order matches the shape-library demo's grid so
// the rail reads in the same M3 sequence (base → architectural →
// cookies → clovers → radial waves → puffies → glyphs → pixel art).
const TOOLBOX_DEFS = [
    ['rectangle',      'Rectangle'],
    ['ellipse',        'Ellipse'],
    ['squircle',       'Squircle'],
    ['slanted',        'Slanted'],
    ['pill',           'Pill'],
    ['diamond',        'Diamond'],
    ['pentagon',       'Pentagon'],
    ['gem',            'Gem'],
    ['arch',           'Arch'],
    ['semicircle',     'Semicircle'],
    ['triangle',       'Triangle'],
    ['arrow',          'Arrow'],
    ['fan',            'Fan'],
    ['clamshell',      'Clamshell'],
    ['4-cookie',       '4-Cookie'],
    ['6-cookie',       '6-Cookie'],
    ['7-cookie',       '7-Cookie'],
    ['9-cookie',       '9-Cookie'],
    ['12-cookie',      '12-Cookie'],
    ['4-leaf-clover',  '4-Leaf Clover'],
    ['8-leaf-clover',  '8-Leaf Clover'],
    ['sunny',          'Sunny'],
    ['very-sunny',     'Very Sunny'],
    ['burst',          'Burst'],
    ['soft-burst',     'Soft Burst'],
    ['boom',           'Boom'],
    ['soft-boom',      'Soft Boom'],
    ['flower',         'Flower'],
    ['puffy',          'Puffy'],
    ['puffy-diamond',  'Puffy Diamond'],
    ['ghostish',       'Ghost-ish'],
    ['bun',            'Bun'],
    ['heart',          'Heart'],
    ['pixel-circle',   'Pixel Circle'],
    ['pixel-triangle', 'Pixel Triangle'],
];

// ── DiagramVM ───────────────────────────────────────────────────────

export class DiagramVM extends Model
{
    static {
        Model.RegisterProperty(DiagramVM, 'Nodes',         undefined,                          MetaData.None);
        Model.RegisterProperty(DiagramVM, 'ToolboxShapes', undefined,                          MetaData.None);
        Model.RegisterProperty(DiagramVM, 'Status',        'drag a shape from the toolbox →', MetaData.None);
        Model.RegisterProperty(DiagramVM, 'SaveCommand',   undefined,                          MetaData.None);
        Model.RegisterProperty(DiagramVM, 'LoadCommand',   undefined,                          MetaData.None);
        Model.RegisterProperty(DiagramVM, 'AlignLeftCommand',            undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'AlignRightCommand',           undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'AlignTopCommand',             undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'AlignMiddleCommand',          undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'DistributeHorizontalCommand', undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'DistributeVerticalCommand',   undefined, MetaData.None);
    }

    constructor(storage) {
        super();
        this._storage = storage;
        this._set_property_value_by_name('Nodes', new ObservableCollection());
        this._set_property_value_by_name('ToolboxShapes',
            TOOLBOX_DEFS.map(([kind, label]) => new ToolboxShapeVM(kind, label)));
        this._nextId = 1;

        this._set_property_value_by_name('SaveCommand',
            new RelayCommand(() => this.Save()));
        this._set_property_value_by_name('LoadCommand',
            new RelayCommand(() => this.Load()));

        // ── Alignment + distribute commands ─────────────────────────
        // Align needs ≥ 2 selected nodes; Distribute needs ≥ 3 (the
        // PowerPoint convention — distributing 2 shapes is a no-op,
        // distributing 3+ spaces the inner shapes evenly between the
        // extremes). The CanExecute guards return back to the bound
        // Buttons, which surface them as enabled / disabled chrome.
        this._set_property_value_by_name('AlignLeftCommand',
            new RelayCommand(() => this.AlignLeft(),  () => this._countSelected() >= 2));
        this._set_property_value_by_name('AlignRightCommand',
            new RelayCommand(() => this.AlignRight(), () => this._countSelected() >= 2));
        this._set_property_value_by_name('AlignTopCommand',
            new RelayCommand(() => this.AlignTop(),   () => this._countSelected() >= 2));
        this._set_property_value_by_name('AlignMiddleCommand',
            new RelayCommand(() => this.AlignMiddle(),() => this._countSelected() >= 2));
        this._set_property_value_by_name('DistributeHorizontalCommand',
            new RelayCommand(() => this.DistributeHorizontal(), () => this._countSelected() >= 3));
        this._set_property_value_by_name('DistributeVerticalCommand',
            new RelayCommand(() => this.DistributeVertical(),   () => this._countSelected() >= 3));

        // Selection-change tracking — each node's IsSelected change
        // (driven from the bootstrap's selection bridge mirroring
        // Selector.SelectedItems → NodeVM.IsSelected) must re-evaluate
        // every alignment command's CanExecute so the toolbar chrome
        // tracks the live selection without polling. The Map below
        // pins one listener per realized NodeVM; Nodes.Subscribe
        // installs / detaches as items come and go.
        this._selectionWatchers = new Map();
        this.Nodes.Subscribe(change => this._handleNodesChange(change));
    }

    get Nodes()                       { return this._get_property_value_by_name('Nodes'); }
    get ToolboxShapes()               { return this._get_property_value_by_name('ToolboxShapes'); }
    get Status()                      { return this._get_property_value_by_name('Status'); }
    set Status(v)                     { this._set_property_value_by_name('Status', v); }
    get SaveCommand()                 { return this._get_property_value_by_name('SaveCommand'); }
    get LoadCommand()                 { return this._get_property_value_by_name('LoadCommand'); }
    get AlignLeftCommand()            { return this._get_property_value_by_name('AlignLeftCommand'); }
    get AlignRightCommand()           { return this._get_property_value_by_name('AlignRightCommand'); }
    get AlignTopCommand()             { return this._get_property_value_by_name('AlignTopCommand'); }
    get AlignMiddleCommand()          { return this._get_property_value_by_name('AlignMiddleCommand'); }
    get DistributeHorizontalCommand() { return this._get_property_value_by_name('DistributeHorizontalCommand'); }
    get DistributeVerticalCommand()   { return this._get_property_value_by_name('DistributeVerticalCommand'); }

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
    }

    _watchSelection(node) {
        const listener = () => this._raiseAllCanExecute();
        node.AddPropertyChangedListener(ShapeNodeVM.IsSelectedKey, listener);
        this._selectionWatchers.set(node, listener);
    }

    _unwatchSelection(node) {
        const l = this._selectionWatchers.get(node);
        if (l !== undefined) {
            node.RemovePropertyChangedListener(ShapeNodeVM.IsSelectedKey, l);
            this._selectionWatchers.delete(node);
        }
    }

    _raiseAllCanExecute() {
        this.AlignLeftCommand?.RaiseCanExecuteChanged();
        this.AlignRightCommand?.RaiseCanExecuteChanged();
        this.AlignTopCommand?.RaiseCanExecuteChanged();
        this.AlignMiddleCommand?.RaiseCanExecuteChanged();
        this.DistributeHorizontalCommand?.RaiseCanExecuteChanged();
        this.DistributeVerticalCommand?.RaiseCanExecuteChanged();
    }
}

// Backwards-compat re-export — diagram.mjs imports NodeVM as the type
// for instanceof-checks in the selection bridge. ShapeNodeVM IS the
// base now, so alias it under the old name.
export { ShapeNodeVM as NodeVM };
