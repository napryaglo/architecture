import {
    MetaData,
    Model,
    type PointerEventArgs,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { Canvas } from './canvas.js';
import { ContentControl } from './content-control.js';
import { ContentPresenter } from './content-presenter.js';
import { ControlTemplate } from './control-template.js';

// A movable, content-hosting control intended as the container shape
// inside the diagrammer's ItemsControl (see Diagram). DiagramNode owns
// two things internally so the demo bootstrap doesn't need a behavior:
//
//   * Position — X / Y DPs flagged BindsTwoWayByDefault so a `$X` /
//     `$Y` binding in the container Style threads through to the data
//     context (the node VM). Changes to X / Y mirror onto this control's
//     own Canvas.Left / Canvas.Top, so a parent Canvas places it.
//
//   * Drag-to-move — OnPointerDown captures the pointer and stores the
//     press offset; OnPointerMove writes back to X / Y; OnPointerUp
//     releases capture. Capture means the drag survives the cursor
//     leaving the node's hit area, so no per-canvas listener wiring is
//     needed.
//
// Default Template: a single ContentPresenter. ContentControl's content
// resolution does the rest — when DiagramNode.Content is set to a Model
// (the per-item NodeVM data), ContentControl looks up the matching
// [DataType=…] DataTemplate via Application resources and slots the
// produced Visual into the presenter. Consumers who want chrome around
// the content (selection rings, drop shadows, …) can replace Template.
export class DiagramNode extends ContentControl
{
    public static readonly XKey = Model.RegisterProperty<number>(
        DiagramNode, 'X', 0, MetaData.Arrange | MetaData.BindsTwoWayByDefault);
    public static readonly YKey = Model.RegisterProperty<number>(
        DiagramNode, 'Y', 0, MetaData.Arrange | MetaData.BindsTwoWayByDefault);

    private _dragging:    boolean = false;
    private _grabOffsetX: number  = 0;
    private _grabOffsetY: number  = 0;

    constructor()
    {
        super();
        // Minimal default template — a single ContentPresenter. The
        // ContentControl base routes Content into this presenter; the
        // ContentPresenter's implicit DataTemplate fallback resolves
        // shape chrome by `Content.constructor` identity.
        this.Template = new ControlTemplate(() => new ContentPresenter());
        // Seed Canvas.Left / Canvas.Top from the registered defaults so
        // a freshly-constructed DiagramNode placed into a Canvas without
        // any binding lands at (0,0) instead of inheriting whatever the
        // attached-property defaults happen to be on the parent path.
        Canvas.SetLeft(this, 0);
        Canvas.SetTop (this, 0);
    }

    public get X(): number       { return this.get_property_value(DiagramNode.XKey); }
    public set X(value: number)  { this.set_property_value(DiagramNode.XKey, value); }
    public get Y(): number       { return this.get_property_value(DiagramNode.YKey); }
    public set Y(value: number)  { this.set_property_value(DiagramNode.YKey, value); }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        // Mirror X / Y onto Canvas.Left / Canvas.Top so the enclosing
        // Canvas re-positions us on its next Arrange pass. MetaData.Arrange
        // on the DP triggers an InvalidateArrange on this Visual; the
        // Canvas's own Arrange re-reads the attached properties and
        // re-places its children, so position changes propagate without
        // any per-child Canvas subscription.
        if (descriptor.Name === 'X' && typeof newValue === 'number')
        {
            Canvas.SetLeft(this, newValue);
        }
        else if (descriptor.Name === 'Y' && typeof newValue === 'number')
        {
            Canvas.SetTop(this, newValue);
        }
    }

    protected override OnPointerDown(args: PointerEventArgs): void
    {
        if (args.Handled) return;
        // Press offset = where inside the node the cursor landed. Stored
        // in host (canvas) coordinates against the node's current X / Y
        // — moving the node is then "wherever the cursor goes, subtract
        // the grab offset to place the top-left."
        this._dragging    = true;
        this._grabOffsetX = args.HostX - this.X;
        this._grabOffsetY = args.HostY - this.Y;
        args.CapturePointer(this);
        args.Handled = true;
    }

    protected override OnPointerMove(args: PointerEventArgs): void
    {
        if (!this._dragging) return;
        this.X = args.HostX - this._grabOffsetX;
        this.Y = args.HostY - this._grabOffsetY;
        args.Handled = true;
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        if (!this._dragging) return;
        this._dragging = false;
        args.ReleasePointerCapture();
        args.Handled = true;
    }
}
