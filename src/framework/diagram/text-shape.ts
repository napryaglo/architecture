import { MetaData, Model, type PropertyDescriptor } from '../../runtime/index.js';
import { resolveKey } from '../../runtime/model-internals.js';
import { Color, pathGeometryFromSvgD, Pen, Point, SolidColorBrush } from '../../visual-engine/index.js';
import { Shape } from '../../basic/shapes/shape.js';
import { Canvas } from '../../basic/panels/canvas.js';
import { Figure } from './figure.js';
import { TextAutoFit } from './shape-text.js';

// ─────────────────────────────────────────────────────────────────────
// Text shapes (§ diagram-text Slice 8) — the final layer. A TextShape is a
// Figure whose reason for being is its text: a rectangular box with a
// transparent (but hit-testable) fill and a subtle outline, auto-growing to
// its label. It reuses everything Figures gained in Slices 1–7 — placement,
// rich content, in-place editing, fields, auto-fit — so it drags, selects,
// edits, formats and persists like any node.
//
// A Callout adds a leader line that points at a target Figure and follows it
// as the target moves — a self-drawn Shape injected into the Figure's
// template Canvas (the same way the connectors materializer mounts caps).

// Transparent fill still carries a hit region (see the Group chrome note in
// diagram.template.mu), so the box interior is draggable while invisible;
// the outline gives it a light "text box" edge.
const TEXT_SHAPE_FILL   = new SolidColorBrush(Color.FromHex('#00000000'));
const TEXT_SHAPE_STROKE = new Pen(new SolidColorBrush(Color.FromHex('#94a3b8')), 1);
const CALLOUT_LEADER     = new Pen(new SolidColorBrush(Color.FromHex('#64748b')), 1.5);

const TEXT_SHAPE_DEFAULT_W = 120;
const TEXT_SHAPE_DEFAULT_H = 44;

export class TextShape extends Figure
{
    constructor()
    {
        super();
        // A rectangular box, identified as a text shape (its Kind drives
        // serialization: on load kind='text' reconstructs a TextShape).
        this.ApplyCatalogKind('rectangle');
        this.set_property_value(Figure.KindKey, 'text');
        this.Fill = TEXT_SHAPE_FILL;
        // Per-instance Pen (PenEditor mutates in place), like Figure's default.
        this.set_property_value(Figure.StrokeKey, new Pen(TEXT_SHAPE_STROKE.Brush, TEXT_SHAPE_STROKE.Thickness));
        // The text is the shape — grow to contain it.
        this.Text.AutoFit = TextAutoFit.GrowShape;
        this.Width  = TEXT_SHAPE_DEFAULT_W;
        this.Height = TEXT_SHAPE_DEFAULT_H;
    }
}

export class Callout extends TextShape
{
    // The Figure the leader points at. Tracked live — the leader re-draws
    // when the target (or this callout) moves. undefined → no leader.
    public static readonly LeaderTargetNodeKey = Model.RegisterProperty<Figure | undefined>(
        Callout, 'LeaderTargetNode', undefined, MetaData.None);

    private _leader: Shape | undefined;
    private _trackedTarget: Figure | undefined;
    private readonly _onTargetMoved = (): void => this._updateLeader();

    constructor()
    {
        super();
        this.set_property_value(Figure.KindKey, 'callout');
        // Inject the leader Shape into the template Canvas so it paints
        // alongside the box + label. Non-hit so it never swallows clicks; the
        // Canvas doesn't clip, so the line reaches past the box to the target.
        const root = this.templateRoot;
        if (root instanceof Canvas)
        {
            const leader = new Shape();
            leader.Stroke = new Pen(CALLOUT_LEADER.Brush, CALLOUT_LEADER.Thickness);
            leader.IsHitTestVisible = false;
            root.AddChild(leader);
            this._leader = leader;
        }
    }

    public get LeaderTargetNode(): Figure | undefined  { return this.get_property_value(Callout.LeaderTargetNodeKey); }
    public set LeaderTargetNode(v: Figure | undefined) { this.set_property_value(Callout.LeaderTargetNodeKey, v); }

    protected override OnPropertyChanged(descriptor: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor === Callout.LeaderTargetNodeKey.descriptor)
        {
            this._retrackTarget();
            this._updateLeader();
        }
        // The callout moved / resized — redraw the leader from its new box.
        else if (descriptor === Figure.LeftKey.descriptor || descriptor === Figure.TopKey.descriptor
              || descriptor.Name === 'Width' || descriptor.Name === 'Height')
        {
            this._updateLeader();
        }
    }

    // (Re)subscribe to the target's geometry so the leader follows it as the
    // target moves or resizes.
    private _retrackTarget(): void
    {
        const prev = this._trackedTarget;
        if (prev !== undefined)
        {
            for (const name of TARGET_TRACK) prev.RemovePropertyChangedListener(resolveKey(prev, undefined, name), this._onTargetMoved);
        }
        const t = this.LeaderTargetNode;
        this._trackedTarget = t;
        if (t !== undefined)
        {
            for (const name of TARGET_TRACK) t.AddPropertyChangedListener(resolveKey(t, undefined, name), this._onTargetMoved);
        }
    }

    // Draw the leader in callout-local coords: from the box edge toward the
    // target, out to the target's centre. undefined geometry when untargeted.
    private _updateLeader(): void
    {
        const leader = this._leader;
        if (leader === undefined) return;
        const t = this.LeaderTargetNode;
        if (t === undefined) { leader.Geometry = undefined; return; }
        const tc = new Point(t.Left + t.Width / 2, t.Top + t.Height / 2);
        const start = boxEdgeToward(this.Left, this.Top, this.Width, this.Height, tc);
        // Local coords (relative to this callout's origin).
        const sx = start.X - this.Left, sy = start.Y - this.Top;
        const ex = tc.X - this.Left,    ey = tc.Y - this.Top;
        leader.Geometry = pathGeometryFromSvgD(`M ${sx} ${sy} L ${ex} ${ey}`);
    }
}

// Target geometry a callout leader tracks (its centre = f(Left,Top,Width,Height)).
const TARGET_TRACK: readonly string[] = ['Left', 'Top', 'Width', 'Height'];

// The point on a rect's edge along the ray from its centre toward `target`.
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
