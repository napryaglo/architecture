// demo-group-services.mts — per-group content services for the demo platform.
//
// The service-backed content model: each demo GROUP is its OWN service, named
// by its capability's `ServiceKey` in demo-platform.module.mu. When a group's
// rail item is selected, the NavigationService resolves the capability's service
// (NavigationService.ActiveService) and the shell's content host renders it
// through the `DataTemplate [DataType = DemoGroupService]` in platform.mu (a
// demo ListBox + PageView).
//
// Each service is an app-root singleton (registered by the module's `.services:`
// block), so a group keeps its selected-demo + page state across rail switches.
// A concrete subclass fixes its group name — matching the registry `group` field
// and the capability's Name — and the CLASS ITSELF is the DI token
// (class-as-token, NO static Key): the module registers under
// `ServiceProvider.tokenFor(AnimationsService)` and the capability's
// `ServiceKey = AnimationsService` resolves the very same token. Adding a static
// Key would split those two sites, so these services deliberately omit one.
//
// Supersedes the GroupVM-as-destination model in demo-navigation-service.mts:
// the content is now a resolved service, not a NavigationDestination subclass,
// so the base NavigationService (no createDestination override) is enough.
import { MetaData, Model, ObservableCollection, ServiceBase, } from '@visualisation-sub/mural/runtime';
import { allDemos, instantiateDemo, onDemoRegistered } from './registry.mjs';
// Insert `item` into `coll` at the position that keeps it sorted by `cmp`
// (stable: ties land after existing equal entries), so demos land alphabetically
// whether they arrive in the initial snapshot or stream in late.
function insertSorted(coll, item, cmp) {
    let i = 0;
    while (i < coll.Count && cmp(coll.Get(i), item) <= 0)
        i++;
    coll.Insert(i, item);
}
// One demo row. `Label` is the display string the list template binds. The
// content host's ListBox renders each of these through the
// `DataTemplate [DataType = DemoVM]` in platform.mu.
export class DemoVM extends Model {
    static IdKey = Model.RegisterProperty(DemoVM, 'Id', '', MetaData.None);
    static LabelKey = Model.RegisterProperty(DemoVM, 'Label', '', MetaData.None);
    static TitleKey = Model.RegisterProperty(DemoVM, 'Title', '', MetaData.None);
    static SubtitleKey = Model.RegisterProperty(DemoVM, 'Subtitle', '', MetaData.None);
    // The raw registry definition, carried for instantiateDemo lookup — the
    // Visual is built lazily from this on first activation.
    Definition;
    constructor(def) {
        super();
        this.set_property_value(DemoVM.IdKey, def.id);
        this.set_property_value(DemoVM.LabelKey, def.title);
        this.set_property_value(DemoVM.TitleKey, def.title);
        this.set_property_value(DemoVM.SubtitleKey, def.subtitle ?? '');
        this.Definition = def;
    }
    get Id() { return this.get_property_value(DemoVM.IdKey); }
    get Label() { return this.get_property_value(DemoVM.LabelKey); }
    get Title() { return this.get_property_value(DemoVM.TitleKey); }
    get Subtitle() { return this.get_property_value(DemoVM.SubtitleKey); }
}
// The content a group's rail item shows: the group's demo list + active-demo
// page state. A ServiceBase (so it is a bindable, DP-backed Model AND a service
// the container owns and disposes). Abstract — a concrete subclass fixes the
// group name; the class identity is its DI token.
//
//   DemoGroupService (extends ServiceBase)
//     ├─ Demos: ObservableCollection<DemoVM>   the group's demo list
//     ├─ SelectedDemo   TwoWay ⇆ the demo ListBox; the active demo
//     └─ Title / Subtitle / Content   derived from SelectedDemo (Content lazy)
export class DemoGroupService extends ServiceBase {
    // Demos MUST be a DP, not a plain field: the content template binds
    // `ItemsSource = $Demos`, and a `$path` binding resolves its first
    // segment through the property system (`Model.HasProperty` gate) — a
    // plain field is invisible to it and the list silently renders empty.
    // The collection instance is stable (set once in the ctor, never
    // reassigned); the ListBox observes the collection's own change events,
    // so this DP only needs to hand back that stable reference. Mirrors
    // NavigationService.Items.
    static DemosKey = Model.RegisterProperty(DemoGroupService, 'Demos', undefined, MetaData.None);
    static SelectedDemoKey = Model.RegisterProperty(DemoGroupService, 'SelectedDemo', undefined, MetaData.None);
    static TitleKey = Model.RegisterProperty(DemoGroupService, 'Title', '', MetaData.None);
    static SubtitleKey = Model.RegisterProperty(DemoGroupService, 'Subtitle', '', MetaData.None);
    static ContentKey = Model.RegisterProperty(DemoGroupService, 'Content', undefined, MetaData.None);
    get Demos() { return this.get_property_value(DemoGroupService.DemosKey); }
    // The group this service owns — the registry `group` value / capability Name.
    GroupName;
    // Registry subscription, dropped on Dispose.
    _unsubscribeRegistry;
    constructor(provider, groupName) {
        super(provider);
        this.GroupName = groupName;
        // Stable per-instance collection the ItemsSource binding reads.
        this.set_property_value(DemoGroupService.DemosKey, new ObservableCollection());
        // Snapshot this group's demos from the registry; late registrations
        // arrive via the subscription below. Import-order independent.
        for (const def of allDemos()) {
            if (def.group === groupName)
                this.addDemo(def);
        }
        this._unsubscribeRegistry = onDemoRegistered(def => {
            if (def.group === this.GroupName)
                this.addDemo(def);
        });
    }
    get SelectedDemo() { return this.get_property_value(DemoGroupService.SelectedDemoKey); }
    set SelectedDemo(v) { this.set_property_value(DemoGroupService.SelectedDemoKey, v); }
    get Title() { return this.get_property_value(DemoGroupService.TitleKey); }
    get Subtitle() { return this.get_property_value(DemoGroupService.SubtitleKey); }
    get Content() { return this.get_property_value(DemoGroupService.ContentKey); }
    // Slot a demo into this group (sorted); select the first so the group never
    // renders empty.
    addDemo(def) {
        insertSorted(this.Demos, new DemoVM(def), (a, b) => a.Title.localeCompare(b.Title));
        if (this.SelectedDemo === undefined)
            this.SelectedDemo = this.Demos.Get(0);
    }
    OnPropertyChanged(descriptor, oldValue, newValue) {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'SelectedDemo') {
            // The list click (TwoWay) or an auto-select changed the active demo —
            // derive the page content (lazy-instantiated, cached by the registry).
            const sel = newValue;
            if (sel instanceof DemoVM) {
                this.set_property_value(DemoGroupService.TitleKey, sel.Title);
                this.set_property_value(DemoGroupService.SubtitleKey, sel.Subtitle);
                this.set_property_value(DemoGroupService.ContentKey, instantiateDemo(sel.Id));
            }
            else {
                this.set_property_value(DemoGroupService.TitleKey, '');
                this.set_property_value(DemoGroupService.SubtitleKey, '');
                this.set_property_value(DemoGroupService.ContentKey, undefined);
            }
        }
    }
    Dispose() {
        this._unsubscribeRegistry();
        super.Dispose();
    }
}
// The five concrete group services. Each fixes its group name (matching its
// capability's Name in demo-platform.module.mu) and is registered — and
// resolved via the capability's ServiceKey — under its own class token.
export class AnimationsService extends DemoGroupService {
    constructor(provider) { super(provider, 'Animation'); }
}
export class ControlsService extends DemoGroupService {
    constructor(provider) { super(provider, 'Controls'); }
}
export class DemosService extends DemoGroupService {
    constructor(provider) { super(provider, 'Demos'); }
}
export class PatternsService extends DemoGroupService {
    constructor(provider) { super(provider, 'Patterns'); }
}
export class StylesService extends DemoGroupService {
    constructor(provider) { super(provider, 'Styles & Triggers'); }
}
