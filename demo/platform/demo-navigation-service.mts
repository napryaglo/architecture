// The demo platform's navigation model, composed through the markup DI
// container rather than constructed by the host script.
//
//   * Registered in platform.mu via `.services: { DemoNavigationService }`.
//     The entry lowers to `register(tokenFor(DemoNavigationService),
//     p => new DemoNavigationService(p), 'singleton')` on the EditorShell's
//     own DI scope. Because this class extends the framework
//     NavigationService and inherits its static `Key`, `tokenFor` resolves
//     to NavigationService.Key — so it registers under the SAME token the
//     shell's Navigation region (and `$service(NavigationService)`) resolve.
//   * Consumed in platform.mu through `$service(NavigationService).…`
//     bindings: the region content reads the shell-scoped instance via the
//     inherited ServiceScope, so no host-script DataContext is needed.
//
// It owns everything the old PlatformVM did — the two-level navigation
// (rail groups + per-group demo list) AND the page-content derivation
// (Title / Subtitle / Content) — now as one DI-composed model that
// self-populates from the registry:
//
//   DemoNavigationService (extends NavigationService)
//     ├─ Groups: ObservableCollection<GroupVM>      (rail data)
//     ├─ SelectedGroupIndex  TwoWay ⇆ NavigationRail.SelectedIndex
//     ├─ SelectedGroup       derived from the index
//     ├─ Items (inherited)   the selected group's Demos (the list's source)
//     ├─ SelectedItem (inherited)  TwoWay ⇆ the demo list; the active demo
//     ├─ Title / Subtitle    derived from SelectedItem
//     └─ Content             the demo's root Visual (built lazily, cached)

import {
    MetaData,
    Model,
    ObservableCollection,
    type PropertyDescriptor,
    type Visual,
    type IServiceProvider,
} from '@visualisation-sub/mural/runtime';
import { NavigationService } from '@visualisation-sub/mural/framework/shell/services/navigation-service.js';
import { allDemos, instantiateDemo, onDemoRegistered, type DemoDefinition } from './registry.mjs';

// Insert `item` into `coll` at the position that keeps it sorted by `cmp`
// (stable: ties land after existing equal entries). Used to slot demos /
// groups into their alphabetical place whether they arrive in the initial
// snapshot or stream in from a late registration.
function insertSorted<T>(coll: ObservableCollection<T>, item: T, cmp: (a: T, b: T) => number): void {
    let i = 0;
    while (i < coll.Count && cmp(coll.Get(i)!, item) <= 0) i++;
    coll.Insert(i, item);
}

// Display-string convention shared with the list's item rendering: the
// `Label` field is preferred, so a single template renders demo rows
// uniformly.

export class DemoVM extends Model
{
    static readonly IdKey       = Model.RegisterProperty<string>(DemoVM, 'Id',       '', MetaData.None);
    static readonly LabelKey    = Model.RegisterProperty<string>(DemoVM, 'Label',    '', MetaData.None);
    static readonly TitleKey    = Model.RegisterProperty<string>(DemoVM, 'Title',    '', MetaData.None);
    static readonly SubtitleKey = Model.RegisterProperty<string>(DemoVM, 'Subtitle', '', MetaData.None);

    // The raw registry definition, carried for instantiateDemo lookup — the
    // Visual is built lazily from this on first activation.
    readonly Definition: DemoDefinition;

    constructor(def: DemoDefinition) {
        super();
        this.set_property_value(DemoVM.IdKey,       def.id);
        this.set_property_value(DemoVM.LabelKey,    def.title);
        this.set_property_value(DemoVM.TitleKey,    def.title);
        this.set_property_value(DemoVM.SubtitleKey, def.subtitle ?? '');
        this.Definition = def;
    }

    get Id():       string { return this.get_property_value(DemoVM.IdKey); }
    get Label():    string { return this.get_property_value(DemoVM.LabelKey); }
    get Title():    string { return this.get_property_value(DemoVM.TitleKey); }
    get Subtitle(): string { return this.get_property_value(DemoVM.SubtitleKey); }
}

export class GroupVM extends Model
{
    static readonly LabelKey     = Model.RegisterProperty<string>(GroupVM, 'Label', '', MetaData.None);
    // Glyph a future data-driven NavigationRail path could bind to (today
    // the rail's NavigationItems carry their icons declaratively in
    // platform.mu). The GROUP_ICONS map below keeps it populated.
    static readonly IconGlyphKey = Model.RegisterProperty<string>(GroupVM, 'IconGlyph', '•', MetaData.None);

    // Mutable collection so demos can be added incrementally as the registry
    // is read. ObservableCollection so the list pipeline picks up insertions
    // reactively.
    readonly Demos: ObservableCollection<DemoVM> = new ObservableCollection<DemoVM>();

    constructor(name: string, iconGlyph?: string) {
        super();
        this.set_property_value(GroupVM.LabelKey, name);
        this.set_property_value(GroupVM.IconGlyphKey, iconGlyph ?? '•');
    }

    get Label():     string { return this.get_property_value(GroupVM.LabelKey); }
    get IconGlyph(): string { return this.get_property_value(GroupVM.IconGlyphKey); }
}

// Default glyph per group name. An unmapped group falls back to a neutral
// bullet. The rail's declarative NavigationItems mirror these in markup.
const GROUP_ICONS: Record<string, string> = {
    'Animation':         '✦',
    'Controls':          '☷',
    'Demos':             '◑',
    'Patterns':          '◇',
    'Styles & Triggers': '✺',
};

export class DemoNavigationService extends NavigationService
{
    // SelectedGroupIndex — TwoWay-bound to the rail's SelectedIndex. An
    // index (not a data-item) because the rail's NavigationItems are
    // authored declaratively in markup, so SelectedIndex is the clean seam.
    static readonly SelectedGroupIndexKey = Model.RegisterProperty<number>(
        DemoNavigationService, 'SelectedGroupIndex', 0, MetaData.None);
    static readonly SelectedGroupKey = Model.RegisterProperty<GroupVM | undefined>(
        DemoNavigationService, 'SelectedGroup', undefined, MetaData.None);
    static readonly GroupsKey = Model.RegisterProperty<ObservableCollection<GroupVM> | undefined>(
        DemoNavigationService, 'Groups', undefined, MetaData.None);
    static readonly TitleKey = Model.RegisterProperty<string>(
        DemoNavigationService, 'Title', '', MetaData.None);
    static readonly SubtitleKey = Model.RegisterProperty<string>(
        DemoNavigationService, 'Subtitle', '', MetaData.None);
    static readonly ContentKey = Model.RegisterProperty<Visual | undefined>(
        DemoNavigationService, 'Content', undefined, MetaData.None);
    // `Items` (the current group's demos) and `SelectedItem` (the active
    // demo) are inherited from NavigationService.

    // Per-group "last-active demo" cache: re-selecting a visited group
    // restores the demo the user left it on. Keyed by GroupVM identity.
    private readonly _lastDemoByGroup = new Map<GroupVM, DemoVM>();
    // Group lookup by name, so a streamed-in demo finds its existing group.
    private readonly _groupsByName = new Map<string, GroupVM>();
    // Registry subscription, dropped on dispose.
    private readonly _unsubscribeRegistry: () => void;

    constructor(provider: IServiceProvider) {
        // The provider is the shell scope this service was registered in;
        // we forward it to satisfy the ServiceBase(provider) contract. This
        // service has no injected deps — it reads the registry directly.
        super(provider);

        this.set_property_value(DemoNavigationService.GroupsKey, new ObservableCollection<GroupVM>());

        // Snapshot whatever has registered so far, THEN keep listening: the
        // shell's `$service` bindings resolve (and so construct) this
        // singleton during view materialization, which can run before every
        // demo module's import side effect. Subscribing makes the navigation
        // list import-order independent — late registrations slot in
        // reactively. See registry.onDemoRegistered.
        for (const def of allDemos()) this._addDemo(def);
        this._unsubscribeRegistry = onDemoRegistered(def => this._addDemo(def));

        // Auto-select the first group + its first demo so the platform never
        // shows an empty state. The OnPropertyChanged routes below cascade:
        // SelectedGroupIndex → SelectedGroup → Items → SelectedItem →
        // Title / Subtitle / Content.
        this._syncSelectedGroupFromIndex();
    }

    // Slot one demo into the navigation tree: find-or-create its group (in
    // sorted position) and insert the demo (in sorted position) within it.
    // Drives selection when this is the first demo to arrive, or when it
    // lands in the already-selected-but-empty group — so a demo that
    // registers after the group was selected still surfaces.
    private _addDemo(def: DemoDefinition): void {
        const groups = this.Groups;
        if (groups === undefined) return;
        let g = this._groupsByName.get(def.group);
        const isNewGroup = g === undefined;
        if (g === undefined) {
            g = new GroupVM(def.group, GROUP_ICONS[def.group]);
            this._groupsByName.set(def.group, g);
            insertSorted(groups, g, (a, b) => a.Label.localeCompare(b.Label));
        }
        insertSorted(g.Demos, new DemoVM(def), (a, b) => a.Title.localeCompare(b.Title));

        if (isNewGroup) {
            // A sorted insert can shift which group occupies the selected
            // index, so keep SelectedGroup pinned to groups[SelectedGroupIndex]
            // (the rail-bound seam). In the normal path every demo is present
            // in the initial snapshot in sorted order, so index 0 never moves
            // and this is a no-op after the first group; in the late-
            // registration path it tracks the index as groups stream in.
            this._syncSelectedGroupFromIndex();
        } else if (g === this.SelectedGroup && this.SelectedItem === undefined) {
            // A demo streamed into the selected (previously empty) group —
            // surface its first entry.
            this.SelectedItem = g.Demos.Get(0);
        }
    }

    public override Dispose(): void {
        this._unsubscribeRegistry();
        super.Dispose();
    }

    get Groups():             ObservableCollection<GroupVM> | undefined { return this.get_property_value(DemoNavigationService.GroupsKey); }
    get SelectedGroupIndex():  number { return this.get_property_value(DemoNavigationService.SelectedGroupIndexKey); }
    set SelectedGroupIndex(v:  number) { this.set_property_value(DemoNavigationService.SelectedGroupIndexKey, v); }
    get SelectedGroup():       GroupVM | undefined { return this.get_property_value(DemoNavigationService.SelectedGroupKey); }
    set SelectedGroup(v:       GroupVM | undefined) { this.set_property_value(DemoNavigationService.SelectedGroupKey, v); }
    get Title():               string { return this.get_property_value(DemoNavigationService.TitleKey); }
    get Subtitle():            string { return this.get_property_value(DemoNavigationService.SubtitleKey); }
    get Content():             Visual | undefined { return this.get_property_value(DemoNavigationService.ContentKey); }

    private _syncSelectedGroupFromIndex(): void {
        const groups = this.Groups;
        if (groups === undefined) return;
        const idx = this.SelectedGroupIndex ?? 0;
        const grp = groups.Get(idx);
        if (grp !== this.SelectedGroup) {
            this.set_property_value(DemoNavigationService.SelectedGroupKey, grp);
        }
    }

    protected override OnPropertyChanged(descriptor: PropertyDescriptor, oldValue: unknown, newValue: unknown): void {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'SelectedGroupIndex') {
            this._syncSelectedGroupFromIndex();
        }
        if (descriptor.Name === 'SelectedGroup') {
            // Point the inherited Items at the new group's demos and restore
            // the user's last-active demo within it (or its first on a first
            // visit). The list binds ItemsSource=$service(…).Items, so it
            // re-sources reactively; SelectedItem (inherited) drives the page.
            const grp   = newValue instanceof GroupVM ? newValue : undefined;
            const demos = grp?.Demos;
            // NavigationService types Items as ObservableCollection<unknown>
            // (non-optional); at runtime the list legitimately clears to
            // undefined between groups, so bridge the looser-typed base DP.
            this.set_property_value(
                NavigationService.ItemsKey,
                demos as unknown as ObservableCollection<unknown>);
            const remembered = grp !== undefined ? this._lastDemoByGroup.get(grp) : undefined;
            this.SelectedItem = remembered ?? (demos !== undefined ? demos.Get(0) : undefined);
        }
        if (descriptor.Name === 'SelectedItem') {
            // The active demo changed (group switch or a list click writing
            // back through the TwoWay $service binding): cache it for the
            // owning group and derive the page content.
            const sel = newValue;
            if (sel instanceof DemoVM) {
                const owningGroup = this._findGroupForDemo(sel);
                if (owningGroup !== undefined) {
                    this._lastDemoByGroup.set(owningGroup, sel);
                }
                this.set_property_value(DemoNavigationService.TitleKey,    sel.Title);
                this.set_property_value(DemoNavigationService.SubtitleKey, sel.Subtitle);
                this.set_property_value(DemoNavigationService.ContentKey,  instantiateDemo(sel.Id));
            } else {
                this.set_property_value(DemoNavigationService.TitleKey,    '');
                this.set_property_value(DemoNavigationService.SubtitleKey, '');
                this.set_property_value(DemoNavigationService.ContentKey,  undefined);
            }
        }
    }

    private _findGroupForDemo(demo: DemoVM): GroupVM | undefined {
        const groups = this.Groups;
        if (groups === undefined) return undefined;
        for (const g of groups) {
            for (const d of g.Demos) {
                if (d === demo) return g;
            }
        }
        return undefined;
    }
}
