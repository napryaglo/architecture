import { Model, type PropertyKey } from '../../../runtime/index.js';
import {
    Brush,
    Pen,
} from '../../../visual-engine/index.js';
import type { Diagram } from '../diagram.js';
import { flattenToLeaves } from '../commands/group-ops.js';

// Internal collaborator owned by Diagram. Mirrors a single editor-owned
// Brush + Pen pair onto every IFormattable leaf in the selection, and
// re-seeds the editor pair from the selection's first leaf on every
// SelectionChanged.
//
// Two duck-typed contracts on selected items (entirely independent —
// an item may satisfy both, either, or neither):
//   * IFillableItem    { Fill:   Brush | undefined }
//   * IStrokableItem   { Stroke: Pen   | undefined }
//
// Items without the property are skipped silently — keeps the
// collaborator from caring about Group / text-only / unknown VM
// shapes. The flattenToLeaves walk handles "selecting a group
// applies format to all its leaves" without needing to know
// whether the consumer's group VM is the Phase B Group class or a
// custom IGroup-shaped Model.
//
// Pen-shaped DPs: BroadcastWholePen on each FormatStroke replacement
// copies all 6 Pen DPs (Brush, Thickness, DashStyle, LineCap, LineJoin,
// MiterLimit) onto each leaf's Stroke pen IN PLACE, preserving per-
// leaf Pen identity. Per-property edits made on FormatStroke (via the
// editor wiring a PenEditor onto it) fire individual listener
// callbacks and broadcast just the changed property. Same pattern as
// the demo — see diagram-vm.mjs:1036-1167.
//
// `_seedingFormat` reentrancy gate prevents the broadcast pathway from
// firing during a seed-driven write — a fresh selection shouldn't
// replay the first leaf's values onto every OTHER leaf.

interface IFillableItem { Fill:   Brush | undefined; }
interface IStrokableItem { Stroke: Pen   | undefined; }

// Heterogeneous-typed array of Pen DP keys. Each entry is a
// `PropertyKey<T>` for a different `T`; the broadcast loops treat them
// uniformly as `PropertyKey<unknown>` so the set/get pair compiles
// without per-key narrowing (the runtime DP system carries the actual
// type identity in the key.descriptor — no behavioral change).
const PEN_KEYS: PropertyKey<unknown>[] = [
    Pen.BrushKey       as PropertyKey<unknown>,
    Pen.ThicknessKey   as PropertyKey<unknown>,
    Pen.DashStyleKey   as PropertyKey<unknown>,
    Pen.LineCapKey     as PropertyKey<unknown>,
    Pen.LineJoinKey    as PropertyKey<unknown>,
    Pen.MiterLimitKey  as PropertyKey<unknown>,
];

export class FormatMirror
{
    private readonly _diagram: Diagram;

    // Per-pen-property listeners attached to the current FormatStroke
    // instance. Detach + reattach on every FormatStroke DP change.
    private readonly _strokeListeners: Array<{ key: PropertyKey<unknown>; handler: () => void }> = [];
    private _attachedPen: Pen | undefined = undefined;

    private _seedingFormat = false;

    constructor(diagram: Diagram)
    {
        this._diagram = diagram;
        const Diagram = diagram.constructor as typeof import('../diagram.js').Diagram;
        diagram.AddSelectionChangedListener(() => this._seedFromSelection());
        diagram.AddPropertyChangedListener(Diagram.SelectionFormatFillKey,   () => this._broadcastFill());
        diagram.AddPropertyChangedListener(Diagram.SelectionFormatStrokeKey, () => this._onFormatStrokeChanged());
    }

    private _leaves(): Model[]
    {
        return flattenToLeaves(this._diagram.SelectedItems);
    }

    private _seedFromSelection(): void
    {
        const Diagram = this._diagram.constructor as typeof import('../diagram.js').Diagram;
        const leaves = this._leaves();
        this._seedingFormat = true;
        try
        {
            if (leaves.length === 0)
            {
                this._diagram.set_property_value(Diagram.SelectionFormatFillKey,   undefined);
                this._diagram.set_property_value(Diagram.SelectionFormatStrokeKey, undefined);
                return;
            }
            const first = leaves[0];
            const firstFill = (first as unknown as Partial<IFillableItem>).Fill;
            this._diagram.set_property_value(Diagram.SelectionFormatFillKey, firstFill);
            const firstStroke = (first as unknown as Partial<IStrokableItem>).Stroke;
            // Clone the pen so the editor doesn't mutate the first leaf's
            // Pen by-reference — broadcast back copies properties onto
            // each leaf's OWN Pen, preserving per-leaf identity.
            this._diagram.set_property_value(Diagram.SelectionFormatStrokeKey,
                firstStroke !== undefined ? clonePen(firstStroke) : undefined);
        }
        finally
        {
            this._seedingFormat = false;
        }
    }

    private _broadcastFill(): void
    {
        if (this._seedingFormat) return;
        const brush = this._diagram.SelectionFormatFill;
        for (const leaf of this._leaves())
        {
            if ('Fill' in (leaf as object))
            {
                (leaf as unknown as IFillableItem).Fill = brush;
            }
        }
    }

    private _onFormatStrokeChanged(): void
    {
        // Detach from the prior pen first.
        this._detachStrokeListeners();
        const pen = this._diagram.SelectionFormatStroke;
        if (pen !== undefined) this._attachStrokeListeners(pen);
        // Replacement itself is a broadcast — copy every property onto
        // each leaf's pen IN PLACE. Seed-driven replacements are gated.
        if (!this._seedingFormat) this._broadcastWholePen();
    }

    private _attachStrokeListeners(pen: Pen): void
    {
        this._attachedPen = pen;
        for (const key of PEN_KEYS)
        {
            const handler = (): void => this._broadcastStrokeProp(key);
            pen.AddPropertyChangedListener(key, handler);
            this._strokeListeners.push({ key, handler });
        }
    }

    private _detachStrokeListeners(): void
    {
        if (this._attachedPen === undefined) return;
        for (const { key, handler } of this._strokeListeners)
        {
            this._attachedPen.RemovePropertyChangedListener(key, handler);
        }
        this._strokeListeners.length = 0;
        this._attachedPen = undefined;
    }

    private _broadcastStrokeProp(key: PropertyKey<unknown>): void
    {
        if (this._seedingFormat) return;
        const editorPen = this._diagram.SelectionFormatStroke;
        if (editorPen === undefined) return;
        const value = editorPen.get_property_value(key);
        for (const leaf of this._leaves())
        {
            const target = (leaf as unknown as Partial<IStrokableItem>).Stroke;
            if (target === undefined) continue;
            target.set_property_value(key, value);
        }
    }

    private _broadcastWholePen(): void
    {
        const editorPen = this._diagram.SelectionFormatStroke;
        if (editorPen === undefined) return;
        for (const leaf of this._leaves())
        {
            const target = (leaf as unknown as Partial<IStrokableItem>).Stroke;
            if (target === undefined) continue;
            for (const key of PEN_KEYS)
            {
                target.set_property_value(key, editorPen.get_property_value(key));
            }
        }
    }
}

// Per-property copy into a fresh Pen instance — preserves the editor's
// independence from the source pen's identity. The cloned pen is what
// the FormatStroke DP holds; broadcasts copy ITS values back onto each
// leaf's own Pen.
function clonePen(src: Pen): Pen
{
    const out = new Pen();
    for (const key of PEN_KEYS) out.set_property_value(key, src.get_property_value(key));
    return out;
}
