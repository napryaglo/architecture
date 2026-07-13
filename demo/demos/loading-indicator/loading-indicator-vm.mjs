// LoadingIndicatorVM — backs the loading-indicator demo. Drives the
// shared IsActive flag both indicators bind to, plus a Toggle command
// (with a label that flips Pause ↔ Resume) so the viewer can watch the
// M3 spinner start and stop on the shared animation clock.
import { Model, MetaData, RelayCommand } from 'mural/runtime';
export class LoadingIndicatorVM extends Model {
    static IsActiveKey = Model.RegisterProperty(LoadingIndicatorVM, 'IsActive', true, MetaData.None);
    static ToggleLabelKey = Model.RegisterProperty(LoadingIndicatorVM, 'ToggleLabel', 'Pause', MetaData.None);
    static ToggleKey = Model.RegisterProperty(LoadingIndicatorVM, 'Toggle', null, MetaData.None);
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
