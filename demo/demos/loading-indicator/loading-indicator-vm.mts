// LoadingIndicatorVM — backs the loading-indicator demo. Drives the
// shared IsActive flag both indicators bind to, plus a Toggle command
// (with a label that flips Pause ↔ Resume) so the viewer can watch the
// M3 spinner start and stop on the shared animation clock.
import { MuralBase, MetaData, RelayCommand } from '@pragmatic-tech-ai/mural/runtime';

export class LoadingIndicatorVM extends MuralBase
{
    static IsActiveKey    = MuralBase.RegisterProperty<boolean>(LoadingIndicatorVM, 'IsActive', true, MetaData.None);
    static ToggleLabelKey = MuralBase.RegisterProperty<string>(LoadingIndicatorVM, 'ToggleLabel', 'Pause', MetaData.None);
    static ToggleKey      = MuralBase.RegisterProperty<RelayCommand | null>(LoadingIndicatorVM, 'Toggle', null, MetaData.None);

    get IsActive():    boolean { return this.get_property_value(LoadingIndicatorVM.IsActiveKey); }
    set IsActive(v:    boolean) { this.set_property_value(LoadingIndicatorVM.IsActiveKey, v); }

    get ToggleLabel(): string { return this.get_property_value(LoadingIndicatorVM.ToggleLabelKey); }
    set ToggleLabel(v: string) { this.set_property_value(LoadingIndicatorVM.ToggleLabelKey, v); }

    get Toggle():      RelayCommand | null { return this.get_property_value(LoadingIndicatorVM.ToggleKey); }

    constructor()
    {
        super();
        this.set_property_value(
            LoadingIndicatorVM.ToggleKey,
            new RelayCommand(() =>
            {
                this.IsActive    = !this.IsActive;
                this.ToggleLabel = this.IsActive ? 'Pause' : 'Resume';
            }),
        );
    }
}
