import {
    ApplicationService,
    MetaData,
    Model,
    ObservableCollection,
    ServiceBase,
    ServiceKey,
    type IServiceProvider,
} from '../../../runtime/index.js';
import { ShellModule } from '../module.js';
import { SettingDefinition } from '../settings/setting-definition.js';
import { Setting } from '../settings/setting.js';

// Persistence seam for ApplicationSettings — the host supplies HOW values are
// stored. Kept host-agnostic: the framework never imports a host target, so a
// desktop app backs this with a file (Plexus → FileSystemService writing
// UserDataDirectory/settings.json), a web app with localStorage, a test with an
// in-memory map. Registered under `SettingsStoreKey`; ApplicationSettings
// resolves it OPTIONALLY (no store ⇒ in-memory, values reset each session).
//
// `Load` is SYNCHRONOUS so ApplicationSettings has real values at construction
// (a host reads its store once at startup and hands over a snapshot — the same
// sync-load / async-write split EnvironmentService uses). `Save` is fire-and-
// forget; the store may debounce and write asynchronously.
export interface ISettingsStore
{
    Load(): Record<string, unknown>;
    Save(values: Record<string, unknown>): void;
}

export const SettingsStoreKey = new ServiceKey<ISettingsStore>('SettingsStore');

// The app's settings provider: aggregates every module's declared
// SettingDefinitions into live, user-modifiable Settings, and (when a store is
// registered) persists changes.
//
// Definitions flow module → service exactly as Capabilities flow into
// NavigationService: resolve the ApplicationService, iterate its Modules, and
// up-cast each IShellModule to the concrete ShellModule to read its `Settings`
// (the SettingDefinition type is above the runtime IShellModule contract, so it
// is read through the documented up-cast seam, not the runtime interface).
//
// `Settings` is a DP-backed ObservableCollection so a settings pane binds
// `ItemsSource = $Settings`; `_byKey` gives O(1) Get/Set. Auto-registered by
// EditorShell (like NavigationService), so any shell app gets it for free.
export class ApplicationSettings extends ServiceBase
{
    public static readonly Key = new ServiceKey<ApplicationSettings>('ApplicationSettings');

    public static readonly SettingsKey = Model.RegisterProperty<ObservableCollection<Setting>>(
        ApplicationSettings, 'Settings',
        undefined as unknown as ObservableCollection<Setting>, MetaData.None);

    private readonly _byKey = new Map<string, Setting>();
    private readonly _store: ISettingsStore | undefined;
    private readonly _persisted: Record<string, unknown>;

    constructor(provider: IServiceProvider)
    {
        super(provider);
        // Optional persistence — resolved from the container so the service
        // resolves its own collaborator (DI convention). No store ⇒ in-memory.
        this._store = provider.get(SettingsStoreKey);
        this._persisted = this._store ? this._store.Load() : {};
        this.set_property_value(ApplicationSettings.SettingsKey, new ObservableCollection<Setting>());
        this.PopulateFromModules();
    }

    public get Settings(): ObservableCollection<Setting>
    {
        return this.get_property_value(ApplicationSettings.SettingsKey);
    }

    // Aggregate every module's declared settings into live Settings. One-shot:
    // modules are fully composed by the time a shell resolves this service (same
    // contract as NavigationService.PopulateFromModules). Idempotent — a
    // definition whose Key is already present is skipped, so a re-call after a
    // late module add only adds the new ones.
    public PopulateFromModules(): void
    {
        const app = this.Provider.getRequired(ApplicationService.Key);
        for (const module of app.Modules)
        {
            for (const definition of (module as ShellModule).Settings)
            {
                this.addSetting(definition);
            }
        }
    }

    // The current value of a setting, or undefined if no such key. Already
    // reflects the persisted overlay (initialised from the store at construction).
    public Get<T = unknown>(key: string): T | undefined
    {
        return this._byKey.get(key)?.Value as T | undefined;
    }

    // Modify a setting's value (the user-facing write). Triggers persistence via
    // the Value DP listener. No-op for an unknown key.
    public Set(key: string, value: unknown): void
    {
        const setting = this._byKey.get(key);
        if (setting !== undefined) setting.Value = value;
    }

    // Restore a setting to its definition's default (also persisted).
    public Reset(key: string): void
    {
        const setting = this._byKey.get(key);
        if (setting !== undefined) setting.Value = setting.Definition.Default;
    }

    // The live Setting for a key — for a consumer that wants to bind its Value DP
    // directly rather than poll Get.
    public GetSetting(key: string): Setting | undefined
    {
        return this._byKey.get(key);
    }

    // Build a live Setting from a definition, overlaying any persisted value onto
    // the default. Wires a Value listener so a later modification write-throughs.
    private addSetting(definition: SettingDefinition): void
    {
        if (this._byKey.has(definition.Key)) return;
        const initial = Object.prototype.hasOwnProperty.call(this._persisted, definition.Key)
            ? this._persisted[definition.Key]
            : definition.Default;
        const setting = new Setting(definition, initial);
        setting.AddPropertyChangedListener(Setting.ValueKey, () => this.persist());
        this._byKey.set(definition.Key, setting);
        this.Settings.Add(setting);
    }

    // Write the full current value set through the store (no-op without one).
    // The store owns any debouncing / async write.
    private persist(): void
    {
        if (this._store === undefined) return;
        const values: Record<string, unknown> = {};
        for (const [key, setting] of this._byKey) values[key] = setting.Value;
        this._store.Save(values);
    }
}
