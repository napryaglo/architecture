import {
    MetaData,
    Model,
    ServiceBase,
    ServiceKey,
} from '../../../runtime/index.js';

// Backs the shell's Inspector region. Carries the object currently being
// inspected (typically the editor's selection). The inspector content
// binds to Target; a selection-changed command / behavior writes it.
// `undefined` means nothing is selected — the inspector shows its empty
// state (a DataTrigger on `$Target == null`, say).
export class InspectorService extends ServiceBase
{
    public static readonly Key = new ServiceKey<InspectorService>('InspectorService');

    public static readonly TargetKey = Model.RegisterProperty<unknown>(
        InspectorService, 'Target', undefined, MetaData.None);

    public get Target(): unknown { return this.get_property_value(InspectorService.TargetKey); }
    public set Target(v: unknown) { this.set_property_value(InspectorService.TargetKey, v); }
}
