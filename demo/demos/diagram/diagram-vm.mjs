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
        // Group back-ref. undefined ≡ "top-level node" (not inside any
        // GroupVM). View-invisible structural metadata, so plain field.
        this.Parent = undefined;
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
    get IsSelected()   { return this._get_property_value_by_name('IsSelected'); }
    set IsSelected(v)  { this._set_property_value_by_name('IsSelected', v); }
    get X()            { return this._get_property_value_by_name('X'); }
    get Y()            { return this._get_property_value_by_name('Y'); }
    get Width()        { return this._get_property_value_by_name('Width'); }
    get Height()       { return this._get_property_value_by_name('Height'); }

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
        const cur = this._get_property_value_by_name('X');
        const dx  = v - cur;
        if (dx === 0) return;
        this._shiftBy(dx, 0);
    }

    set Y(v)
    {
        const cur = this._get_property_value_by_name('Y');
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
            this._set_property_value_by_name('X', 0);
            this._set_property_value_by_name('Y', 0);
            this._set_property_value_by_name('Width', 0);
            this._set_property_value_by_name('Height', 0);
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
        this._set_property_value_by_name('X',      minX);
        this._set_property_value_by_name('Y',      minY);
        this._set_property_value_by_name('Width',  maxX - minX);
        this._set_property_value_by_name('Height', maxY - minY);
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
        Model.RegisterProperty(DiagramVM, 'AlignCenterCommand',          undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'DistributeHorizontalCommand', undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'DistributeVerticalCommand',   undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'GroupCommand',                undefined, MetaData.None);
        Model.RegisterProperty(DiagramVM, 'UngroupCommand',              undefined, MetaData.None);
        // Selection bounding rect — union bbox of every entity with
        // IsSelected=true, recomputed on selection / geometry changes by
        // _updateSelectionBounds. SelectionCount lets the adorner overlay
        // toggle Visibility purely from a binding-friendly numeric DP.
        // The resize-adorner behavior binds its bbox border and uses
        // these to position its 8 handles — keys captured as static
        // properties so the behavior can subscribe via
        // AddPropertyChangedListener.
        DiagramVM.SelectionXKey      = Model.RegisterProperty(DiagramVM, 'SelectionX',      0, MetaData.None);
        DiagramVM.SelectionYKey      = Model.RegisterProperty(DiagramVM, 'SelectionY',      0, MetaData.None);
        DiagramVM.SelectionWidthKey  = Model.RegisterProperty(DiagramVM, 'SelectionWidth',  0, MetaData.None);
        DiagramVM.SelectionHeightKey = Model.RegisterProperty(DiagramVM, 'SelectionHeight', 0, MetaData.None);
        DiagramVM.SelectionCountKey  = Model.RegisterProperty(DiagramVM, 'SelectionCount',  0, MetaData.None);
    }

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
        this._set_property_value_by_name('AlignCenterCommand',
            new RelayCommand(() => this.AlignCenter(),() => this._countSelected() >= 2));
        this._set_property_value_by_name('DistributeHorizontalCommand',
            new RelayCommand(() => this.DistributeHorizontal(), () => this._countSelected() >= 3));
        this._set_property_value_by_name('DistributeVerticalCommand',
            new RelayCommand(() => this.DistributeVertical(),   () => this._countSelected() >= 3));

        // ── Group / Ungroup commands ────────────────────────────────
        // Group needs ≥ 2 selected TOP-LEVEL entities (anything that
        // could become the new group's members). Ungroup needs ≥ 1
        // selected top-level GroupVM. CanExecute is re-evaluated by
        // the same selection-listener pipeline as the align commands.
        this._set_property_value_by_name('GroupCommand',
            new RelayCommand(() => this.Group(),   () => this._selectedTopLevel().length >= 2));
        this._set_property_value_by_name('UngroupCommand',
            new RelayCommand(() => this.Ungroup(), () => this._selectedTopLevelGroups().length >= 1));

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
    get GroupCommand()                { return this._get_property_value_by_name('GroupCommand'); }
    get UngroupCommand()              { return this._get_property_value_by_name('UngroupCommand'); }
    get ToolboxShapes()               { return this._get_property_value_by_name('ToolboxShapes'); }
    get Status()                      { return this._get_property_value_by_name('Status'); }
    set Status(v)                     { this._set_property_value_by_name('Status', v); }
    get SaveCommand()                 { return this._get_property_value_by_name('SaveCommand'); }
    get LoadCommand()                 { return this._get_property_value_by_name('LoadCommand'); }
    get AlignLeftCommand()            { return this._get_property_value_by_name('AlignLeftCommand'); }
    get AlignRightCommand()           { return this._get_property_value_by_name('AlignRightCommand'); }
    get AlignTopCommand()             { return this._get_property_value_by_name('AlignTopCommand'); }
    get AlignMiddleCommand()          { return this._get_property_value_by_name('AlignMiddleCommand'); }
    get AlignCenterCommand()          { return this._get_property_value_by_name('AlignCenterCommand'); }
    get DistributeHorizontalCommand() { return this._get_property_value_by_name('DistributeHorizontalCommand'); }
    get DistributeVerticalCommand()   { return this._get_property_value_by_name('DistributeVerticalCommand'); }
    get SelectionX()                  { return this._get_property_value_by_name('SelectionX'); }
    get SelectionY()                  { return this._get_property_value_by_name('SelectionY'); }
    get SelectionWidth()              { return this._get_property_value_by_name('SelectionWidth'); }
    get SelectionHeight()             { return this._get_property_value_by_name('SelectionHeight'); }
    get SelectionCount()              { return this._get_property_value_by_name('SelectionCount'); }

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
            this._set_property_value_by_name('SelectionX',      0);
            this._set_property_value_by_name('SelectionY',      0);
            this._set_property_value_by_name('SelectionWidth',  0);
            this._set_property_value_by_name('SelectionHeight', 0);
            this._set_property_value_by_name('SelectionCount',  0);
            return;
        }
        this._set_property_value_by_name('SelectionX',      minX);
        this._set_property_value_by_name('SelectionY',      minY);
        this._set_property_value_by_name('SelectionWidth',  maxX - minX);
        this._set_property_value_by_name('SelectionHeight', maxY - minY);
        this._set_property_value_by_name('SelectionCount',  count);
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

// Backwards-compat re-export — diagram.mjs imports NodeVM as the type
// for instanceof-checks in the selection bridge. ShapeNodeVM IS the
// base now, so alias it under the old name.
export { ShapeNodeVM as NodeVM };
