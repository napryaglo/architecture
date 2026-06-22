import {
    MetaData,
    Model,
} from '../../runtime/index.js';
import { DataTemplate } from '../../basic/templates/data-template.js';
import { ContentControl } from './content-control.js';

// Header-bearing ContentControl. WPF parity — `HeaderedContentControl`
// is the base for Expander, GroupBox, TabItem (in WPF), and similar
// chrome that pairs a Content payload with a Header label or visual.
//
// Two DPs added on top of ContentControl:
//
//   * Header         — the header data. Typed as `unknown` so it can
//                      carry a string, a Visual, or any data row a
//                      consumer wants to display. The subclass's
//                      template decides how to render: bind a TextBlock
//                      to it for the string case, slot it directly for
//                      the Visual case, or pair with HeaderTemplate for
//                      data-row rendering.
//   * HeaderTemplate — DataTemplate used to render the Header when it's
//                      a Model row (not a Visual or a plain string).
//                      The subclass's template can route through a
//                      ContentPresenter (Content = $$Header,
//                      ContentTemplate = $$HeaderTemplate) to dispatch
//                      automatically — same pattern Content uses for
//                      ContentControl.
//
// Neither DP triggers any auto-rendering logic in this base class —
// subclasses own their visual layout via their ControlTemplate. The
// base just exposes the slots so consumers can author markup like
// `TabItem [Header="Files"]` against a single recognised contract.
export class HeaderedContentControl extends ContentControl
{
    public static readonly HeaderKey         = Model.RegisterProperty<unknown>(
        HeaderedContentControl, 'Header', undefined, MetaData.Measure | MetaData.Render);
    public static readonly HeaderTemplateKey = Model.RegisterProperty<DataTemplate | undefined>(
        HeaderedContentControl, 'HeaderTemplate', undefined, MetaData.Measure);

    public get Header(): unknown { return this.get_property_value(HeaderedContentControl.HeaderKey); }
    public set Header(v: unknown) { this.set_property_value(HeaderedContentControl.HeaderKey, v); }

    public get HeaderTemplate(): DataTemplate | undefined { return this.get_property_value(HeaderedContentControl.HeaderTemplateKey); }
    public set HeaderTemplate(v: DataTemplate | undefined) { this.set_property_value(HeaderedContentControl.HeaderTemplateKey, v); }
}
