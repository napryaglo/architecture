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
        this.set_property_value('Id',       def.id);
        this.set_property_value('Label',    def.title);
        this.set_property_value('Title',    def.title);
        this.set_property_value('Subtitle', def.subtitle ?? '');
        // Carry the raw registry definition for instantiateDemo lookup —
        // the Visual is built lazily from this on first activation.
        this.Definition = def;
    }

    get Id()       { return this.get_property_value('Id'); }
    get Label()    { return this.get_property_value('Label'); }
    get Title()    { return this.get_property_value('Title'); }
    get Subtitle() { return this.get_property_value('Subtitle'); }
}

export class GroupVM extends Model
{
    static {
        Model.RegisterProperty(GroupVM, 'Label', '', MetaData.None);
    }

    constructor(name) {
        super();
        this.set_property_value('Label', name);
        // Mutable collection so demos can be added incrementally as the
        // registry is built. ObservableCollection so the TreeView's
        // ItemsControl pipeline picks up insertions reactively.
        this.Demos = new ObservableCollection();
    }

    get Label() { return this.get_property_value('Label'); }
}

export class PlatformVM extends Model
{
    static {
        // Groups is set once in the constructor; SelectedDemo is driven
        // by the TreeView's TwoWay binding back through the VM.
        // Title / Subtitle / Content are derived — written internally
        // when SelectedDemo changes. The ItemTemplate +
        // ItemContainerStyle that the TreeView consumes live in
        // platform.mu (as @GroupTemplate / @NavRowStyle resources), so
        // they're not VM state.
        Model.RegisterProperty(PlatformVM, 'Groups',       undefined, MetaData.None);
        Model.RegisterProperty(PlatformVM, 'SelectedDemo', undefined, MetaData.None);
        Model.RegisterProperty(PlatformVM, 'Title',        '',        MetaData.None);
        Model.RegisterProperty(PlatformVM, 'Subtitle',     '',        MetaData.None);
        Model.RegisterProperty(PlatformVM, 'Content',      undefined, MetaData.None);
    }

    constructor(defs) {
        super();
        const groups = new ObservableCollection();
        const byName = new Map();
        for (const def of defs) {
            let g = byName.get(def.group);
            if (g === undefined) {
                g = new GroupVM(def.group);
                byName.set(def.group, g);
                groups.Add(g);
            }
            g.Demos.Add(new DemoVM(def));
        }
        this.set_property_value('Groups', groups);

        // Auto-select the first demo so the platform never shows an
        // empty welcome state. This is just a regular DP write — the
        // VM's downstream TwoWay binding to TreeView.SelectedDataItem
        // pushes it to the tree (which finds the matching container
        // via the generator and selects it), and the OnPropertyChanged
        // hook below recomputes Title / Subtitle / Content for the
        // PageView bindings.
        this.set_property_value('SelectedDemo', this.FirstDemo());
    }

    get Groups()       { return this.get_property_value('Groups'); }
    get SelectedDemo() { return this.get_property_value('SelectedDemo'); }
    set SelectedDemo(v){ this.set_property_value('SelectedDemo', v); }
    get Title()        { return this.get_property_value('Title'); }
    get Subtitle()     { return this.get_property_value('Subtitle'); }
    get Content()      { return this.get_property_value('Content'); }

    OnPropertyChanged(descriptor, oldValue, newValue) {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'SelectedDemo') {
            // Materialize derived properties from the new selection.
            // Title / Subtitle: empty strings for the "no selection"
            // state so the bound PageView header doesn't show stale
            // values from a previous selection.
            const sel = newValue;
            if (sel instanceof DemoVM) {
                this.set_property_value('Title',    sel.Title);
                this.set_property_value('Subtitle', sel.Subtitle);
                const root = instantiateDemo(sel.Id);
                this.set_property_value('Content', root);
            } else {
                this.set_property_value('Title',    '');
                this.set_property_value('Subtitle', '');
                this.set_property_value('Content',  undefined);
            }
        }
    }

    // Convenience for the host's first-load path. Walks Groups and
    // returns the first DemoVM, or undefined when the registry has no
    // demos.
    FirstDemo() {
        const groups = this.Groups;
        if (groups === undefined) return undefined;
        for (const g of groups) {
            for (const d of g.Demos) return d;
        }
        return undefined;
    }
}
