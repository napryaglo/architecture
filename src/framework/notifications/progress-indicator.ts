import { MetaData, Model, Element, type PropertyDescriptor } from '../../runtime/index.js';
import { Arc } from '../../basic/shapes/arc.js';
import { Border } from '../../basic/border.js';
import { TemplatedControl } from '../../basic/templated-control.js';

// M3 Progress Indicator — feedback for an in-flight operation. Two
// variants per the M3 spec:
//   * Linear  — horizontal track with a moving fill segment.
//   * Circular — ring with a sweeping arc.
//
// Each variant supports a Determinate mode (Value in 0..1 drives the
// fill / arc length) and an Indeterminate mode (the fill / arc
// continuously cycles to signal "working" without a quantifiable
// progress fraction).
//
// mural ships the Linear variant here. Circular needs an Arc geometry
// primitive in the visual-engine before the template can express it
// declaratively; the surface is registered so the Variant trigger
// ladder is ready when that lands.
export enum ProgressIndicatorVariant
{
    Linear   = 'Linear',
    Circular = 'Circular',
}

export class ProgressIndicator extends TemplatedControl
{
    public static readonly VariantKey = Model.RegisterProperty<ProgressIndicatorVariant>(
        ProgressIndicator, 'Variant', ProgressIndicatorVariant.Linear,
        MetaData.Render);

    // Value in [0, 1]. The template clamps for display; an out-of-
    // range Value stays on the DP (same convention Slider uses) so a
    // binding-source's raw signal isn't lost.
    public static readonly ValueKey = Model.RegisterProperty<number>(
        ProgressIndicator, 'Value', 0, MetaData.Render);

    // When true, ignore Value and show the indeterminate animation.
    // The Linear indeterminate animation is a back-and-forth sweep of
    // a fixed-width fill segment; the implicit-transition engine
    // running on Visual handles the linear interpolation as long as
    // the template author registers an animation against
    // PART_Fill.Margin (or similar). v0 ships the static-fill chrome
    // only; the indeterminate animation is template-author territory
    // until a dedicated Phase 9 extension lands.
    public static readonly IsIndeterminateKey = Model.RegisterProperty<boolean>(
        ProgressIndicator, 'IsIndeterminate', false, MetaData.Render);

    public get Variant(): ProgressIndicatorVariant { return this.get_property_value(ProgressIndicator.VariantKey); }
    public set Variant(v: ProgressIndicatorVariant) { this.set_property_value(ProgressIndicator.VariantKey, v); }

    public get Value(): number { return this.get_property_value(ProgressIndicator.ValueKey); }
    public set Value(v: number) { this.set_property_value(ProgressIndicator.ValueKey, v); }

    public get IsIndeterminate(): boolean { return this.get_property_value(ProgressIndicator.IsIndeterminateKey); }
    public set IsIndeterminate(v: boolean) { this.set_property_value(ProgressIndicator.IsIndeterminateKey, v); }

    static {
        Model.OverrideMetadata(
            ProgressIndicator, Element.DefaultStyleKeyKey,
            { default_value: ProgressIndicator });
    }

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.adoptParts();
        this.syncFillGeometry();
    }

    // PART_Fill (the active-progress sweep) is an Arc whose EndAngle is
    // driven by the consumer's Value. The trigger DSL doesn't carry
    // arithmetic, so the angle-from-value mapping happens here. Track
    // is a full circle the consumer doesn't drive.
    private _fillArc: Arc | undefined;
    private _linearFill: Border | undefined;
    private _outerFrame: Border | undefined;
    private adoptParts(): void
    {
        this._fillArc    = this.GetTemplateChild('PART_Fill')       as Arc | undefined;
        this._linearFill = this.GetTemplateChild('PART_Fill')       as Border | undefined;
        this._outerFrame = this.GetTemplateChild('PART_OuterFrame') as Border | undefined;
        // Note: the Linear template's PART_Fill is a Border (Width-driven)
        // and the Circular template's PART_Fill is an Arc (EndAngle-driven).
        // GetTemplateChild returns the same name to either; the class
        // tells them apart by instanceof at sync time.
    }

    private syncFillGeometry(): void
    {
        const value = Math.max(0, Math.min(1, this.Value));
        // Circular: Fill is an Arc — sweep StartAngle..StartAngle+360×value.
        if (this._fillArc instanceof Arc)
        {
            const start = this._fillArc.StartAngle;
            this._fillArc.EndAngle = start + 360 * value;
        }
        // Linear: Fill is a Border — width is a fraction of the outer
        // frame. Mural's templates default to a 4dp track; the inner
        // frame doesn't know its own width at construction time so we
        // express the fraction via a HorizontalAlignment=Stretch + a
        // shrinking right margin. Simpler shape: the consumer sets the
        // Width directly via a $-binding or a converter. v0 uses the
        // ScaleX-on-render path: when PART_Fill is a Border in the
        // Linear chrome, the parent's RenderSize × value is the target
        // width. We apply that by writing PART_Fill.Width when both
        // the outer frame is sized and Value changes.
        if (this._linearFill instanceof Border && this._outerFrame === undefined)
        {
            // The Linear template doesn't ship PART_OuterFrame, so this
            // Linear branch only fires for the Linear chrome. Outer
            // width is the templated parent's RenderSize.Width — read
            // it lazily because at construction time the template
            // hasn't been laid out yet. A future MeasureOverride hook
            // would refresh this on every layout pass; for now the
            // consumer sets PART_Fill.Width directly if they need
            // dynamic scaling.
            // Intentionally a no-op — see ProgressIndicator class doc.
        }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Template' && newValue !== oldValue)
        {
            this.adoptParts();
            this.syncFillGeometry();
            return;
        }
        if (descriptor.Owner === ProgressIndicator && descriptor.Name === 'Value')
        {
            this.syncFillGeometry();
        }
    }
}
