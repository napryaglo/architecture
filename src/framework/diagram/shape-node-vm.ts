import { MetaData, Model, type PropertyDescriptor } from '../../runtime/index.js';
import { Brush, Color, Pen, SolidColorBrush, type PathGeometry } from '../../visual-engine/index.js';
import { SHAPE_CATALOG_MAP, scaleGeometry } from './shape-catalog.js';
import { DiagramSettings } from './diagram-settings.js';
import { SideConnectableNodeVM } from './side-connectable-node-vm.js';

const DEFAULT_FILL         = new SolidColorBrush(Color.FromHex('#bfdbfe'));
const DEFAULT_STROKE_BRUSH = new SolidColorBrush(Color.FromHex('#1976d2'));

export interface ShapeFromKindOptions   { readonly width?: number; readonly height?: number; }
export interface ShapeFromSourceOptions { readonly width?: number; readonly height?: number; readonly kind?: string; }

// A freeform shape as a node view-model: ports Figure's geometry logic (unit-1
// source scaled to Width/Height) onto a NodeViewModel, rendered by the
// [DataType=ShapeNodeVM] DataTemplate inside the Figure container. Extends
// SideConnectableNodeVM so connectors distribute across its sides; overrides
// Kind so the geometry-specific port providers (ellipse/triangle/…) apply.
export class ShapeNodeVM extends SideConnectableNodeVM
{
    public static readonly KindKey     = Model.RegisterProperty<string>(ShapeNodeVM, 'Kind', '', MetaData.None);
    public static readonly GeometryKey = Model.RegisterProperty<PathGeometry | undefined>(ShapeNodeVM, 'Geometry', undefined, MetaData.None);
    public static readonly FillKey     = Model.RegisterProperty<Brush | undefined>(ShapeNodeVM, 'Fill', DEFAULT_FILL, MetaData.None);
    public static readonly StrokeKey   = Model.RegisterProperty<Pen | undefined>(ShapeNodeVM, 'Stroke', undefined, MetaData.None);

    private _source: PathGeometry | undefined = undefined;

    constructor()
    {
        super();
        this.set_property_value(ShapeNodeVM.StrokeKey, new Pen(DEFAULT_STROKE_BRUSH, DiagramSettings.ShapeStrokeWidth()));
    }

    public static fromKind(kind: string, left: number, top: number, opts?: ShapeFromKindOptions): ShapeNodeVM
    {
        const entry = SHAPE_CATALOG_MAP.get(kind);
        if (entry === undefined) throw new Error(`ShapeNodeVM.fromKind: unknown kind '${kind}'`);
        const vm = new ShapeNodeVM();
        vm.Left = left; vm.Top = top;
        vm.Width  = opts?.width  ?? DiagramSettings.ShapeDefaultSize();
        vm.Height = opts?.height ?? DiagramSettings.ShapeDefaultSize();
        vm.set_property_value(ShapeNodeVM.KindKey, kind);
        vm._source = entry.unit();
        vm._rebuildGeometry();
        return vm;
    }

    public static fromSource(source: PathGeometry, left: number, top: number, opts?: ShapeFromSourceOptions): ShapeNodeVM
    {
        const vm = new ShapeNodeVM();
        vm.Left = left; vm.Top = top;
        vm.Width  = opts?.width  ?? DiagramSettings.ShapeDefaultSize();
        vm.Height = opts?.height ?? DiagramSettings.ShapeDefaultSize();
        if (opts?.kind !== undefined) vm.set_property_value(ShapeNodeVM.KindKey, opts.kind);
        vm._source = source;
        vm._rebuildGeometry();
        return vm;
    }

    // Overrides the base's Kind='' so ellipse/triangle/… select their
    // geometry-specific port providers; ArrangedRect is inherited from the base.
    public override get Kind(): string { return this.get_property_value(ShapeNodeVM.KindKey); }
    public get Geometry(): PathGeometry | undefined { return this.get_property_value(ShapeNodeVM.GeometryKey); }
    public get Fill(): Brush | undefined { return this.get_property_value(ShapeNodeVM.FillKey); }
    public set Fill(v: Brush | undefined) { this.set_property_value(ShapeNodeVM.FillKey, v); }
    public get Stroke(): Pen | undefined { return this.get_property_value(ShapeNodeVM.StrokeKey); }
    public set Stroke(v: Pen | undefined) { this.set_property_value(ShapeNodeVM.StrokeKey, v); }

    public _getSource(): PathGeometry | undefined { return this._source; }

    private _rebuildGeometry(): void
    {
        if (this._source === undefined) return;
        this.set_property_value(ShapeNodeVM.GeometryKey, scaleGeometry(this._source, this.Width, this.Height));
    }

    protected override OnPropertyChanged(descriptor: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if ((descriptor.Name === 'Width' || descriptor.Name === 'Height') && this._source !== undefined) this._rebuildGeometry();
    }
}
