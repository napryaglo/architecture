import {
    type ICommand,
    type IServiceProvider,
    MetaData,
    Model,
    RelayCommand,
    ServiceBase,
    ServiceKey,
} from '../../../runtime/index.js';
import { ContentHostService } from '../services/content-host-service.js';
import { DocumentsContentHostService, type IDocument } from '../services/documents-content-host-service.js';
import type { Geometry } from '../../../visual-engine/index.js';

// ISettingsContribution — the app-supplied half of the settings feature.
//
// Under the "launcher → framework, page → app" split, the framework owns the
// gear + the launch mechanism but NOT the settings page (which is view code an
// app styles to taste). It also can't supply the rail icon — the framework
// ships no icons. So an app opts into settings by registering an
// ISettingsContribution under SettingsContributionKey, providing:
//   * Icon    — the rail glyph for the footer gear (from the app's icon dict).
//   * Tooltip — optional hover label.
//   * CreateView() — builds the settings document the launcher opens in the
//     content host (a page VM grouping ApplicationSettings.Settings, modeled as
//     an IDocument so it lives in the editor's document set like any other tab).
//
// EditorShell detects the contribution and wires a footer RailAction; this
// launcher's OpenCommand opens CreateView()'s result. No contribution ⇒ no
// gear (the demo platform, which registers none, stays gear-free).
export interface ISettingsContribution
{
    readonly Icon: Geometry | undefined;
    readonly Tooltip?: string;
    CreateView(): IDocument;
}

export const SettingsContributionKey = new ServiceKey<ISettingsContribution>('SettingsContribution');

// Backs the activity-bar settings gear: OpenCommand presents the app's settings
// view (from the registered ISettingsContribution) in the shell's content
// region — the same way a capability's service or a document is presented.
// Auto-registered by EditorShell when a contribution is present.
export class SettingsLauncherService extends ServiceBase
{
    public static readonly Key = new ServiceKey<SettingsLauncherService>('SettingsLauncherService');

    public static readonly OpenCommandKey = Model.RegisterProperty<ICommand>(
        SettingsLauncherService, 'OpenCommand', undefined as unknown as ICommand, MetaData.None);

    // Built once — the view's editors bind live to the same Setting DPs, so it
    // stays current across reopens without a rebuild, and re-opening dedupes to
    // the same document instance (DocumentsContentHostService keys on Id).
    private _view: IDocument | undefined;

    constructor(provider: IServiceProvider)
    {
        super(provider);
        this.set_property_value(SettingsLauncherService.OpenCommandKey, new RelayCommand(() => this.Open()));
    }

    public get OpenCommand(): ICommand { return this.get_property_value(SettingsLauncherService.OpenCommandKey); }

    // Open the settings document in the shell's content host. When the host is a
    // DocumentsContentHostService, Open() adds it to the open-document set (a
    // closeable tab) and activates it; on a plain ContentHostService it falls
    // back to a transient View(). Re-invoking re-activates the same document.
    public Open(): void
    {
        const host = this.Provider.get(ContentHostService.Key);
        const contribution = this.Provider.get(SettingsContributionKey);
        if (host === undefined || contribution === undefined) return;
        this._view ??= contribution.CreateView();
        if (host instanceof DocumentsContentHostService) host.Open(this._view);
        else                                             host.View(this._view);
    }
}
