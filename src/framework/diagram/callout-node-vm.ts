import { MetaData, Model, type PropertyDescriptor } from '../../runtime/index.js';
import { resolveKey } from '../../runtime/model-internals.js';
import { pathGeometryFromSvgD, type PathGeometry, Point } from '../../visual-engine/index.js';
import { NodeViewModel } from './node-view-model.js';
import { TextNodeVM } from './text-node-vm.js';

// ── Target-side geometry a callout leader tracks ────────────────────────
// The leader endpoint is computed from Left/Top/Width/Height; both Figure
// and NodeViewModel expose those as DPs, so we subscribe by name.
const TARGET_TRACK: readonly string[] = ['Left', 'Top', 'Width', 'Height'];

// Duck-typed interface: any object that can serve as a leader target.
// Both Figure and NodeViewModel satisfy this at runtime.
export interface ILeaderTarget extends Model
{
    readonly Id?: string;
    Left:   number;
    Top:    number;
    Width:  number;
    Height: number;
}

// ─── boxEdgeToward ──────────────────────────────────────────────────────
// Returns the point on the edge of the rect (x, y, w, h) that lies on the
// ray from the rect's centre toward `target`. Ported VERBATIM from
// text-shape.ts (§ boxEdgeToward).
function boxEdgeToward(x: number, y: number, w: number, h: number, target: Point): Point
{
    const cx = x + w / 2, cy = y + h / 2;
    const dx = target.X - cx, dy = target.Y - cy;
    if (dx === 0 && dy === 0) return new Point(cx, cy);
    let t = Number.POSITIVE_INFINITY;
    if (dx > 0) t = Math.min(t, (x + w - cx) / dx);
    if (dx < 0) t = Math.min(t, (x - cx) / dx);
    if (dy > 0) t = Math.min(t, (y + h - cy) / dy);
    if (dy < 0) t = Math.min(t, (y - cy) / dy);
    return new Point(cx + t * dx, cy + t * dy);
}

// ── CalloutNodeVM ─────────────────────────────────────────────────────────
//
// VM form of the `Callout` text shape: a text box (via TextNodeVM) with a
// leader line pointing at a target node.
//
// LeaderTargetNodeKey  — the live target reference (ILeaderTarget | undefined);
//                        accepts any Model with Left/Top/Width/Height, i.e. both
//                        NodeViewModel and Figure.
// LeaderGeometryKey    — read-only computed PathGeometry (undefined when no target).
//                        The [DataType=CalloutNodeVM] template binds a Shape's
//                        Geometry to $LeaderGeometry.
// LeaderTargetId       — convenience getter returning target.Id (string | undefined);
//                        what C4 serializes and restores.
//
// Coordinate system:
//   The leader Shape lives in the callout's DataTemplate Canvas. Therefore the
//   geometry is in callout-LOCAL coords: start = boxEdge - (this.Left, this.Top),
//   end = targetCentre - (this.Left, this.Top). Matches text-shape.ts exactly.
export class CalloutNodeVM extends TextNodeVM
{
    // ── DPs ────────────────────────────────────────────────────────────

    /** Live target reference the leader points at. Accepts NodeViewModel or
     *  Figure (both expose Left/Top/Width/Height + DPs as ILeaderTarget).
     *  undefined → no leader. C4 serializes/restores via LeaderTargetId only. */
    public static readonly LeaderTargetNodeKey = Model.RegisterProperty<ILeaderTarget | undefined>(
        CalloutNodeVM, 'LeaderTargetNode', undefined, MetaData.None);

    /** Read-only computed PathGeometry. Template binds Shape.Geometry to this. */
    public static readonly LeaderGeometryKey = Model.RegisterProperty<PathGeometry | undefined>(
        CalloutNodeVM, 'LeaderGeometry', undefined, MetaData.None);

    // ── Private state ──────────────────────────────────────────────────

    private _trackedTarget: ILeaderTarget | undefined = undefined;
    private readonly _onTargetMoved = (): void => { this._updateLeader(); };

    // ── Public surface ─────────────────────────────────────────────────

    public get LeaderTargetNode(): ILeaderTarget | undefined
    {
        return this.get_property_value(CalloutNodeVM.LeaderTargetNodeKey);
    }
    public set LeaderTargetNode(v: ILeaderTarget | undefined)
    {
        this.set_property_value(CalloutNodeVM.LeaderTargetNodeKey, v);
    }

    /** The id of the current target, or undefined. C4 serializes this. */
    public get LeaderTargetId(): string | undefined
    {
        return this.get_property_value(CalloutNodeVM.LeaderTargetNodeKey)?.Id;
    }

    /** Computed leader geometry, or undefined when untargeted. */
    public get LeaderGeometry(): PathGeometry | undefined
    {
        return this.get_property_value(CalloutNodeVM.LeaderGeometryKey);
    }

    /** Release the target-geometry subscription. The document calls this when
     *  this callout is deleted so it stops tracking a node it no longer draws
     *  (mirrors the connector DetachFromHosts cascade). */
    public Detach(): void
    {
        const prev = this._trackedTarget;
        if (prev !== undefined)
        {
            for (const name of TARGET_TRACK)
            {
                const key = resolveKey(prev, undefined, name);
                prev.RemovePropertyChangedListener(key, this._onTargetMoved);
            }
            this._trackedTarget = undefined;
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);

        if (descriptor === CalloutNodeVM.LeaderTargetNodeKey.descriptor)
        {
            this._retrackTarget();
            this._updateLeader();
        }
        // Own bounds changed → redraw leader from the new box position.
        else if (
            descriptor === NodeViewModel.LeftKey.descriptor   ||
            descriptor === NodeViewModel.TopKey.descriptor    ||
            descriptor.Name === 'Width'                       ||
            descriptor.Name === 'Height'
        )
        {
            this._updateLeader();
        }
    }

    // ── Private helpers ────────────────────────────────────────────────

    /** (Re)subscribe to the target's geometry DPs so the leader follows it. */
    private _retrackTarget(): void
    {
        const prev = this._trackedTarget;
        if (prev !== undefined)
        {
            for (const name of TARGET_TRACK)
            {
                const key = resolveKey(prev, undefined, name);
                prev.RemovePropertyChangedListener(key, this._onTargetMoved);
            }
        }

        const t = this.get_property_value(CalloutNodeVM.LeaderTargetNodeKey);
        this._trackedTarget = t;
        if (t !== undefined)
        {
            for (const name of TARGET_TRACK)
            {
                const key = resolveKey(t, undefined, name);
                t.AddPropertyChangedListener(key, this._onTargetMoved);
            }
        }
    }

    /** Recompute the leader geometry in callout-local coordinates. */
    private _updateLeader(): void
    {
        const t = this.get_property_value(CalloutNodeVM.LeaderTargetNodeKey);

        if (t === undefined)
        {
            this.set_property_value(CalloutNodeVM.LeaderGeometryKey, undefined);
            return;
        }

        // Target centre in diagram (canvas) coordinates.
        const tc = new Point(t.Left + t.Width / 2, t.Top + t.Height / 2);

        // Start: point on this callout's box edge toward the target centre.
        const start = boxEdgeToward(this.Left, this.Top, this.Width, this.Height, tc);

        // Convert to callout-local coords (leader Shape is at callout origin).
        const sx = start.X - this.Left, sy = start.Y - this.Top;
        const ex = tc.X    - this.Left, ey = tc.Y    - this.Top;

        this.set_property_value(
            CalloutNodeVM.LeaderGeometryKey,
            pathGeometryFromSvgD(`M ${sx} ${sy} L ${ex} ${ey}`),
        );
    }
}
