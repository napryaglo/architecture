import {
    MetaData,
    MuralBase,
    Element,
    Point,
    Storyboard,
    StoryboardState,
    DoubleAnimation,
    Easings,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { RotateTransform } from '../../visual-engine/index.js';
import { Arc } from '../../basic/shapes/arc.js';
import { TemplatedControl } from '../../basic/templated-control.js';

// Material 3 Loading Indicator (M3 2024) — the explicit "still working"
// affordance, distinct from ProgressIndicator (§18.9). Where
// ProgressIndicator communicates a *quantity* (determinate fill) or a
// linear indeterminate sweep, the LoadingIndicator is a compact, always-
// indeterminate spinner whose headline trait is a **variable-amplitude
// oscillation**: a single primary-tinted arc rotates continuously while
// its sweep grows and shrinks, reading as an organic "pulse" rather than
// a constant-length ring.
//
// M3 ships the indicator in two forms, carried here by Variant:
//   * ActiveIndicator — the bare arc on a transparent ground.
//   * Contained       — the same arc centred on a filled
//     @SurfaceContainerHighest circle (the "contained" M3 treatment).
//
// mural has no shape-morph primitive (M3's reference cycles seven rounded
// polygons), so the oscillation is expressed with the tools the engine
// has: a continuous rotation (RotateTransform.Angle 0→360, looping) plus
// an AutoReverse sweep animation on the arc's EndAngle. Both ride the
// shared animation clock (ManualClock in tests, RafClock in the browser)
// via a single looping Storyboard the control owns.
export enum LoadingIndicatorVariant
{
    ActiveIndicator = 'ActiveIndicator',
    Contained       = 'Contained',
}

// Motion timings (ms). ROTATION_MS is one full turn; SWEEP_MS is one
// grow (the AutoReverse doubles it into a grow→shrink cycle). The two
// periods are deliberately non-commensurate so the pulse doesn't visibly
// lock to the rotation.
const ROTATION_MS = 1400;
const SWEEP_MS    = 650;
// Sweep amplitude, in degrees, measured from the arc's StartAngle. The
// arc oscillates between a short MIN_SWEEP tail and a long MAX_SWEEP.
const MIN_SWEEP = 40;
const MAX_SWEEP = 290;

export class LoadingIndicator extends TemplatedControl
{
    public static readonly VariantKey = MuralBase.RegisterProperty<LoadingIndicatorVariant>(
        LoadingIndicator, 'Variant', LoadingIndicatorVariant.ActiveIndicator,
        MetaData.Render);

    // Drives the animation. Default true — a freshly-shown indicator
    // spins immediately. Setting it false stops the Storyboard and
    // releases the clock subscription (an idle indicator burns no
    // frames); flipping it back true restarts (when the control is
    // loaded).
    public static readonly IsActiveKey = MuralBase.RegisterProperty<boolean>(
        LoadingIndicator, 'IsActive', true, MetaData.None);

    public get Variant(): LoadingIndicatorVariant { return this.get_property_value(LoadingIndicator.VariantKey); }
    public set Variant(v: LoadingIndicatorVariant) { this.set_property_value(LoadingIndicator.VariantKey, v); }

    public get IsActive(): boolean { return this.get_property_value(LoadingIndicator.IsActiveKey); }
    public set IsActive(v: boolean) { this.set_property_value(LoadingIndicator.IsActiveKey, v); }

    static
    {
        MuralBase.OverrideMetadata(
            LoadingIndicator, Element.DefaultStyleKeyKey,
            { default_value: LoadingIndicator });
    }

    private _fillArc:    Arc | undefined;
    private _rotate:     RotateTransform | undefined;
    private _storyboard: Storyboard | undefined;

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.adoptParts();
        // Stop while off-screen (frame economy) and (re)start on load.
        // Ctor also refreshes so a control that's shown without a Loaded
        // edge (or tested headless) still animates when IsActive.
        this.AddLoadedListener(() => this.refreshAnimation());
        this.AddUnloadedListener(() => this.stopAnimation());
        this.refreshAnimation();
    }

    // ── Template-part management ───────────────────────────────────

    private adoptParts(): void
    {
        const root = this.templateRoot;
        if (root === undefined)
        {
            throw new Error(
                'LoadingIndicator template did not materialise. Did the ' +
                'default Style in framework.resources.mu set `Template = ' +
                '@DefaultLoadingIndicator`?');
        }
        this._fillArc = root.FindName('PART_Fill') as Arc | undefined;
        if (this._fillArc === undefined) throw new Error('LoadingIndicator template missing PART_Fill');

        // Pivot the arc about its own centre. The RotateTransform's Angle
        // is what the rotation animation drives; RenderTransformOrigin =
        // (0.5, 0.5) makes the spin centre-anchored regardless of the
        // arc's box size. Held as a field so the Storyboard can target it.
        //
        // Create the transform ONCE and reuse it across re-adopts.
        // `applyDefaultStyle()` fires OnPropertyChanged('Template') — which
        // already adopts — and the ctor then adopts again; a fresh
        // RotateTransform each call would orphan the one the running
        // Storyboard targets. Reusing it keeps `arc.RenderTransform` and
        // the animation target the same object across both ctor adopts and
        // any later template swap.
        this._rotate ??= new RotateTransform();
        this._fillArc.RenderTransform       = this._rotate;
        this._fillArc.RenderTransformOrigin = new Point(0.5, 0.5);
    }

    // ── Animation lifecycle ────────────────────────────────────────

    private refreshAnimation(): void
    {
        if (this.IsActive) this.startAnimation();
        else               this.stopAnimation();
    }

    private startAnimation(): void
    {
        if (this._storyboard?.State === StoryboardState.Running) return;
        const arc    = this._fillArc;
        const rotate = this._rotate;
        if (arc === undefined || rotate === undefined) return;

        const start = arc.StartAngle;
        const sb = new Storyboard();
        // Continuous rotation — linear so the spin is even.
        sb.Add(rotate, 'Angle', new DoubleAnimation({
            From: 0, To: 360, Duration: ROTATION_MS,
            RepeatBehavior: Infinity, Easing: Easings.Linear,
        }));
        // Variable-amplitude sweep — grow then shrink (AutoReverse),
        // eased so the pulse decelerates at each extreme.
        sb.Add(arc, 'EndAngle', new DoubleAnimation({
            From: start + MIN_SWEEP, To: start + MAX_SWEEP, Duration: SWEEP_MS,
            AutoReverse: true, RepeatBehavior: Infinity, Easing: Easings.Standard,
        }));
        sb.Begin();
        this._storyboard = sb;
    }

    private stopAnimation(): void
    {
        this._storyboard?.Stop();
        this._storyboard = undefined;
    }

    // Test / consumer hook — true while the indeterminate Storyboard is
    // actively ticking.
    public get IsAnimating(): boolean
    {
        return this._storyboard?.State === StoryboardState.Running;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'Template' && newValue !== oldValue)
        {
            // Template swapped — the old arc / transform are gone; re-adopt
            // the new part, then restart the animation against it.
            this.stopAnimation();
            this.adoptParts();
            this.refreshAnimation();
            return;
        }
        if (descriptor.Owner === LoadingIndicator && name === 'IsActive')
        {
            this.refreshAnimation();
        }
    }
}
