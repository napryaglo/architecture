// TopAppBarVM — backs the top-app-bar demo. One Variant DP that toggles
// among the four M3 variants + a click counter for the nav icon and
// each action button so the dynamic-binding chain is visible.
import { Model, MetaData, RelayCommand } from '@visualisation-sub/mural/runtime';
import { TopAppBarVariant }              from '@visualisation-sub/mural/framework';

export class TopAppBarVM extends Model
{
    static NavClicksKey      = Model.RegisterProperty(TopAppBarVM, 'NavClicks',      0, MetaData.None);
    static SearchClicksKey   = Model.RegisterProperty(TopAppBarVM, 'SearchClicks',   0, MetaData.None);
    static MoreClicksKey     = Model.RegisterProperty(TopAppBarVM, 'MoreClicks',     0, MetaData.None);

    static NavCommandKey     = Model.RegisterProperty(TopAppBarVM, 'NavCommand',     null, MetaData.None);
    static SearchCommandKey  = Model.RegisterProperty(TopAppBarVM, 'SearchCommand',  null, MetaData.None);
    static MoreCommandKey    = Model.RegisterProperty(TopAppBarVM, 'MoreCommand',    null, MetaData.None);

    // Exposed so each preview row can pull a label corresponding to its
    // own Variant. Strings instead of an enum so the demo template
    // doesn't need to import TopAppBarVariant.
    static SmallVariantKey         = Model.RegisterProperty(TopAppBarVM, 'SmallVariant',         TopAppBarVariant.Small,         MetaData.None);
    static CenterAlignedVariantKey = Model.RegisterProperty(TopAppBarVM, 'CenterAlignedVariant', TopAppBarVariant.CenterAligned, MetaData.None);
    static MediumVariantKey        = Model.RegisterProperty(TopAppBarVM, 'MediumVariant',        TopAppBarVariant.Medium,        MetaData.None);
    static LargeVariantKey         = Model.RegisterProperty(TopAppBarVM, 'LargeVariant',         TopAppBarVariant.Large,         MetaData.None);

    get NavClicks()      { return this.get_property_value(TopAppBarVM.NavClicksKey); }
    set NavClicks(v)     { this.set_property_value(TopAppBarVM.NavClicksKey, v); }
    get SearchClicks()   { return this.get_property_value(TopAppBarVM.SearchClicksKey); }
    set SearchClicks(v)  { this.set_property_value(TopAppBarVM.SearchClicksKey, v); }
    get MoreClicks()     { return this.get_property_value(TopAppBarVM.MoreClicksKey); }
    set MoreClicks(v)    { this.set_property_value(TopAppBarVM.MoreClicksKey, v); }

    get NavCommand()     { return this.get_property_value(TopAppBarVM.NavCommandKey); }
    get SearchCommand()  { return this.get_property_value(TopAppBarVM.SearchCommandKey); }
    get MoreCommand()    { return this.get_property_value(TopAppBarVM.MoreCommandKey); }

    get SmallVariant()         { return this.get_property_value(TopAppBarVM.SmallVariantKey); }
    get CenterAlignedVariant() { return this.get_property_value(TopAppBarVM.CenterAlignedVariantKey); }
    get MediumVariant()        { return this.get_property_value(TopAppBarVM.MediumVariantKey); }
    get LargeVariant()         { return this.get_property_value(TopAppBarVM.LargeVariantKey); }

    constructor() {
        super();
        this.set_property_value(TopAppBarVM.NavCommandKey,    new RelayCommand(() => { this.NavClicks    += 1; }));
        this.set_property_value(TopAppBarVM.SearchCommandKey, new RelayCommand(() => { this.SearchClicks += 1; }));
        this.set_property_value(TopAppBarVM.MoreCommandKey,   new RelayCommand(() => { this.MoreClicks   += 1; }));
    }
}
