import { MetaData, Model } from '../../runtime/index.js';
import { Brush, Color, Pen, SolidColorBrush } from '../../visual-engine/index.js';
import { NodeViewModel } from './node-view-model.js';
import { ShapeText, TextAutoFit } from './shape-text.js';

// Reuse the same visual constants TextShape uses so the VM renders identically.
const TEXT_NODE_FILL   = new SolidColorBrush(Color.FromHex('#00000000'));
const TEXT_NODE_STROKE = new Pen(new SolidColorBrush(Color.FromHex('#94a3b8')), 1);

const TEXT_NODE_DEFAULT_W = 120;
const TEXT_NODE_DEFAULT_H = 44;

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
