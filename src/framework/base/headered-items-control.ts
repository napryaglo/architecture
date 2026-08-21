import {
    MetaData,
    MuralBase,
} from '../../runtime/index.js';
import { DataTemplate } from '../../basic/templates/data-template.js';
import { ItemsControl } from './items-control.js';

// Header-bearing ItemsControl. WPF parity — `HeaderedItemsControl` is
// the base for MenuItem, TreeViewItem, ToolBar (in WPF), and similar
// chrome that pairs a list of child items with a Header label or
// visual.
//
// Mirrors `HeaderedContentControl`'s surface but on the ItemsControl
// branch of the hierarchy. Same DP names, same `unknown` typing for
// Header, same DataTemplate-based render route for non-trivial values.
// Two parallel base classes are necessary because single inheritance
// doesn't let one class extend both ContentControl and ItemsControl.
export class HeaderedItemsControl extends ItemsControl
{
    public static readonly HeaderKey         = MuralBase.RegisterProperty<unknown>(
        HeaderedItemsControl, 'Header', undefined, MetaData.Measure | MetaData.Render);
    public static readonly HeaderTemplateKey = MuralBase.RegisterProperty<DataTemplate | undefined>(
        HeaderedItemsControl, 'HeaderTemplate', undefined, MetaData.Measure);

    public get Header(): unknown { return this.get_property_value(HeaderedItemsControl.HeaderKey); }
    public set Header(v: unknown) { this.set_property_value(HeaderedItemsControl.HeaderKey, v); }

    public get HeaderTemplate(): DataTemplate | undefined { return this.get_property_value(HeaderedItemsControl.HeaderTemplateKey); }
    public set HeaderTemplate(v: DataTemplate | undefined) { this.set_property_value(HeaderedItemsControl.HeaderTemplateKey, v); }
}
