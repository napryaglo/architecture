import { MetaData, Model, Size, type PropertyDescriptor } from '../../runtime/index.js';
import { Brush, Color, Pen, SolidColorBrush } from '../../visual-engine/index.js';
import { NodeViewModel } from './node-view-model.js';
import { DiagramSettings } from './diagram-settings.js';
import { ShapeText, TextAutoFit } from './shape-text.js';
import { FieldKind, resolveFields } from './shape-text-field.js';

// Reuse the same visual constants TextShape uses so the VM renders identically.
const TEXT_NODE_FILL   = new SolidColorBrush(Color.FromHex('#00000000'));
const TEXT_NODE_STROKE = new Pen(new SolidColorBrush(Color.FromHex('#94a3b8')), 1);

const TEXT_NODE_DEFAULT_W = 120;
const TEXT_NODE_DEFAULT_H = 44;

// DP names whose change triggers a label-field re-resolution (mirrors Figure).
const FIELD_SOURCE_NAMES = new Set(['Left', 'Top', 'Width', 'Height', 'Id']);

// TextNodeVM — the VM form of TextShape: a rectangular text-box node rendered
// by the [DataType=TextNodeVM] DataTemplate inside the Figure container.
// Carries a ShapeText (AutoFit=GrowShape) as a first-class DP so the text
// block is reactive; the C2 in-place-edit task re-plumbs edit entry through
// Text.BeginEdit(). Fill/Stroke default to the transparent-fill + slate outline
// matching the TextShape visual.
export class TextNodeVM extends NodeViewModel
{
    public static readonly TextKey   = Model.RegisterProperty<ShapeText>(
        TextNodeVM, 'Text', undefined as unknown as ShapeText, MetaData.None);
    public static readonly FillKey   = Model.RegisterProperty<Brush | undefined>(
        TextNodeVM, 'Fill', TEXT_NODE_FILL, MetaData.None);
    public static readonly StrokeKey = Model.RegisterProperty<Pen | undefined>(
        TextNodeVM, 'Stroke', undefined, MetaData.None);

    constructor()
    {
        super();
        // Build the ShapeText with GrowShape auto-fit and install it.
        const text = new ShapeText();
        text.AutoFit = TextAutoFit.GrowShape;
        this.set_property_value(TextNodeVM.TextKey, text);
        // Per-instance Pen (mirrors TextShape's idiom so a PenEditor mutating
        // in place doesn't affect the shared const).
        this.set_property_value(TextNodeVM.StrokeKey, new Pen(TEXT_NODE_STROKE.Brush, TEXT_NODE_STROKE.Thickness));
        // Override NodeViewModel defaults (ShapeDefaultSize) to text-box dims.
        this.Width  = TEXT_NODE_DEFAULT_W;
        this.Height = TEXT_NODE_DEFAULT_H;
        // Wire field re-resolution: when Text.Document changes, or when our
        // own geometry changes, re-resolve any {field} tokens in the document.
        text.AddPropertyChangedListener(ShapeText.DocumentKey, this._onLabelChanged);
        text.AddPropertyChangedListener(ShapeText.ContentKey,  this._onLabelChanged);
        this._refreshLabelFields();
        this._applyAutoFit();
    }

    private readonly _onLabelChanged = (): void => { this._refreshLabelFields(); this._applyAutoFit(); };

    // TextAutoFit.GrowShape: grow this node so the label's natural size fits
    // (plus a margin). Grow-only — never shrinks. Mirrors Figure._applyAutoFit
    // against the VM's own ShapeText (a standalone ShapeText measures headlessly).
    private _applyAutoFit(): void
    {
        const label = this.Text;
        if (label === undefined || label.AutoFit !== TextAutoFit.GrowShape) return;
        label.Measure(new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY));
        const d = label.DesiredSize;
        const margin = DiagramSettings.ShapeLabelMargin();
        const needW = d.Width  + margin * 2;
        const needH = d.Height + margin * 2;
        if (needW > this.Width)  this.Width  = needW;
        if (needH > this.Height) this.Height = needH;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (FIELD_SOURCE_NAMES.has(descriptor.Name)) this._refreshLabelFields();
    }

    private _refreshLabelFields(): void
    {
        const doc = this.Text?.Document;
        if (doc !== undefined) resolveFields(doc, (k) => this._resolveField(k));
    }

    private _resolveField(key: FieldKind): string | undefined
    {
        switch (key)
        {
            case FieldKind.Width:  return String(Math.round(this.Width));
            case FieldKind.Height: return String(Math.round(this.Height));
            case FieldKind.Left:   return String(Math.round(this.Left));
            case FieldKind.Top:    return String(Math.round(this.Top));
            case FieldKind.Id:     return this.Id ?? '';
            default:               return undefined;
        }
    }

    public get Text():   ShapeText      { return this.get_property_value(TextNodeVM.TextKey); }
    public get Fill():   Brush | undefined { return this.get_property_value(TextNodeVM.FillKey); }
    public set Fill(v:   Brush | undefined) { this.set_property_value(TextNodeVM.FillKey, v); }
    public get Stroke(): Pen | undefined { return this.get_property_value(TextNodeVM.StrokeKey); }
    public set Stroke(v: Pen | undefined) { this.set_property_value(TextNodeVM.StrokeKey, v); }

    // Convenience proxy — the LabelText of the text box. Reads/writes
    // Text.Content directly so serializers and tests have a flat accessor.
    public get LabelText(): string       { return this.Text.Content; }
    public set LabelText(v: string)      { this.Text.Content = v; }

    // IInlineEditable contract: drives BeginEdit on the VM's own ShapeText so
    // the container Figure can delegate to us instead of its own (empty) Text.
    public BeginEdit(): void { this.Text.BeginEdit(); }
}
