import {
    MetaData,
    Model,
    ServiceBase,
    ServiceKey,
} from '../../../runtime/index.js';

// Backs the shell's Status region. A message line plus a busy flag the
// status bar binds to. Long-running work flips IsBusy (gating a spinner
// via a trigger) and sets Text; anything in the app can resolve this
// service to post a status message without reaching the status bar
// control.
export class StatusService extends ServiceBase
{
    public static readonly Key = new ServiceKey<StatusService>('StatusService');

    public static readonly TextKey = Model.RegisterProperty<string>(
        StatusService, 'Text', '', MetaData.None);
    public static readonly IsBusyKey = Model.RegisterProperty<boolean>(
        StatusService, 'IsBusy', false, MetaData.None);

    public get Text(): string { return this.get_property_value(StatusService.TextKey); }
    public set Text(v: string) { this.set_property_value(StatusService.TextKey, v); }

    public get IsBusy(): boolean { return this.get_property_value(StatusService.IsBusyKey); }
    public set IsBusy(v: boolean) { this.set_property_value(StatusService.IsBusyKey, v); }
}
