import {
    DataObject,
    DragDropEffects,
    MetaData,
    Model,
    Color,
} from '../../runtime/index.js';
import { Brush, SolidColorBrush } from '../../visual-engine/index.js';
import { Figure } from './figure.js';
import { TOOLBOX_NODE_KIND_FORMAT } from './behaviors/canvas-drop-behavior.js';

// Default preview tile size — matches the historical 48 dp the demo
// used. Fits two columns into a ~140 dp toolbox rail with margin.
export const TOOLBOX_PREVIEW_SIZE = 48;

// Default preview fill — a fuller @Primary-equivalent so the 48×48
// picture stays legible against @SurfaceContainer/@Surface chrome.
const PREVIEW_FILL = new SolidColorBrush(Color.FromHex('#1976d2'));

// One toolbox tile. Carries a `Kind` (the catalog key), a human-readable
// `Label`, a `PreviewNode` Figure (sized for the tile picture), and a
// `BeginKindDragData` callback the tile template wires to the drag-
// initiation behavior. The framework Diagram + canvas-drop-behavior
// consume the `mural/node-kind` format the callback emits — drop the
// tile onto the canvas and ItemDropped fires with `Data.Get('mural/node-kind')`
// set to this tile's Kind.
//
// `PreviewNode` is a fresh Figure constructed via Figure.fromKind so the
// tile renders the same shape primitive the canvas does, at preview size.
// Label is rendered separately by the tile's template (typically a
// TextBlock below the picture).
export class ToolboxShape extends Model
{
    public static readonly KindKey  = Model.RegisterProperty<string>(
        ToolboxShape, 'Kind',  '', MetaData.None);
    public static readonly LabelKey = Model.RegisterProperty<string>(
        ToolboxShape, 'Label', '', MetaData.None);
    public static readonly PreviewNodeKey = Model.RegisterProperty<Figure | undefined>(
        ToolboxShape, 'PreviewNode', undefined, MetaData.None);
    /**
     * Drag-initiation callback. Returns the DragDrop payload the tile
     * should attach when the user grabs it. The DataObject carries the
     * catalog Kind under `mural/node-kind`; canvas-drop-behavior gates
     * DragOver / Drop on the presence of this key.
     */
    public static readonly BeginKindDragDataKey = Model.RegisterProperty<(() => { data: DataObject; effects: DragDropEffects }) | undefined>(
        ToolboxShape, 'BeginKindDragData', undefined, MetaData.None);

    constructor(kind: string, label: string, options?: { previewSize?: number; previewFill?: Brush })
    {
        super();
        const previewSize = options?.previewSize ?? TOOLBOX_PREVIEW_SIZE;
        const preview = Figure.fromKind(kind, 0, 0, {
            width:  previewSize,
            height: previewSize,
        });
        preview.Fill = options?.previewFill ?? PREVIEW_FILL;
        this.set_property_value(ToolboxShape.KindKey,        kind);
        this.set_property_value(ToolboxShape.LabelKey,       label);
        this.set_property_value(ToolboxShape.PreviewNodeKey, preview);
        this.set_property_value(ToolboxShape.BeginKindDragDataKey, () => ({
            data:    new DataObject().Set(TOOLBOX_NODE_KIND_FORMAT, this.Kind),
            effects: DragDropEffects.Copy,
        }));
    }

    public get Kind():        string  { return this.get_property_value(ToolboxShape.KindKey); }
    public set Kind(v: string)        { this.set_property_value(ToolboxShape.KindKey, v); }
    public get Label():       string  { return this.get_property_value(ToolboxShape.LabelKey); }
    public set Label(v: string)       { this.set_property_value(ToolboxShape.LabelKey, v); }
    public get PreviewNode(): Figure | undefined { return this.get_property_value(ToolboxShape.PreviewNodeKey); }
    public set PreviewNode(v: Figure | undefined) { this.set_property_value(ToolboxShape.PreviewNodeKey, v); }
    public get BeginKindDragData(): (() => { data: DataObject; effects: DragDropEffects }) | undefined {
        return this.get_property_value(ToolboxShape.BeginKindDragDataKey);
    }
    public set BeginKindDragData(v: (() => { data: DataObject; effects: DragDropEffects }) | undefined) {
        this.set_property_value(ToolboxShape.BeginKindDragDataKey, v);
    }
}
