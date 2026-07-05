import {
    MetaData,
    Model,
    ServiceBase,
    ServiceKey,
} from '../../../runtime/index.js';

// Backs a shell's main Content region (PART_ContentHost). A thin presenter
// service: whatever object is handed to View() becomes the region's content,
// rendered through a DataTemplate matched to the object's runtime type — the
// same implicit-by-type dispatch ContentControl uses for non-Visual content.
// The region binds `Content = $service(ContentHostService).Content`, so
// anything in the app can resolve this service and call View(x) to swap what
// the shell shows without reaching the content control.
//
// The base presents ONE object at a time. DocumentsContentHostService layers
// an open-document workspace (Open / Close / Save) on top and drives View()
// from its ActiveDocument — register that subclass against this same Key to
// turn the region into a tabbed-document host.
export class ContentHostService extends ServiceBase
{
    public static readonly Key = new ServiceKey<ContentHostService>('ContentHostService');

    // The object currently presented. Read-only to the view (a region binds
    // `$Content`); mutated only through View(). `unknown` because the content
    // is arbitrary — a Visual slotted directly, or a Model rendered via its
    // DataTemplate.
    public static readonly ContentKey = Model.RegisterProperty<unknown>(
        ContentHostService, 'Content', undefined, MetaData.None);

    public get Content(): unknown { return this.get_property_value(ContentHostService.ContentKey); }

    // Present `content` in the host region, replacing whatever was shown.
    // Pass undefined to clear the region to its empty state.
    public View(content: unknown): void
    {
        this.set_property_value(ContentHostService.ContentKey, content);
    }
}
