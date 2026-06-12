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

    get NavClicks()      { return this._get_property_value_by_name('NavClicks'); }
    set NavClicks(v)     { this._set_property_value_by_name('NavClicks', v); }
    get SearchClicks()   { return this._get_property_value_by_name('SearchClicks'); }
    set SearchClicks(v)  { this._set_property_value_by_name('SearchClicks', v); }
    get MoreClicks()     { return this._get_property_value_by_name('MoreClicks'); }
    set MoreClicks(v)    { this._set_property_value_by_name('MoreClicks', v); }

    get NavCommand()     { return this._get_property_value_by_name('NavCommand'); }
    get SearchCommand()  { return this._get_property_value_by_name('SearchCommand'); }
    get MoreCommand()    { return this._get_property_value_by_name('MoreCommand'); }

    get SmallVariant()         { return this._get_property_value_by_name('SmallVariant'); }
    get CenterAlignedVariant() { return this._get_property_value_by_name('CenterAlignedVariant'); }
    get MediumVariant()        { return this._get_property_value_by_name('MediumVariant'); }
    get LargeVariant()         { return this._get_property_value_by_name('LargeVariant'); }

    constructor() {
        super();
        this._set_property_value_by_name('NavCommand',    new RelayCommand(() => { this.NavClicks    += 1; }));
        this._set_property_value_by_name('SearchCommand', new RelayCommand(() => { this.SearchClicks += 1; }));
        this._set_property_value_by_name('MoreCommand',   new RelayCommand(() => { this.MoreClicks   += 1; }));
    }
}
