import { Model, Element } from '../../runtime/index.js';
import { type Brush, Color, Pen, SolidColorBrush } from '../../visual-engine/index.js';
import { Figure } from './figure.js';
import { TextAutoFit } from './shape-text.js';

// Match the legacy TextNodeVM visual: transparent fill + slate outline.
const TEXT_NODE_FILL: Brush = new SolidColorBrush(Color.FromHex('#00000000'));
const TEXT_NODE_STROKE = new Pen(new SolidColorBrush(Color.FromHex('#94a3b8')), 1);
const TEXT_NODE_DEFAULT_W = 120;
const TEXT_NODE_DEFAULT_H = 44;

// A text-box node: a *shapeless* Figure (no silhouette `_source`) whose
// ShapeText grows the box to fit. The box + label are drawn by
// Style[TargetType=TextNode] (a bordered PART_LabelHost); geometry, GrowShape
// auto-fit, {field} resolution and in-place edit are all Figure-native. Being
// shapeless keeps `_getSource()` undefined, so the 'shape' serializer (which
// requires a source) leaves it to the 'text' serializer.
export class TextNode extends Figure
{
    static { Model.OverrideMetadata(TextNode, Element.DefaultStyleKeyKey, { default_value: TextNode }); }

    constructor()
    {
        // Figure's ctor installs this.Text, resolves the (TextNode) default
        // style, and slots the label into PART_LabelHost — so no applyDefaultStyle
        // call here. Fill/Stroke are template-bound ($$Fill/$$Stroke), so setting
        // them after style resolution updates the box reactively.
        super();
        this.Text.AutoFit = TextAutoFit.GrowShape;
        this.Fill   = TEXT_NODE_FILL;
        this.Stroke = new Pen(TEXT_NODE_STROKE.Brush, TEXT_NODE_STROKE.Thickness);
        this.Width  = TEXT_NODE_DEFAULT_W;
        this.Height = TEXT_NODE_DEFAULT_H;
    }
}
