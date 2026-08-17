import { MetaData } from '../../runtime/metadata.js';
import { Model } from '../../runtime/model.js';
import { ObservableCollection } from '../../runtime/observable-collection.js';
import { Freezable } from '../../runtime/freezable.js';
import { Matrix } from '../primitives.js';

// Renderer-agnostic transform node. Drops into Visual.RenderTransform —
// the SVG renderer reads `Matrix` and composes it with ArrangedRect +
// RenderTransformOrigin into the outer <g>'s transform attribute. Same
// Transform tree also feeds Geometry.Transform for shape-local affines.
//
// Concrete subclasses:
//
//   * Identity            — shared singleton; no-op transform
//   * TranslateTransform  — X / Y offset
//   * RotateTransform     — Angle (degrees) around (CenterX, CenterY)
//   * ScaleTransform      — ScaleX / ScaleY around (CenterX, CenterY)
//   * SkewTransform       — AngleX / AngleY (degrees) around (CenterX, CenterY)
//   * MatrixTransform     — arbitrary 2D affine matrix (escape hatch)
//   * TransformGroup      — composition of an ordered Children list
//
// Transform is a Freezable (§ 5.2): per-frame inner-DP changes (Angle
// tweening 0 → 45, ScaleX bound to a slider, Children.Add on a
// TransformGroup) reach EVERY owning Visual through Freezable's owner /
// Changed mechanism — a Visual registers as an owner when the Transform is
// assigned to Visual.RenderTransform (and unregisters on swap-out). Unlike
// the old single-consumer `_setRenderInvalidator` hook this replaced,
// sharing one Transform across two Visuals now notifies both. Callers that
// want share-by-value can `Clone()`; `Freeze()` makes a Transform immutable
// and share-safe with zero tracking.
//
// Identity's Matrix is precomputed once (`Matrix.Identity`), so the
// renderer's `if (transform === Transform.Identity) skip` short-circuit
// is a single reference compare on the hot path. Identity is frozen — it's
// the shared immutable no-op transform.
export abstract class Transform extends Freezable
{
    public abstract get Matrix(): Matrix;

    public static readonly Identity: Transform;
}

class IdentityTransform extends Transform
{
    public override get Matrix(): Matrix { return Matrix.Identity; }
}

// Initialized after IdentityTransform is defined to avoid a forward-ref
// error in the static initializer. Frozen — the shared singleton must never
// mutate, and freezing makes RegisterOwner a no-op so it accumulates no
// listeners when held as a default value.
{
    const identity = new IdentityTransform();
    identity.Freeze();
    (Transform as { Identity: Transform }).Identity = identity;
}

// Pure translation by (X, Y). X and Y are bindable Model properties
// flagged Render — animating either fires the consumer Visual's render
// invalidation through the existing property-change pipeline.
export class TranslateTransform extends Transform
{
    public static readonly XKey = Model.RegisterProperty<number>(TranslateTransform, 'X', 0, MetaData.Render);
    public static readonly YKey = Model.RegisterProperty<number>(TranslateTransform, 'Y', 0, MetaData.Render);

    constructor(x?: number, y?: number)
    {
        super();
        if (x !== undefined) this.X = x;
        if (y !== undefined) this.Y = y;
    }

    public get X(): number { return this.get_property_value(TranslateTransform.XKey); }
    public set X(value: number) { this.set_property_value(TranslateTransform.XKey, value); }

    public get Y(): number { return this.get_property_value(TranslateTransform.YKey); }
    public set Y(value: number) { this.set_property_value(TranslateTransform.YKey, value); }

    public override get Matrix(): Matrix { return Matrix.Translate(this.X, this.Y); }
}

// Rotation by `Angle` degrees around (CenterX, CenterY). CenterX and
// CenterY are absolute coordinates in the Transform's local space (NOT
// fractions — that role is played by Visual.RenderTransformOrigin when
// the Transform feeds Visual.RenderTransform). For a rotation around
// the visual's center, set the Visual's RenderTransformOrigin to
// (0.5, 0.5) and leave CenterX / CenterY at zero — the origin shift
// already handles centering. CenterX / CenterY are mostly useful for
// Geometry.Transform consumers that need a pivot in their own
// coordinate frame. WPF parity — RotateTransform.Angle is degrees.
export class RotateTransform extends Transform
{
    public static readonly AngleKey   = Model.RegisterProperty<number>(RotateTransform, 'Angle',   0, MetaData.Render);
    public static readonly CenterXKey = Model.RegisterProperty<number>(RotateTransform, 'CenterX', 0, MetaData.Render);
    public static readonly CenterYKey = Model.RegisterProperty<number>(RotateTransform, 'CenterY', 0, MetaData.Render);

    constructor(angle?: number, centerX?: number, centerY?: number)
    {
        super();
        if (angle   !== undefined) this.Angle   = angle;
        if (centerX !== undefined) this.CenterX = centerX;
        if (centerY !== undefined) this.CenterY = centerY;
    }

    public get Angle():   number { return this.get_property_value(RotateTransform.AngleKey); }
    public set Angle(v:   number) { this.set_property_value(RotateTransform.AngleKey, v); }

    public get CenterX(): number { return this.get_property_value(RotateTransform.CenterXKey); }
    public set CenterX(v: number) { this.set_property_value(RotateTransform.CenterXKey, v); }

    public get CenterY(): number { return this.get_property_value(RotateTransform.CenterYKey); }
    public set CenterY(v: number) { this.set_property_value(RotateTransform.CenterYKey, v); }

    public override get Matrix(): Matrix
    {
        const radians = (this.Angle * Math.PI) / 180;
        const r = Matrix.Rotate(radians);
        const cx = this.CenterX;
        const cy = this.CenterY;
        if (cx === 0 && cy === 0) return r;
        // T(-cx,-cy) · R · T(cx,cy)  — row-vector multiplication, so
        // the leftmost factor applies first to a point.
        return Matrix.Translate(-cx, -cy).Multiply(r).Multiply(Matrix.Translate(cx, cy));
    }
}

// Non-uniform scale by (ScaleX, ScaleY) around (CenterX, CenterY).
// Defaults: ScaleX = ScaleY = 1 (identity), CenterX = CenterY = 0
// (top-left pivot in local space). Same CenterX / CenterY note as
// RotateTransform: when feeding Visual.RenderTransform, prefer
// Visual.RenderTransformOrigin = (0.5, 0.5) for center-pivot scales.
export class ScaleTransform extends Transform
{
    public static readonly ScaleXKey  = Model.RegisterProperty<number>(ScaleTransform, 'ScaleX',  1, MetaData.Render);
    public static readonly ScaleYKey  = Model.RegisterProperty<number>(ScaleTransform, 'ScaleY',  1, MetaData.Render);
    public static readonly CenterXKey = Model.RegisterProperty<number>(ScaleTransform, 'CenterX', 0, MetaData.Render);
    public static readonly CenterYKey = Model.RegisterProperty<number>(ScaleTransform, 'CenterY', 0, MetaData.Render);

    constructor(scaleX?: number, scaleY?: number, centerX?: number, centerY?: number)
    {
        super();
        if (scaleX  !== undefined) this.ScaleX  = scaleX;
        if (scaleY  !== undefined) this.ScaleY  = scaleY;
        if (centerX !== undefined) this.CenterX = centerX;
        if (centerY !== undefined) this.CenterY = centerY;
    }

    public get ScaleX():  number { return this.get_property_value(ScaleTransform.ScaleXKey); }
    public set ScaleX(v:  number) { this.set_property_value(ScaleTransform.ScaleXKey, v); }

    public get ScaleY():  number { return this.get_property_value(ScaleTransform.ScaleYKey); }
    public set ScaleY(v:  number) { this.set_property_value(ScaleTransform.ScaleYKey, v); }

    public get CenterX(): number { return this.get_property_value(ScaleTransform.CenterXKey); }
    public set CenterX(v: number) { this.set_property_value(ScaleTransform.CenterXKey, v); }

    public get CenterY(): number { return this.get_property_value(ScaleTransform.CenterYKey); }
    public set CenterY(v: number) { this.set_property_value(ScaleTransform.CenterYKey, v); }

    public override get Matrix(): Matrix
    {
        const sx = this.ScaleX;
        const sy = this.ScaleY;
        const s  = Matrix.Scale(sx, sy);
        const cx = this.CenterX;
        const cy = this.CenterY;
        if (cx === 0 && cy === 0) return s;
        return Matrix.Translate(-cx, -cy).Multiply(s).Multiply(Matrix.Translate(cx, cy));
    }
}

// Shear by AngleX degrees horizontally (X-shift proportional to Y) and
// AngleY degrees vertically (Y-shift proportional to X), around
// (CenterX, CenterY). WPF parity — SkewTransform.AngleX / AngleY in
// degrees. Useful for slanted-card chrome, italic-style emphasis, and
// any "skew tile" effect a shape language wants. Combine with
// RenderTransformOrigin for visually-centered shears when the
// Transform is set as Visual.RenderTransform.
//
// Matrix layout (row-vector form, our M11/M12/M21/M22 convention):
//
//     | 1            tan(AngleY)  0 |
//     | tan(AngleX)  1            0 |
//     | 0            0            1 |
//
// AngleX shears horizontally: x' = x + y · tan(AngleX). AngleY shears
// vertically: y' = x · tan(AngleY) + y. CenterX / CenterY pivot the
// shear via a T(-c) · Skew · T(c) sandwich, same as Rotate / Scale.
export class SkewTransform extends Transform
{
    public static readonly AngleXKey  = Model.RegisterProperty<number>(SkewTransform, 'AngleX',  0, MetaData.Render);
    public static readonly AngleYKey  = Model.RegisterProperty<number>(SkewTransform, 'AngleY',  0, MetaData.Render);
    public static readonly CenterXKey = Model.RegisterProperty<number>(SkewTransform, 'CenterX', 0, MetaData.Render);
    public static readonly CenterYKey = Model.RegisterProperty<number>(SkewTransform, 'CenterY', 0, MetaData.Render);

    constructor(angleX?: number, angleY?: number, centerX?: number, centerY?: number)
    {
        super();
        if (angleX  !== undefined) this.AngleX  = angleX;
        if (angleY  !== undefined) this.AngleY  = angleY;
        if (centerX !== undefined) this.CenterX = centerX;
        if (centerY !== undefined) this.CenterY = centerY;
    }

    public get AngleX():  number { return this.get_property_value(SkewTransform.AngleXKey); }
    public set AngleX(v:  number) { this.set_property_value(SkewTransform.AngleXKey, v); }

    public get AngleY():  number { return this.get_property_value(SkewTransform.AngleYKey); }
    public set AngleY(v:  number) { this.set_property_value(SkewTransform.AngleYKey, v); }

    public get CenterX(): number { return this.get_property_value(SkewTransform.CenterXKey); }
    public set CenterX(v: number) { this.set_property_value(SkewTransform.CenterXKey, v); }

    public get CenterY(): number { return this.get_property_value(SkewTransform.CenterYKey); }
    public set CenterY(v: number) { this.set_property_value(SkewTransform.CenterYKey, v); }

    public override get Matrix(): Matrix
    {
        const tx = Math.tan((this.AngleX * Math.PI) / 180);
        const ty = Math.tan((this.AngleY * Math.PI) / 180);
        const skew = new Matrix(1, ty, tx, 1, 0, 0);
        const cx = this.CenterX;
        const cy = this.CenterY;
        if (cx === 0 && cy === 0) return skew;
        return Matrix.Translate(-cx, -cy).Multiply(skew).Multiply(Matrix.Translate(cx, cy));
    }
}

// Arbitrary 2D affine transform — the escape hatch when no specialized
// Transform subclass fits. Wraps a Matrix value type as a single
// bindable property. For composed transforms prefer TransformGroup
// (correct inner-property animation); use MatrixTransform when the
// matrix is computed externally and assigned wholesale.
export class MatrixTransform extends Transform
{
    public static readonly MatrixKey = Model.RegisterProperty<Matrix>(
        MatrixTransform, 'Matrix', Matrix.Identity, MetaData.Render);

    constructor(matrix?: Matrix)
    {
        super();
        if (matrix !== undefined) this.Matrix = matrix;
    }

    public override get Matrix(): Matrix { return this.get_property_value(MatrixTransform.MatrixKey); }
    public set Matrix(value: Matrix) { this.set_property_value(MatrixTransform.MatrixKey, value); }
}

// Composition of multiple Transforms applied in order. Children[0]
// is applied FIRST to a point (it's the innermost / rightmost factor
// in the composed matrix), then Children[1], and so on. Matches WPF's
// TransformGroup semantics.
//
// Matrix is recomputed on every read by folding `Multiply` over the
// children list — there's no per-instance matrix cache. The cost is
// linear in Children.Count plus a 6-mul-and-3-add per pair, which is
// negligible for the typical 2–4 children case.
//
// Inner-property changes on child Transforms (a nested RotateTransform.
// Angle tweening from 0 → 45) reach every owning Visual through Freezable's
// owner bubbling: the group registers itself as an owner on each child, so a
// child's change fires the group's Changed, which fires the group's owners.
// Structural changes (Children.Add / Remove / Clear) re-sync those child
// registrations and fire Changed too. Because Children is a plain-field
// ObservableCollection (not a DP), the group manages this wiring itself
// rather than relying on Freezable's DP-driven child tracking, and overrides
// collectFreezableChildren / cloneExtra so Freeze and Clone reach the list.
export class TransformGroup extends Transform
{
    private readonly _children: ObservableCollection<Transform>;
    // Children we've registered our bubble on. Source of truth for
    // reconciling owner registrations across arbitrary collection mutations.
    private readonly _subscribed: Set<Transform> = new Set();
    // Stable bubble: a child's inner change → this group's Changed.
    private readonly _childBubble = (): void => { this.fireChanged(); };

    constructor()
    {
        super();
        this._children = new ObservableCollection<Transform>();
        // Any structural change re-syncs child owner registrations, then
        // fires Changed so the structural edit re-paints the owning Visual.
        this._children.Subscribe(() => { this.resyncChildren(); this.fireChanged(); });
    }

    // Reconcile our owner registration against the current children set:
    // unregister from departed children, register on newcomers. Handles
    // every collection mutation kind (insert / remove / replace / clear /
    // move) uniformly by diffing against _subscribed.
    private resyncChildren(): void
    {
        const current = new Set<Transform>();
        for (let i = 0; i < this._children.Count; i++)
        {
            const c = this._children.Get(i);
            if (c !== undefined) current.add(c);
        }
        for (const c of this._subscribed)
        {
            if (!current.has(c)) { c.UnregisterOwner(this._childBubble); this._subscribed.delete(c); }
        }
        for (const c of current)
        {
            if (!this._subscribed.has(c)) { c.RegisterOwner(this._childBubble); this._subscribed.add(c); }
        }
    }

    /** Ordered list of child transforms. Children[0] applies FIRST
     *  to a point, then Children[1], and so on (WPF TransformGroup
     *  semantics). Mutations fire render invalidation on the owning
     *  Visual when this group is set as Visual.RenderTransform. */
    public get Children(): ObservableCollection<Transform>
    {
        return this._children;
    }

    public override get Matrix(): Matrix
    {
        let m = Matrix.Identity;
        for (let i = 0; i < this._children.Count; i++)
        {
            const child = this._children.Get(i);
            if (child === undefined) continue;
            m = m.Multiply(child.Matrix);
        }
        return m;
    }

    // Freeze / CanFreeze must reach the non-DP Children list.
    protected override collectFreezableChildren(): Freezable[]
    {
        const out = super.collectFreezableChildren();
        for (let i = 0; i < this._children.Count; i++)
        {
            const c = this._children.Get(i);
            if (c !== undefined) out.push(c);
        }
        return out;
    }

    // Clone deep-copies the (non-DP) children.
    protected override cloneExtra(source: this): void
    {
        for (let i = 0; i < source._children.Count; i++)
        {
            const c = source._children.Get(i);
            if (c !== undefined) this._children.Add(c.Clone());
        }
    }
}
