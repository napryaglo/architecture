// LoadingIndicatorVM — backs the loading-indicator demo. Drives the
// shared IsActive flag both indicators bind to, plus a Toggle command
// (with a label that flips Pause ↔ Resume) so the viewer can watch the
// M3 spinner start and stop on the shared animation clock.
import { MuralBase, MetaData, RelayCommand } from '@pragmatic-lab/mural/runtime';
export class LoadingIndicatorVM extends MuralBase {
    static IsActiveKey = MuralBase.RegisterProperty(LoadingIndicatorVM, 'IsActive', true, MetaData.None);
    static ToggleLabelKey = MuralBase.RegisterProperty(LoadingIndicatorVM, 'ToggleLabel', 'Pause', MetaData.None);
    static ToggleKey = MuralBase.RegisterProperty(LoadingIndicatorVM, 'Toggle', null, MetaData.None);
    get IsActive() { return this.get_property_value(LoadingIndicatorVM.IsActiveKey); }
    set IsActive(v) { this.set_property_value(LoadingIndicatorVM.IsActiveKey, v); }
    get ToggleLabel() { return this.get_property_value(LoadingIndicatorVM.ToggleLabelKey); }
    set ToggleLabel(v) { this.set_property_value(LoadingIndicatorVM.ToggleLabelKey, v); }
    get Toggle() { return this.get_property_value(LoadingIndicatorVM.ToggleKey); }
    constructor() {
        super();
        this.set_property_value(LoadingIndicatorVM.ToggleKey, new RelayCommand(() => {
            this.IsActive = !this.IsActive;
            this.ToggleLabel = this.IsActive ? 'Pause' : 'Resume';
        }));
    }
}
