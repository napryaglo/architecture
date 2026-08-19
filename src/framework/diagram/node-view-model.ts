import type { Group } from './group.js';
import { MetaData, Model } from '../../runtime/index.js';
import { DiagramSettings } from './diagram-settings.js';

// Position/size contract every diagram node view-model satisfies. The Figure
// container two-way binds its Left/Top/Width/Height to these; the per-VM
// serializers (later stage) read them. Content node kinds (TextNodeVM,
// CalloutNodeVM, ArchNodeVM) extend this; geometric shape nodes are
// self-painting Figures, not VMs.
export class NodeViewModel extends Model
{
    public static readonly IdKey     = Model.RegisterProperty<string | undefined>(NodeViewModel, 'Id',     undefined, MetaData.None);
    public static readonly LeftKey   = Model.RegisterProperty<number>(NodeViewModel, 'Left',   0, MetaData.None);
    public static readonly TopKey    = Model.RegisterProperty<number>(NodeViewModel, 'Top',    0, MetaData.None);
    public static readonly WidthKey  = Model.RegisterProperty<number>(NodeViewModel, 'Width',  DiagramSettings.ShapeDefaultSize(), MetaData.None);
    public static readonly HeightKey = Model.RegisterProperty<number>(NodeViewModel, 'Height', DiagramSettings.ShapeDefaultSize(), MetaData.None);
    // A content-driven node (icon+label tile) has no geometry to scale — its
    // size should follow its rendered content, not a fixed box. The container
    // measures the content and writes Width/Height back through the two-way
    // bind. Geometric shapes leave this false and stay fixed-size + resizable.
    public static readonly SizeToContentKey = Model.RegisterProperty<boolean>(NodeViewModel, 'SizeToContent', false, MetaData.None);
    // Set once the user resizes the node by hand: content auto-fit then stops so
    // the explicit size sticks (see the container's content-fit).
    public static readonly UserSizedKey     = Model.RegisterProperty<boolean>(NodeViewModel, 'UserSized',     false, MetaData.None);

    public get Id():     string | undefined { return this.get_property_value(NodeViewModel.IdKey); }
    public set Id(v:     string | undefined) { this.set_property_value(NodeViewModel.IdKey, v); }
    public get Left():   number { return this.get_property_value(NodeViewModel.LeftKey); }
    public set Left(v:   number) { this.set_property_value(NodeViewModel.LeftKey, v); }
    public get Top():    number { return this.get_property_value(NodeViewModel.TopKey); }
    public set Top(v:    number) { this.set_property_value(NodeViewModel.TopKey, v); }
    public get Width():  number { return this.get_property_value(NodeViewModel.WidthKey); }
    public set Width(v:  number) { this.set_property_value(NodeViewModel.WidthKey, v); }
    public get Height(): number { return this.get_property_value(NodeViewModel.HeightKey); }
    public set Height(v: number) { this.set_property_value(NodeViewModel.HeightKey, v); }
    public get SizeToContent(): boolean { return this.get_property_value(NodeViewModel.SizeToContentKey); }
    public set SizeToContent(v: boolean) { this.set_property_value(NodeViewModel.SizeToContentKey, v); }
    public get UserSized():     boolean { return this.get_property_value(NodeViewModel.UserSizedKey); }
    public set UserSized(v:     boolean) { this.set_property_value(NodeViewModel.UserSizedKey, v); }

    /** Enclosing group, or undefined when top-level. View-invisible
     *  structural metadata, so a plain field (mirrors Figure.Parent). */
    public Parent: Group | undefined = undefined;
}
