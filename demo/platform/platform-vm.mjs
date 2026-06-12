// Platform-level view-model: shape the registry into a Model tree the
// shell can bind against.
//
//   PlatformVM
//     ├─ Groups: ObservableCollection<GroupVM>
//     │     └─ GroupVM
//     │         ├─ Label  (group name shown on the tree row)
//     │         └─ Demos: ObservableCollection<DemoVM>
//     │             └─ DemoVM (Label / Title / Subtitle / Id / Definition)
//     ├─ SelectedDemo: DemoVM | undefined  (set by the host on
//     │     tree-selection change; the source of truth for what
//     │     the page surfaces)
//     ├─ Title    : derived; mirrors SelectedDemo.Title (or '')
//     ├─ Subtitle : derived; mirrors SelectedDemo.Subtitle (or '')
//     └─ Content  : derived; the Visual produced by registry's
//                   instantiateDemo when SelectedDemo changes
//
// The platform.mu binds PageView.Title / Subtitle / Content directly to
// these VM properties via DataContext, so the host JS doesn't touch the
// PageView's slots — selection flows VM → bindings → view.

import { MetaData, Model, ObservableCollection } from '@visualisation-sub/mural/runtime';
import { instantiateDemo } from './registry.mjs';

// Display-string convention shared with TreeView's GetContainerForItemOverride:
// `Label` field is preferred. We expose .Label on both Group and Demo VMs
// so a single HierarchicalDataTemplate over heterogeneous items renders
// every row uniformly.

export class DemoVM extends Model
{
    static {
        Model.RegisterProperty(DemoVM, 'Id',         '', MetaData.None);
        Model.RegisterProperty(DemoVM, 'Label',      '', MetaData.None);
        Model.RegisterProperty(DemoVM, 'Title',      '', MetaData.None);
        Model.RegisterProperty(DemoVM, 'Subtitle',   '', MetaData.None);
    }

    constructor(def) {
        super();
        this._set_property_value_by_name('Id',       def.id);
        this._set_property_value_by_name('Label',    def.title);
        this._set_property_value_by_name('Title',    def.title);
        this._set_property_value_by_name('Subtitle', def.subtitle ?? '');
        // Carry the raw registry definition for instantiateDemo lookup —
        // the Visual is built lazily from this on first activation.
        this.Definition = def;
    }

    get Id()       { return this._get_property_value_by_name('Id'); }
    get Label()    { return this._get_property_value_by_name('Label'); }
    get Title()    { return this._get_property_value_by_name('Title'); }
    get Subtitle() { return this._get_property_value_by_name('Subtitle'); }
}

export class GroupVM extends Model
{
    static {
        Model.RegisterProperty(GroupVM, 'Label', '', MetaData.None);
        // Glyph that the NavigationRail-side NavigationItem can reach
        // for if a future migration switches the rail from the
        // declarative authoring path in platform.mu (icons baked into
        // each NavigationItem child) over to a data-driven path
        // (Items=$Groups). Today nothing reads IconGlyph; the
        // GROUP_ICONS map below still feeds it so the field stays
        // populated.
        Model.RegisterProperty(GroupVM, 'IconGlyph', '•', MetaData.None);
    }

    constructor(name, iconGlyph) {
        super();
        this._set_property_value_by_name('Label', name);
        this._set_property_value_by_name('IconGlyph', iconGlyph ?? '•');
        // Mutable collection so demos can be added incrementally as the
        // registry is built. ObservableCollection so downstream
        // ItemsControl pipelines pick up insertions reactively.
        this.Demos = new ObservableCollection();
    }

    get Label()     { return this._get_property_value_by_name('Label'); }
    get IconGlyph() { return this._get_property_value_by_name('IconGlyph'); }
}

// Default glyph per group name. Kept here (not in platform.mu) so the
// NavigationRail's data-driven path can populate per-group icons
// without view-side switching. Additions are loose enough that an
// unmapped group falls back to a neutral bullet.
const GROUP_ICONS = {
    'Animation':         '✦',
    'Controls':          '☷',
    'Demos':             '◑',
    'Patterns':          '◇',
    'Styles & Triggers': '✺',
};

export class PlatformVM extends Model
{
    static {
        // Groups   — the registry projected into GroupVMs. Drives the
        //            NavigationRail's ItemsSource.
        // SelectedGroup — TwoWay-bound to NavigationRail.SelectedDataItem.
        //            When it changes, the demo-list below the rail
        //            switches its ItemsSource and the previously-active
        //            demo within the new group (or its first demo)
        //            becomes SelectedDemo.
        // CurrentDemos — derived; the Demos collection of SelectedGroup
        //            (or empty when no group is selected). The demo
        //            list in platform.mu binds against this.
        // SelectedDemo — TwoWay-bound to the demo-list's
        //            SelectedDataItem. Drives Title / Subtitle / Content.
        Model.RegisterProperty(PlatformVM, 'Groups',             undefined, MetaData.None);
        // SelectedGroupIndex — TwoWay-bound to the NavigationRail's
        // SelectedIndex. Drives SelectedGroup via the OnPropertyChanged
        // route below. An index instead of a SelectedDataItem binding
        // because the rail's NavigationItems are authored declaratively
        // in markup (icon glyphs are baked in per item) rather than
        // data-driven, so SelectedIndex is the cleanest seam.
        Model.RegisterProperty(PlatformVM, 'SelectedGroupIndex', 0,         MetaData.None);
        Model.RegisterProperty(PlatformVM, 'SelectedGroup',      undefined, MetaData.None);
        Model.RegisterProperty(PlatformVM, 'CurrentDemos',       undefined, MetaData.None);
        Model.RegisterProperty(PlatformVM, 'SelectedDemo',       undefined, MetaData.None);
        Model.RegisterProperty(PlatformVM, 'Title',         '',        MetaData.None);
        Model.RegisterProperty(PlatformVM, 'Subtitle',      '',        MetaData.None);
        Model.RegisterProperty(PlatformVM, 'Content',       undefined, MetaData.None);
    }

    constructor(defs) {
        super();
        const groups = new ObservableCollection();
        const byName = new Map();
        for (const def of defs) {
            let g = byName.get(def.group);
            if (g === undefined) {
                g = new GroupVM(def.group, GROUP_ICONS[def.group]);
                byName.set(def.group, g);
                groups.Add(g);
            }
            g.Demos.Add(new DemoVM(def));
        }
        this._set_property_value_by_name('Groups', groups);

        // Per-group "last-active demo" cache. When the user re-selects
        // a group they've visited before, we re-surface their last
        // demo from that group instead of falling back to its first
        // entry. Keyed by GroupVM identity so renames don't perturb.
        this._lastDemoByGroup = new Map();

        // Auto-select the first group + its first demo so the platform
        // never shows an empty welcome state. The OnPropertyChanged
        // routes below pick up the cascade — SelectedGroupIndex flows
        // through to SelectedGroup → CurrentDemos → SelectedDemo →
        // Title / Subtitle / Content.
        this._syncSelectedGroupFromIndex();
    }

    get Groups()              { return this._get_property_value_by_name('Groups'); }
    get SelectedGroupIndex()  { return this._get_property_value_by_name('SelectedGroupIndex'); }
    set SelectedGroupIndex(v) { this._set_property_value_by_name('SelectedGroupIndex', v); }
    get SelectedGroup()       { return this._get_property_value_by_name('SelectedGroup'); }
    set SelectedGroup(v)      { this._set_property_value_by_name('SelectedGroup', v); }
    get CurrentDemos()        { return this._get_property_value_by_name('CurrentDemos'); }
    get SelectedDemo() { return this._get_property_value_by_name('SelectedDemo'); }
    set SelectedDemo(v){ this._set_property_value_by_name('SelectedDemo', v); }
    get Title()        { return this._get_property_value_by_name('Title'); }
    get Subtitle()     { return this._get_property_value_by_name('Subtitle'); }
    get Content()      { return this._get_property_value_by_name('Content'); }

    _syncSelectedGroupFromIndex() {
        const groups = this.Groups;
        if (groups === undefined) return;
        const idx = this.SelectedGroupIndex ?? 0;
        const grp = groups.Get(idx);
        if (grp !== this.SelectedGroup) {
            this._set_property_value_by_name('SelectedGroup', grp);
        }
    }

    OnPropertyChanged(descriptor, oldValue, newValue) {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'SelectedGroupIndex') {
            this._syncSelectedGroupFromIndex();
        }
        if (descriptor.Name === 'SelectedGroup') {
            // Refresh the per-group demo list + restore the user's
            // last-active demo within the new group (or its first
            // demo on first visit).
            const grp = newValue instanceof GroupVM ? newValue : undefined;
            const demos = grp?.Demos;
            this._set_property_value_by_name('CurrentDemos', demos);
            const remembered = grp !== undefined ? this._lastDemoByGroup.get(grp) : undefined;
            const target = remembered ?? (demos !== undefined ? demos.Get(0) : undefined);
            this._set_property_value_by_name('SelectedDemo', target);
        }
        if (descriptor.Name === 'SelectedDemo') {
            // Cache so a future re-select of the owning group restores
            // this demo instead of falling back to the group's first.
            const sel = newValue;
            if (sel instanceof DemoVM) {
                const owningGroup = this._findGroupForDemo(sel);
                if (owningGroup !== undefined) {
                    this._lastDemoByGroup.set(owningGroup, sel);
                }
                this._set_property_value_by_name('Title',    sel.Title);
                this._set_property_value_by_name('Subtitle', sel.Subtitle);
                const root = instantiateDemo(sel.Id);
                this._set_property_value_by_name('Content', root);
            } else {
                this._set_property_value_by_name('Title',    '');
                this._set_property_value_by_name('Subtitle', '');
                this._set_property_value_by_name('Content',  undefined);
            }
        }
    }

    _findGroupForDemo(demo) {
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
