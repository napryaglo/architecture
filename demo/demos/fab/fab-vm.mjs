// FabVM — backs the FAB demo. One click counter per Size variant + per
// Extended slot so the dynamic-binding chain is visible end-to-end. No
// IsChecked story because FAB is monomorphic on container colour and
// doesn't ship a toggle variant.
import { MuralBase, MetaData, RelayCommand } from '@pragmatic-tech-ai/mural/runtime';
export class FabVM extends MuralBase {
    static SmallClicksKey = MuralBase.RegisterProperty(FabVM, 'SmallClicks', 0, MetaData.None);
    static DefaultClicksKey = MuralBase.RegisterProperty(FabVM, 'DefaultClicks', 0, MetaData.None);
    static LargeClicksKey = MuralBase.RegisterProperty(FabVM, 'LargeClicks', 0, MetaData.None);
    static ExtendedClicksKey = MuralBase.RegisterProperty(FabVM, 'ExtendedClicks', 0, MetaData.None);
    static ComposeClicksKey = MuralBase.RegisterProperty(FabVM, 'ComposeClicks', 0, MetaData.None);
    static ClickSmallCommandKey = MuralBase.RegisterProperty(FabVM, 'ClickSmallCommand', null, MetaData.None);
    static ClickDefaultCommandKey = MuralBase.RegisterProperty(FabVM, 'ClickDefaultCommand', null, MetaData.None);
    static ClickLargeCommandKey = MuralBase.RegisterProperty(FabVM, 'ClickLargeCommand', null, MetaData.None);
    static ClickExtendedCommandKey = MuralBase.RegisterProperty(FabVM, 'ClickExtendedCommand', null, MetaData.None);
    static ClickComposeCommandKey = MuralBase.RegisterProperty(FabVM, 'ClickComposeCommand', null, MetaData.None);
    get SmallClicks() { return this.get_property_value(FabVM.SmallClicksKey); }
    set SmallClicks(v) { this.set_property_value(FabVM.SmallClicksKey, v); }
    get DefaultClicks() { return this.get_property_value(FabVM.DefaultClicksKey); }
    set DefaultClicks(v) { this.set_property_value(FabVM.DefaultClicksKey, v); }
    get LargeClicks() { return this.get_property_value(FabVM.LargeClicksKey); }
    set LargeClicks(v) { this.set_property_value(FabVM.LargeClicksKey, v); }
    get ExtendedClicks() { return this.get_property_value(FabVM.ExtendedClicksKey); }
    set ExtendedClicks(v) { this.set_property_value(FabVM.ExtendedClicksKey, v); }
    get ComposeClicks() { return this.get_property_value(FabVM.ComposeClicksKey); }
    set ComposeClicks(v) { this.set_property_value(FabVM.ComposeClicksKey, v); }
    get ClickSmallCommand() { return this.get_property_value(FabVM.ClickSmallCommandKey); }
    get ClickDefaultCommand() { return this.get_property_value(FabVM.ClickDefaultCommandKey); }
    get ClickLargeCommand() { return this.get_property_value(FabVM.ClickLargeCommandKey); }
    get ClickExtendedCommand() { return this.get_property_value(FabVM.ClickExtendedCommandKey); }
    get ClickComposeCommand() { return this.get_property_value(FabVM.ClickComposeCommandKey); }
    constructor() {
        super();
        this.set_property_value(FabVM.ClickSmallCommandKey, new RelayCommand(() => { this.SmallClicks += 1; }));
        this.set_property_value(FabVM.ClickDefaultCommandKey, new RelayCommand(() => { this.DefaultClicks += 1; }));
        this.set_property_value(FabVM.ClickLargeCommandKey, new RelayCommand(() => { this.LargeClicks += 1; }));
        this.set_property_value(FabVM.ClickExtendedCommandKey, new RelayCommand(() => { this.ExtendedClicks += 1; }));
        this.set_property_value(FabVM.ClickComposeCommandKey, new RelayCommand(() => { this.ComposeClicks += 1; }));
    }
}
