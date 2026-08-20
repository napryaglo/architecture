import { Visual } from '../../../runtime/index.js';
import type { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';

// One-shape geometry bridge (sibling of FormatMirror): reflects the single
// selected shape's geometry into the Diagram's SelectedShape* DPs (seed on
// selection change AND on the shape's own geometry change, so the inspector
// tracks live drags/resizes) and routes inspector edits back to the shape.
// Reentrancy is gated with `_seeding` so seed→edit→seed can't loop. Only a
// selection of exactly one node counts — otherwise HasSelectedShape is false
// and writes are ignored (the Size/Position editor disables itself).
//
// The target is always the item's Figure CONTAINER, resolved via
// Generator.ContainerFromItem. For a geometric shape (a Figure item) the
// container IS the item. For a content node (a NodeViewModel item, e.g. Plexus
// ArchNodeVM) the Diagram wraps it in a Figure container that two-way binds
// Left/Top/Width/Height to the VM (diagram.ts bindContainer) — so mirroring the
// container works uniformly, and writes propagate back to the VM through those
// binds. Working on the container (rather than the raw item) also gives
// rotation + base-size for free, since only Figures carry those DPs.
export class SelectionGeometryMirror
{
    private readonly _d: Diagram;
    private _target: Figure | undefined;
    private _seeding = false;
    private _figureUnsub: (() => void) | undefined;

    constructor(diagram: Diagram)
    {
        this._d = diagram;
        const D = diagram.constructor as typeof import('../diagram.js').Diagram;
        diagram.AddSelectionChangedListener(() => this._retarget());
        // Edits flowing IN from the inspector → write to the Figure.
        diagram.AddPropertyChangedListener(D.SelectedShapeLeftKey,     () => this._writeBack('Left'));
        diagram.AddPropertyChangedListener(D.SelectedShapeTopKey,      () => this._writeBack('Top'));
        diagram.AddPropertyChangedListener(D.SelectedShapeWidthKey,    () => this._writeBack('Width'));
        diagram.AddPropertyChangedListener(D.SelectedShapeHeightKey,   () => this._writeBack('Height'));
        diagram.AddPropertyChangedListener(D.SelectedShapeRotationKey, () => this._writeBack('Rotation'));
        this._retarget();
    }

    private _singleFigure(): Figure | undefined
    {
        const items = this._d.SelectedItems;
        if (items.length !== 1) return undefined;
        // Resolve the item to its Figure container — the item itself may be a
        // NodeViewModel (content node), whose container carries the geometry.
        const container = this._d.Generator.ContainerFromItem(items[0]);
        return container instanceof Figure ? container : undefined;
    }

    private _retarget(): void
    {
        this._figureUnsub?.(); this._figureUnsub = undefined;
        this._target = this._singleFigure();
        const D = this._d.constructor as typeof import('../diagram.js').Diagram;
        this._d.set_property_value(D.HasSelectedShapeKey, this._target !== undefined);
        const f = this._target;
        if (f !== undefined)
        {
            const seed = (): void => this._seed(f);
            const keys = [Figure.LeftKey, Figure.TopKey, Visual.WidthKey, Visual.HeightKey,
                          Figure.RotationKey, Figure.BaseWidthKey, Figure.BaseHeightKey];
            keys.forEach(k => f.AddPropertyChangedListener(k, seed));
            this._figureUnsub = (): void => keys.forEach(k => f.RemovePropertyChangedListener(k, seed));
            this._seed(f);
        }
    }

    private _seed(f: Figure): void
    {
        const D = this._d.constructor as typeof import('../diagram.js').Diagram;
        this._seeding = true;
        try {
            this._d.SelectedShapeLeft     = f.Left;
            this._d.SelectedShapeTop      = f.Top;
            this._d.SelectedShapeWidth    = f.Width;
            this._d.SelectedShapeHeight   = f.Height;
            this._d.SelectedShapeRotation = f.Rotation;
            this._d.set_property_value(D.SelectedShapeBaseWidthKey,  Number.isNaN(f.BaseWidth)  ? f.Width  : f.BaseWidth);
            this._d.set_property_value(D.SelectedShapeBaseHeightKey, Number.isNaN(f.BaseHeight) ? f.Height : f.BaseHeight);
        } finally { this._seeding = false; }
    }

    private _writeBack(prop: 'Left' | 'Top' | 'Width' | 'Height' | 'Rotation'): void
    {
        if (this._seeding || this._target === undefined) return;
        const v = ({ Left: this._d.SelectedShapeLeft, Top: this._d.SelectedShapeTop,
                     Width: this._d.SelectedShapeWidth, Height: this._d.SelectedShapeHeight,
                     Rotation: this._d.SelectedShapeRotation })[prop];
        (this._target as unknown as Record<string, number>)[prop] = v;
    }
}
