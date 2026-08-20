import { MetaData, Model, Element, type PropertyDescriptor } from '../../runtime/index.js';
import { TemplatedControl } from '../../basic/templated-control.js';
import { PositionAnchor } from './position-anchor.js';

// The Size & Position editor's brain (view logic only). Raw DPs bind to the
// Diagram's SelectedShape* geometry; the derived DPs the fields bind to
// (Horizontal/Vertical position, Scale %) are kept in sync both ways with a
// reentrancy guard. LockAspectRatio is transient control state.
//
// Note: Width/Height would collide with Visual.Width/Height, so the raw size DPs
// are WidthValue/HeightValue; the WidthValue/HeightValue accessors below carry the shape size
// (used by the conversion logic + tests); Visual.Width/Height are left alone.
export class SizePositionControl extends TemplatedControl
{
    static {
        Model.OverrideMetadata(SizePositionControl, Element.DefaultStyleKeyKey, { default_value: SizePositionControl });
    }

    // ── raw (bound to SelectedShape*) ────────────────────────────────────
    public static readonly LeftKey        = Model.RegisterProperty<number>(SizePositionControl, 'Left', 0, MetaData.BindsTwoWayByDefault);
    public static readonly TopKey         = Model.RegisterProperty<number>(SizePositionControl, 'Top', 0, MetaData.BindsTwoWayByDefault);
    public static readonly WidthValueKey  = Model.RegisterProperty<number>(SizePositionControl, 'WidthValue', 0, MetaData.BindsTwoWayByDefault);
    public static readonly HeightValueKey = Model.RegisterProperty<number>(SizePositionControl, 'HeightValue', 0, MetaData.BindsTwoWayByDefault);
    public static readonly RotationKey    = Model.RegisterProperty<number>(SizePositionControl, 'Rotation', 0, MetaData.BindsTwoWayByDefault);
    public static readonly BaseWidthKey   = Model.RegisterProperty<number>(SizePositionControl, 'BaseWidth', 0, MetaData.None);
    public static readonly BaseHeightKey  = Model.RegisterProperty<number>(SizePositionControl, 'BaseHeight', 0, MetaData.None);
    public static readonly HasTargetKey   = Model.RegisterProperty<boolean>(SizePositionControl, 'HasTarget', false, MetaData.None);

    // ── derived (bound to the SpinEdit/ComboBox/Switch fields) ───────────
    public static readonly HorizontalPositionKey = Model.RegisterProperty<number>(SizePositionControl, 'HorizontalPosition', 0, MetaData.BindsTwoWayByDefault);
    public static readonly VerticalPositionKey   = Model.RegisterProperty<number>(SizePositionControl, 'VerticalPosition', 0, MetaData.BindsTwoWayByDefault);
    public static readonly ScaleWidthKey  = Model.RegisterProperty<number>(SizePositionControl, 'ScaleWidth', 100, MetaData.BindsTwoWayByDefault);
    public static readonly ScaleHeightKey = Model.RegisterProperty<number>(SizePositionControl, 'ScaleHeight', 100, MetaData.BindsTwoWayByDefault);
    public static readonly PositionFromKey = Model.RegisterProperty<PositionAnchor>(SizePositionControl, 'PositionFrom', PositionAnchor.TopLeftCorner, MetaData.BindsTwoWayByDefault);
    public static readonly LockAspectRatioKey = Model.RegisterProperty<boolean>(SizePositionControl, 'LockAspectRatio', false, MetaData.BindsTwoWayByDefault);

    private _syncing = false;

    constructor() { super(); this.applyDefaultStyle(); }

    public get Left(): number { return this.get_property_value(SizePositionControl.LeftKey); }
    public set Left(v: number) { this.set_property_value(SizePositionControl.LeftKey, v); }
    public get Top(): number { return this.get_property_value(SizePositionControl.TopKey); }
    public set Top(v: number) { this.set_property_value(SizePositionControl.TopKey, v); }
    public get WidthValue(): number { return this.get_property_value(SizePositionControl.WidthValueKey); }
    public set WidthValue(v: number) { this.set_property_value(SizePositionControl.WidthValueKey, v); }
    public get HeightValue(): number { return this.get_property_value(SizePositionControl.HeightValueKey); }
    public set HeightValue(v: number) { this.set_property_value(SizePositionControl.HeightValueKey, v); }
    public get Rotation(): number { return this.get_property_value(SizePositionControl.RotationKey); }
    public set Rotation(v: number) { this.set_property_value(SizePositionControl.RotationKey, v); }
    public get BaseWidth(): number { return this.get_property_value(SizePositionControl.BaseWidthKey); }
    public set BaseWidth(v: number) { this.set_property_value(SizePositionControl.BaseWidthKey, v); }
    public get BaseHeight(): number { return this.get_property_value(SizePositionControl.BaseHeightKey); }
    public set BaseHeight(v: number) { this.set_property_value(SizePositionControl.BaseHeightKey, v); }
    public get HasTarget(): boolean { return this.get_property_value(SizePositionControl.HasTargetKey); }
    public set HasTarget(v: boolean) { this.set_property_value(SizePositionControl.HasTargetKey, v); }
    public get HorizontalPosition(): number { return this.get_property_value(SizePositionControl.HorizontalPositionKey); }
    public set HorizontalPosition(v: number) { this.set_property_value(SizePositionControl.HorizontalPositionKey, v); }
    public get VerticalPosition(): number { return this.get_property_value(SizePositionControl.VerticalPositionKey); }
    public set VerticalPosition(v: number) { this.set_property_value(SizePositionControl.VerticalPositionKey, v); }
    public get ScaleWidth(): number { return this.get_property_value(SizePositionControl.ScaleWidthKey); }
    public set ScaleWidth(v: number) { this.set_property_value(SizePositionControl.ScaleWidthKey, v); }
    public get ScaleHeight(): number { return this.get_property_value(SizePositionControl.ScaleHeightKey); }
    public set ScaleHeight(v: number) { this.set_property_value(SizePositionControl.ScaleHeightKey, v); }
    public get PositionFrom(): PositionAnchor { return this.get_property_value(SizePositionControl.PositionFromKey); }
    public set PositionFrom(v: PositionAnchor) { this.set_property_value(SizePositionControl.PositionFromKey, v); }
    public get LockAspectRatio(): boolean { return this.get_property_value(SizePositionControl.LockAspectRatioKey); }
    public set LockAspectRatio(v: boolean) { this.set_property_value(SizePositionControl.LockAspectRatioKey, v); }

    protected override OnPropertyChanged(d: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(d, oldValue, newValue);
        if (this._syncing) return;
        this._syncing = true;
        try {
            switch (d.Name) {
                case 'Left': case 'Top': case 'PositionFrom': case 'BaseWidth': case 'BaseHeight':
                    this._recomputeDerived();
                    break;
                case 'WidthValue':
                    if (this.LockAspectRatio) this._linkHeight(oldValue as number, newValue as number);
                    this._recomputeDerived();
                    break;
                case 'HeightValue':
                    if (this.LockAspectRatio) this._linkWidth(oldValue as number, newValue as number);
                    this._recomputeDerived();
                    break;
                case 'HorizontalPosition':
                    this.Left = this.PositionFrom === PositionAnchor.Center ? this.HorizontalPosition - this.WidthValue / 2 : this.HorizontalPosition;
                    break;
                case 'VerticalPosition':
                    this.Top = this.PositionFrom === PositionAnchor.Center ? this.VerticalPosition - this.HeightValue / 2 : this.VerticalPosition;
                    break;
                case 'ScaleWidth':
                    if (this.BaseWidth > 0) this.WidthValue = this.BaseWidth * this.ScaleWidth / 100;
                    if (this.LockAspectRatio) this.ScaleHeight = this.ScaleWidth;
                    this._recomputeDerived();
                    break;
                case 'ScaleHeight':
                    if (this.BaseHeight > 0) this.HeightValue = this.BaseHeight * this.ScaleHeight / 100;
                    if (this.LockAspectRatio) this.ScaleWidth = this.ScaleHeight;
                    this._recomputeDerived();
                    break;
            }
        } finally { this._syncing = false; }
    }

    private _linkHeight(oldW: number, newW: number): void {
        if (oldW > 0 && newW > 0) this.HeightValue = this.HeightValue * (newW / oldW);
    }
    private _linkWidth(oldH: number, newH: number): void {
        if (oldH > 0 && newH > 0) this.WidthValue = this.WidthValue * (newH / oldH);
    }
    private _recomputeDerived(): void {
        const centered = this.PositionFrom === PositionAnchor.Center;
        this.HorizontalPosition = centered ? this.Left + this.WidthValue / 2 : this.Left;
        this.VerticalPosition   = centered ? this.Top + this.HeightValue / 2 : this.Top;
        this.ScaleWidth  = this.BaseWidth  > 0 ? this.WidthValue  / this.BaseWidth  * 100 : 100;
        this.ScaleHeight = this.BaseHeight > 0 ? this.HeightValue / this.BaseHeight * 100 : 100;
    }
}
