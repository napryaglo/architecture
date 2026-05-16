import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    MetaData,
    affectsMeasure,
    affectsArrange,
    affectsRender,
    inherits,
    Binding,
    BindingMode,
    type ValueConverter,
    PropertyValueSource,
    Model,
    PropertyKey,
    Single,
    PanelBase,
    type CoerceValue,
    type PropertyChangeCallback,
} from './index.js';

// Thin convenience wrapper that forwards a class object to
// Model.RegisterProperty. PropertyPath traverses Models via their property
// bags, so no prototype accessor is required.
function register(
    klass: Function,
    property: string,
    default_value: unknown,
    meta: MetaData,
): void
{
    Model.RegisterProperty(klass, property, default_value, meta);
}

// Builds a fresh scene with six Model classes (five for the chain plus a
// ViewModel) and registers every property via Model.RegisterProperty. Each
// invocation declares brand-new class objects, so the WeakMap-backed
// registry stays naturally isolated between tests.
function buildScene()
{
    class Company extends Model
    {
        static {
            this.RegisterProperty(this, 'name', '', MetaData.Render);
            this.RegisterProperty(this, 'department', null, MetaData.Render);
        }
    }

    class Department extends Model {}
    class Manager extends Model {}
    class Office extends Model {}
    class Desk extends Model {}
    class ViewModel extends Model {}

    register(Department, 'code',       '',   MetaData.Render);
    register(Department, 'manager',    null, MetaData.Render);
    register(Department, 'managers',   null, MetaData.Render);
    register(Manager,    'name',       '',   MetaData.Render);
    register(Manager,    'office',     null, MetaData.Render);
    register(Office,     'number',     0,    MetaData.Render);
    register(Office,     'desk',       null, MetaData.Render);
    register(Desk,       'label',      '',   MetaData.Render);
    register(Desk,       'items',      0,    MetaData.Render);
    register(ViewModel,  'label',      '',   MetaData.Render);
    register(ViewModel,  'items',      0,    MetaData.Render);

    const desk = new Desk();
    desk.set_property_value('label', 'desk-1');
    desk.set_property_value('items', 12);

    const office = new Office();
    office.set_property_value('number', 314);
    office.set_property_value('desk', desk);

    const manager = new Manager();
    manager.set_property_value('name', 'Ada');
    manager.set_property_value('office', office);

    const department = new Department();
    department.set_property_value('code', 'ENG');
    department.set_property_value('manager', manager);

    const company = new Company();
    company.set_property_value('name', 'Mural');
    company.set_property_value('department', department);

    return {
        Company, Department, Manager, Office, Desk, ViewModel,
        company, department, manager, office, desk,
    };
}

describe('Binding — transitive paths across a graph of Models', () => {
    test('ViewModel.label bound through a 5-Model chain resolves transitively', () => {
        const { company, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value('label'), 'desk-1');
    });

    test('severing an intermediate Model returns undefined on the next read', () => {
        const { company, manager, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        manager.set_property_value('office', null);
        assert.equal(view.get_property_value('label'), undefined);
    });

    test('mutating the leaf Model is observable via the ViewModel on the next read', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value('label'), 'desk-1');
        desk.set_property_value('label', 'changed');
        assert.equal(view.get_property_value('label'), 'changed');
    });

    test('replacing a mid-chain Model subtree retargets resolution through the new branch', () => {
        const { company, department, Manager, Office, Desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value('label'), 'desk-1');

        const newDesk = new Desk();
        newDesk.set_property_value('label', 'desk-replaced');
        const newOffice = new Office();
        newOffice.set_property_value('desk', newDesk);
        const newManager = new Manager();
        newManager.set_property_value('office', newOffice);
        department.set_property_value('manager', newManager);

        assert.equal(view.get_property_value('label'), 'desk-replaced');
    });

    test('Binding.set_value (TwoWay) writes the leaf Model property through the chain', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
            BindingMode.TwoWay,
        );
        view.set_property_value('label', binding);

        assert.equal(binding.set_value('renamed'), true);
        assert.equal(desk.get_property_value('label'), 'renamed');
        assert.equal(view.get_property_value('label'), 'renamed');
    });

    test('two ViewModels bound to the same chain both see leaf mutations', () => {
        const { company, desk, ViewModel } = buildScene();
        const viewA = new ViewModel();
        const viewB = new ViewModel();
        viewA.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        viewB.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(viewA.get_property_value('label'), 'desk-1');
        assert.equal(viewB.get_property_value('label'), 'desk-1');

        desk.set_property_value('label', 'rotated');
        assert.equal(viewA.get_property_value('label'), 'rotated');
        assert.equal(viewB.get_property_value('label'), 'rotated');
    });

    test('two roots sharing a mid-chain Manager: both views reflect mutations to the shared subtree', () => {
        const { Company, Department, manager, company, desk, ViewModel } = buildScene();

        const dept2 = new Department();
        dept2.set_property_value('manager', manager);
        const co2 = new Company();
        co2.set_property_value('department', dept2);

        const view1 = new ViewModel();
        view1.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        const view2 = new ViewModel();
        view2.set_property_value(
            'label',
            new Binding(co2, 'department.manager.office.desk.label'),
        );

        assert.equal(view1.get_property_value('label'), 'desk-1');
        assert.equal(view2.get_property_value('label'), 'desk-1');

        desk.set_property_value('label', 'rotated');
        assert.equal(view1.get_property_value('label'), 'rotated');
        assert.equal(view2.get_property_value('label'), 'rotated');
    });

    test('rebinding a ViewModel.label to a different graph swaps the resolved value', () => {
        const { Company, Department, Manager, Office, Desk, ViewModel, company, desk } = buildScene();
        desk.set_property_value('label', 'graph-one');

        const desk2 = new Desk();
        desk2.set_property_value('label', 'graph-two');
        const office2 = new Office();
        office2.set_property_value('desk', desk2);
        const manager2 = new Manager();
        manager2.set_property_value('office', office2);
        const department2 = new Department();
        department2.set_property_value('manager', manager2);
        const company2 = new Company();
        company2.set_property_value('department', department2);

        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value('label'), 'graph-one');

        view.set_property_value(
            'label',
            new Binding(company2, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value('label'), 'graph-two');
    });

    test('indexed segments traverse an array of Manager Models', () => {
        const { Department, Manager, Office, Desk, ViewModel } = buildScene();

        const targetDesk = new Desk();
        targetDesk.set_property_value('label', 'corner-desk');
        const targetOffice = new Office();
        targetOffice.set_property_value('desk', targetDesk);
        const targetManager = new Manager();
        targetManager.set_property_value('office', targetOffice);

        const dept = new Department();
        dept.set_property_value(
            'managers',
            [new Manager(), new Manager(), targetManager, new Manager()],
        );

        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(dept, 'managers[2].office.desk.label'),
        );
        assert.equal(view.get_property_value('label'), 'corner-desk');

        targetDesk.set_property_value('label', 'rotated');
        assert.equal(view.get_property_value('label'), 'rotated');
    });

    test('listener on ViewModel.label fires on Binding install with resolved value, then again on leaf mutation', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(
            'label',
            (_m, _p, old_value, new_value) => { captures.push([old_value, new_value]); },
        );

        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![0], '');
        assert.equal(captures[0]![1], 'desk-1');

        desk.set_property_value('label', 'changed');
        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 'desk-1');
        assert.equal(captures[1]![1], 'changed');

        assert.equal(view.get_property_value('label'), 'changed');
    });
});

describe('TwoWay Bindings across a graph of Models', () => {
    test('writeback through an array of Manager Models updates the leaf Desk', () => {
        const { Department, Manager, Office, Desk } = buildScene();

        const targetDesk = new Desk();
        targetDesk.set_property_value('label', 'corner-desk');
        const targetOffice = new Office();
        targetOffice.set_property_value('desk', targetDesk);
        const targetManager = new Manager();
        targetManager.set_property_value('office', targetOffice);

        const dept = new Department();
        dept.set_property_value(
            'managers',
            [new Manager(), new Manager(), targetManager, new Manager()],
        );

        const binding = new Binding(
            dept,
            'managers[2].office.desk.label',
            BindingMode.TwoWay,
        );
        assert.equal(binding.get_value(), 'corner-desk');
        assert.equal(binding.set_value('corner-renamed'), true);
        assert.equal(targetDesk.get_property_value('label'), 'corner-renamed');
        assert.equal(binding.get_value(), 'corner-renamed');
    });

    test('writeback fires PropertyChanged on the leaf Model with old/new values', () => {
        const { company, desk } = buildScene();
        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
            BindingMode.TwoWay,
        );

        let fired = 0;
        let captured: [Model, string, unknown, unknown] | null = null;
        const cb: PropertyChangeCallback = (m, p, o, n) => {
            fired++;
            captured = [m, p, o, n];
        };
        desk.AddPropertyChangedListener('label', cb);

        assert.equal(binding.set_value('renamed'), true);
        assert.equal(fired, 1);
        assert.equal(captured![0], desk);
        assert.equal(captured![1], 'label');
        assert.equal(captured![2], 'desk-1');
        assert.equal(captured![3], 'renamed');
    });

    test('TwoWay writeback is visible to a separate OneWay binding reading the same path', () => {
        const { company } = buildScene();
        const writer = new Binding(
            company,
            'department.manager.office.desk.label',
            BindingMode.TwoWay,
        );
        const reader = new Binding(
            company,
            'department.manager.office.desk.label',
        );

        assert.equal(reader.get_value(), 'desk-1');
        assert.equal(writer.set_value('shared-renamed'), true);
        assert.equal(reader.get_value(), 'shared-renamed');
    });

    test('writeback after a mid-chain subtree swap targets the new leaf, leaving the old leaf untouched', () => {
        const { company, department, desk, Manager, Office, Desk } = buildScene();
        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
            BindingMode.TwoWay,
        );

        const newDesk = new Desk();
        newDesk.set_property_value('label', 'desk-replaced');
        const newOffice = new Office();
        newOffice.set_property_value('desk', newDesk);
        const newManager = new Manager();
        newManager.set_property_value('office', newOffice);
        department.set_property_value('manager', newManager);

        assert.equal(binding.set_value('written-after-swap'), true);
        assert.equal(newDesk.get_property_value('label'), 'written-after-swap');
        assert.equal(desk.get_property_value('label'), 'desk-1');
        assert.equal(binding.get_value(), 'written-after-swap');
    });

    test('writeback into a shared mid-chain Manager is visible from a second root', () => {
        const { Company, Department, manager, company } = buildScene();

        const dept2 = new Department();
        dept2.set_property_value('manager', manager);
        const co2 = new Company();
        co2.set_property_value('department', dept2);

        const writer = new Binding(
            company,
            'department.manager.office.desk.label',
            BindingMode.TwoWay,
        );
        const reader = new Binding(
            co2,
            'department.manager.office.desk.label',
        );

        assert.equal(reader.get_value(), 'desk-1');
        assert.equal(writer.set_value('shared-renamed'), true);
        assert.equal(reader.get_value(), 'shared-renamed');
    });

    test('writeback returns false when an intermediate Model is null and the leaf is untouched', () => {
        const { company, desk, manager } = buildScene();
        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
            BindingMode.TwoWay,
        );

        manager.set_property_value('office', null);
        assert.equal(binding.set_value('nope'), false);
        assert.equal(desk.get_property_value('label'), 'desk-1');
    });

    test('writeback to a mid-chain Model property replaces the subtree at that node', () => {
        const { Manager, Office, Desk, company, ViewModel } = buildScene();
        const swap = new Binding(company, 'department.manager', BindingMode.TwoWay);

        const newDesk = new Desk();
        newDesk.set_property_value('label', 'new-leaf');
        const newOffice = new Office();
        newOffice.set_property_value('desk', newDesk);
        const newManager = new Manager();
        newManager.set_property_value('office', newOffice);

        assert.equal(swap.set_value(newManager), true);

        // A separately created deep binding now resolves through the swapped subtree.
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value('label'), 'new-leaf');
    });

    test('writeback through a 7-Model chain with array branching at two levels', () => {
        class Org extends Model {}
        class Region extends Model {}
        class Branch extends Model {}
        class Department extends Model {}
        class Manager extends Model {}
        class Office extends Model {}
        class Desk extends Model {}

        register(Org,        'regions',    null, MetaData.Render);
        register(Region,     'branches',   null, MetaData.Render);
        register(Branch,     'department', null, MetaData.Render);
        register(Department, 'manager',    null, MetaData.Render);
        register(Manager,    'office',     null, MetaData.Render);
        register(Office,     'desk',       null, MetaData.Render);
        register(Desk,       'label',      '',   MetaData.Render);

        const desk = new Desk();
        desk.set_property_value('label', 'initial');
        const office = new Office();
        office.set_property_value('desk', desk);
        const manager = new Manager();
        manager.set_property_value('office', office);
        const department = new Department();
        department.set_property_value('manager', manager);
        const branch = new Branch();
        branch.set_property_value('department', department);
        const region = new Region();
        region.set_property_value('branches', [branch]);
        const org = new Org();
        org.set_property_value('regions', [new Region(), region]);

        const binding = new Binding(
            org,
            'regions[1].branches[0].department.manager.office.desk.label',
            BindingMode.TwoWay,
        );
        assert.equal(binding.get_value(), 'initial');
        assert.equal(binding.set_value('renamed'), true);
        assert.equal(desk.get_property_value('label'), 'renamed');
        assert.equal(binding.get_value(), 'renamed');
    });
});

// Pins backlog item 2.1: PropertyChanged listeners are per-instance, not
// per-type. A listener attached to one Desk does not fire when a different
// Desk's same-named property changes. Before the fix, callbacks were stored
// on PropertyDescriptor.PropertyChanged (shared across all instances of the
// class) and every instance's mutation triggered every instance's listeners.
describe('Per-instance PropertyChanged listeners', () => {
    test('a listener on instance A does not fire when instance B (same class) changes', () => {
        const { Desk } = buildScene();
        const a = new Desk();
        const b = new Desk();
        a.set_property_value('label', 'a-initial');
        b.set_property_value('label', 'b-initial');

        let aFires = 0;
        let bFires = 0;
        a.AddPropertyChangedListener('label', () => { aFires++; });
        b.AddPropertyChangedListener('label', () => { bFires++; });

        a.set_property_value('label', 'a-changed');
        assert.equal(aFires, 1);
        assert.equal(bFires, 0);

        b.set_property_value('label', 'b-changed');
        assert.equal(aFires, 1);
        assert.equal(bFires, 1);
    });

    test('removing a listener on instance A leaves instance B listeners intact', () => {
        const { Desk } = buildScene();
        const a = new Desk();
        const b = new Desk();

        let aFires = 0;
        let bFires = 0;
        const aCb: PropertyChangeCallback = () => { aFires++; };
        const bCb: PropertyChangeCallback = () => { bFires++; };

        a.AddPropertyChangedListener('label', aCb);
        b.AddPropertyChangedListener('label', bCb);

        a.RemovePropertyChangedListener('label', aCb);

        a.set_property_value('label', 'a-changed');
        b.set_property_value('label', 'b-changed');

        assert.equal(aFires, 0);
        assert.equal(bFires, 1);
    });

    test('a listener added before any set still fires on the first set', () => {
        // Verifies that the EVD is created lazily on listener-add too, so
        // the "listener before any set" path still notifies.
        const { Desk } = buildScene();
        const desk = new Desk();

        let captured: [Model, string, unknown, unknown] | null = null;
        desk.AddPropertyChangedListener('label', (m, p, o, n) => { captured = [m, p, o, n]; });

        desk.set_property_value('label', 'first-set');
        assert.notEqual(captured, null);
        assert.equal(captured![0], desk);
        assert.equal(captured![1], 'label');
        assert.equal(captured![2], '');
        assert.equal(captured![3], 'first-set');
    });

    test('AddPropertyChangedListener still throws on an unregistered property', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        assert.throws(
            () => desk.AddPropertyChangedListener('nope', () => {}),
            /not found in model 'Desk'/,
        );
    });

    test('multiple listeners on the same instance all fire, in registration order', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        const order: number[] = [];
        desk.AddPropertyChangedListener('label', () => { order.push(1); });
        desk.AddPropertyChangedListener('label', () => { order.push(2); });
        desk.AddPropertyChangedListener('label', () => { order.push(3); });

        desk.set_property_value('label', 'fire');
        assert.deepEqual(order, [1, 2, 3]);
    });
});

// Pins backlog item 2.3: push-style binding notification. A change anywhere
// along a binding's path that alters the resolved value should fire the
// binding consumer's PropertyChanged listeners with (oldResolved, newResolved).
describe('Push-style binding notification on bound consumers', () => {
    test('a mid-chain Manager swap pushes the new resolved leaf value to the consumer', () => {
        const { company, department, Manager, Office, Desk, ViewModel } = buildScene();
        const view = new ViewModel();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(
            'label',
            (_m, _p, o, n) => { captures.push([o, n]); },
        );

        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        // install fires once with ('', 'desk-1')
        assert.equal(captures.length, 1);

        const newDesk = new Desk();
        newDesk.set_property_value('label', 'swapped-leaf');
        const newOffice = new Office();
        newOffice.set_property_value('desk', newDesk);
        const newManager = new Manager();
        newManager.set_property_value('office', newOffice);
        department.set_property_value('manager', newManager);

        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 'desk-1');
        assert.equal(captures[1]![1], 'swapped-leaf');
    });

    test('severing an intermediate Model pushes undefined to the consumer', () => {
        const { company, manager, ViewModel } = buildScene();
        const view = new ViewModel();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(
            'label',
            (_m, _p, o, n) => { captures.push([o, n]); },
        );

        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(captures.length, 1);

        manager.set_property_value('office', null);
        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 'desk-1');
        assert.equal(captures[1]![1], undefined);
    });

    test('no notification fires when a chain change leaves the resolved value unchanged', () => {
        // Replacing a mid-chain Manager with a different Manager whose
        // downstream chain resolves to the same leaf value should NOT
        // fire the consumer's listener — the effective value didn't change.
        const { company, department, Manager, Office, Desk, ViewModel } = buildScene();
        const view = new ViewModel();
        let fires = 0;
        view.AddPropertyChangedListener('label', () => { fires++; });

        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(fires, 1); // install

        // Build a new subtree whose leaf label is the SAME string as the
        // current resolved value ('desk-1').
        const newDesk = new Desk();
        newDesk.set_property_value('label', 'desk-1');
        const newOffice = new Office();
        newOffice.set_property_value('desk', newDesk);
        const newManager = new Manager();
        newManager.set_property_value('office', newOffice);
        department.set_property_value('manager', newManager);

        assert.equal(fires, 1);
    });

    test('two ViewModels bound to the same chain both receive push notifications independently', () => {
        const { company, desk, ViewModel } = buildScene();
        const viewA = new ViewModel();
        const viewB = new ViewModel();
        let aFires = 0;
        let bFires = 0;
        viewA.AddPropertyChangedListener('label', () => { aFires++; });
        viewB.AddPropertyChangedListener('label', () => { bFires++; });

        viewA.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        viewB.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(aFires, 1);
        assert.equal(bFires, 1);

        desk.set_property_value('label', 'rotated');
        assert.equal(aFires, 2);
        assert.equal(bFires, 2);
    });

    test('replacing a binding stops further notifications from the old chain', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        let fires = 0;
        view.AddPropertyChangedListener('label', () => { fires++; });

        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(fires, 1);

        // Swap the binding for a plain local value. The old binding's
        // path listeners are still attached to chain Models (cleanup is
        // backlog item 2.5), but the EVD must have detached its
        // subscription so the old chain can no longer push to it.
        view.set_property_value('label', 'local-override');
        assert.equal(fires, 2);

        desk.set_property_value('label', 'this-should-not-propagate');
        assert.equal(fires, 2);
        assert.equal(view.get_property_value('label'), 'local-override');
    });

    test('writing through a TwoWay binding pushes the new value back to the consumer', () => {
        const { company, ViewModel } = buildScene();
        const view = new ViewModel();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(
            'label',
            (_m, _p, o, n) => { captures.push([o, n]); },
        );

        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
            BindingMode.TwoWay,
        );
        view.set_property_value('label', binding);
        assert.equal(captures.length, 1);

        // TwoWay writeback updates the leaf, which propagates through
        // the path's OnChanged back to the view.
        binding.set_value('renamed');
        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 'desk-1');
        assert.equal(captures[1]![1], 'renamed');
    });
});

// Peeks at per-instance listener count for diagnostic assertions. Lives
// here as a test-side helper rather than a public Model API so production
// code doesn't grow a "count my listeners" method just for tests.
function listener_count(model: Model, property: string): number
{
    // Walks the model's class hierarchy to find the registering owner so
    // we can compose the composite storage key the way Model itself does.
    const bags = (Model as unknown as {
        property_bags: WeakMap<Function, Map<string, { RootOwner: Function }>>;
    }).property_bags;
    let cls: Function | null = model.constructor;
    let owner: Function | undefined;
    while (cls !== null && cls !== Function.prototype)
    {
        const desc = bags.get(cls)?.get(property);
        if (desc !== undefined) { owner = desc.RootOwner; break; }
        cls = Object.getPrototypeOf(cls);
    }
    if (owner === undefined) return 0;
    const key = `${owner.name}.${property}`;
    const props = (model as unknown as {
        property_values: Map<string, { changeListeners: Array<unknown> }>;
    }).property_values;
    return props.get(key)?.changeListeners.length ?? 0;
}

// Test-side accessor for Model's protected `parent` getter. Production
// API keeps the parent link encapsulated; tests assert tree structure
// through this helper instead.
function parent_of(model: Model | undefined): Model | undefined
{
    if (model === undefined) return undefined;
    return (model as unknown as { parent: Model | undefined }).parent;
}

// Pins backlog item 2.5: Binding/PropertyPath disposal. Listeners attached
// by PropertyPath.Traverse must be removed when the binding is no longer
// used, otherwise they accumulate on chain Models indefinitely.
describe('Binding / PropertyPath disposal', () => {
    test('replacing a Binding with a local value removes the old chain listeners', () => {
        const { company, department, manager, office, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );

        // Every Model in the chain has exactly one path listener installed.
        assert.equal(listener_count(company, 'department'), 1);
        assert.equal(listener_count(department, 'manager'), 1);
        assert.equal(listener_count(manager, 'office'), 1);
        assert.equal(listener_count(office, 'desk'), 1);
        assert.equal(listener_count(desk, 'label'), 1);

        view.set_property_value('label', 'local-override');

        // The replacement disposes the old binding; chain Models are clean.
        assert.equal(listener_count(company, 'department'), 0);
        assert.equal(listener_count(department, 'manager'), 0);
        assert.equal(listener_count(manager, 'office'), 0);
        assert.equal(listener_count(office, 'desk'), 0);
        assert.equal(listener_count(desk, 'label'), 0);
    });

    test('replacing a Binding with another Binding cleans up the old chain', () => {
        const { Company, Department, Manager, Office, Desk, company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(listener_count(desk, 'label'), 1);

        // Build a second graph and point view.label at its leaf.
        const desk2 = new Desk();
        const office2 = new Office();
        office2.set_property_value('desk', desk2);
        const manager2 = new Manager();
        manager2.set_property_value('office', office2);
        const department2 = new Department();
        department2.set_property_value('manager', manager2);
        const company2 = new Company();
        company2.set_property_value('department', department2);

        view.set_property_value(
            'label',
            new Binding(company2, 'department.manager.office.desk.label'),
        );

        // Old chain is clean; new chain has the listeners.
        assert.equal(listener_count(desk, 'label'), 0);
        assert.equal(listener_count(desk2, 'label'), 1);
    });

    test('binding.dispose() explicitly removes all chain listeners', () => {
        const { company, department, manager, office, desk } = buildScene();
        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
        );
        assert.equal(listener_count(company, 'department'), 1);
        assert.equal(listener_count(desk, 'label'), 1);

        binding.dispose();

        assert.equal(listener_count(company, 'department'), 0);
        assert.equal(listener_count(department, 'manager'), 0);
        assert.equal(listener_count(manager, 'office'), 0);
        assert.equal(listener_count(office, 'desk'), 0);
        assert.equal(listener_count(desk, 'label'), 0);
    });

    test('dispose is idempotent', () => {
        const { company, desk } = buildScene();
        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
        );

        binding.dispose();
        binding.dispose();
        binding.dispose();

        assert.equal(listener_count(desk, 'label'), 0);
    });

    test('chain mutations after dispose do not fire any path-side reactions', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        let fires = 0;
        view.AddPropertyChangedListener('label', () => { fires++; });

        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
        );
        view.set_property_value('label', binding);
        // install fires once
        assert.equal(fires, 1);

        // Replace with a local value — disposes the binding.
        view.set_property_value('label', 'local');
        // replacement fires (oldResolved → local)
        assert.equal(fires, 2);

        // Mutating any chain Model must not fire view's listener.
        desk.set_property_value('label', 'after-dispose');
        assert.equal(fires, 2);
    });

    test('listener count is per-instance — disposing one binding does not affect a parallel binding on a different graph', () => {
        const { Company, Department, Manager, Office, Desk, company, desk } = buildScene();

        const desk2 = new Desk();
        const office2 = new Office();
        office2.set_property_value('desk', desk2);
        const manager2 = new Manager();
        manager2.set_property_value('office', office2);
        const department2 = new Department();
        department2.set_property_value('manager', manager2);
        const company2 = new Company();
        company2.set_property_value('department', department2);

        const bindingA = new Binding(
            company,
            'department.manager.office.desk.label',
        );
        const bindingB = new Binding(
            company2,
            'department.manager.office.desk.label',
        );

        assert.equal(listener_count(desk, 'label'), 1);
        assert.equal(listener_count(desk2, 'label'), 1);

        bindingA.dispose();

        assert.equal(listener_count(desk, 'label'), 0);
        assert.equal(listener_count(desk2, 'label'), 1);

        bindingB.dispose();
        assert.equal(listener_count(desk2, 'label'), 0);
    });
});

// Pins backlog item 7.3: ClearValue + value-source query. ClearValue resets
// a property back to its registered default; GetValueSource tells you where
// the effective value is currently coming from (LocalValue / Binding /
// Default / etc.) — the runtime analog of WPF's DependencyPropertyHelper.
describe('ClearValue and GetValueSource', () => {
    test('GetValueSource is Default before any set or listener add', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        assert.equal(desk.GetValueSource('label'), PropertyValueSource.Default);
    });

    test('GetValueSource becomes LocalValue after a plain set_property_value', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        desk.set_property_value('label', 'set-locally');
        assert.equal(desk.GetValueSource('label'), PropertyValueSource.LocalValue);
    });

    test('GetValueSource becomes Binding after installing a Binding', () => {
        const { company, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.GetValueSource('label'), PropertyValueSource.Binding);
    });

    test('GetValueSource stays Default after AddPropertyChangedListener (no value set yet)', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        desk.AddPropertyChangedListener('label', () => {});
        // Listener creates an EVD lazily at Default priority; the source
        // should still report Default until something is actually set.
        assert.equal(desk.GetValueSource('label'), PropertyValueSource.Default);
    });

    test('ClearValue resets a locally-set property back to its registered default', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        desk.set_property_value('label', 'set-locally');
        assert.equal(desk.get_property_value('label'), 'set-locally');

        desk.ClearValue('label');
        assert.equal(desk.get_property_value('label'), '');   // default for 'label'
        assert.equal(desk.GetValueSource('label'), PropertyValueSource.Default);
    });

    test('ClearValue fires PropertyChanged with (oldEffective, defaultValue) when the value changed', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        desk.set_property_value('items', 42);

        const captures: Array<[unknown, unknown]> = [];
        desk.AddPropertyChangedListener(
            'items',
            (_m, _p, o, n) => { captures.push([o, n]); },
        );

        desk.ClearValue('items');
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![0], 42);
        assert.equal(captures[0]![1], 0);   // default for 'items'
    });

    test('ClearValue is a silent no-op when the property has never been set', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        let fires = 0;
        desk.AddPropertyChangedListener('label', () => { fires++; });

        desk.ClearValue('label');
        assert.equal(fires, 0);
        assert.equal(desk.get_property_value('label'), '');
    });

    test('ClearValue on a bound property disposes the binding and detaches its chain listeners', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(listener_count(desk, 'label'), 1);
        assert.equal(view.GetValueSource('label'), PropertyValueSource.Binding);

        view.ClearValue('label');

        assert.equal(view.GetValueSource('label'), PropertyValueSource.Default);
        assert.equal(view.get_property_value('label'), '');     // default
        assert.equal(listener_count(desk, 'label'), 0);          // chain cleaned up
    });

    test('after ClearValue, a subsequent set_property_value installs as LocalValue again', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        desk.set_property_value('label', 'first');
        desk.ClearValue('label');
        desk.set_property_value('label', 'second');
        assert.equal(desk.get_property_value('label'), 'second');
        assert.equal(desk.GetValueSource('label'), PropertyValueSource.LocalValue);
    });

    test('ClearValue throws on an unregistered property', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        assert.throws(
            () => desk.ClearValue('nope'),
            /not found in model 'Desk'/,
        );
    });

    test('GetValueSource throws on an unregistered property', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        assert.throws(
            () => desk.GetValueSource('nope'),
            /not found in model 'Desk'/,
        );
    });
});

// Pins property inheritance and metadata override. With the class-keyed
// registry, descriptors registered on a base class are visible to subclass
// instances; OverrideMetadata lets a subclass change individual metadata
// fields while inheriting the rest (WPF-style merge).
describe('Property inheritance and metadata override', () => {
    test('a subclass instance reads its base class default for an inherited property', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        Model.RegisterProperty(Furniture, 'label', 'base-default', MetaData.Render);

        const desk = new Desk();
        assert.equal(desk.get_property_value('label'), 'base-default');
    });

    test('a subclass instance can set an inherited property and read it back', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        Model.RegisterProperty(Furniture, 'label', '', MetaData.Render);

        const desk = new Desk();
        desk.set_property_value('label', 'on-desk');
        assert.equal(desk.get_property_value('label'), 'on-desk');
        assert.equal(desk.GetValueSource('label'), PropertyValueSource.LocalValue);
    });

    test('a subclass listener fires only for the subclass instance, not for base instances', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        Model.RegisterProperty(Furniture, 'label', '', MetaData.Render);

        const furniture = new Furniture();
        const desk = new Desk();
        let deskFires = 0;
        let furnitureFires = 0;
        desk.AddPropertyChangedListener('label', () => { deskFires++; });
        furniture.AddPropertyChangedListener('label', () => { furnitureFires++; });

        desk.set_property_value('label', 'x');
        assert.equal(deskFires, 1);
        assert.equal(furnitureFires, 0);
    });

    test('OverrideMetadata changes the default for the subclass while leaving the base class alone', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        Model.RegisterProperty(Furniture, 'label', 'furniture-default', MetaData.Render);
        Model.OverrideMetadata(Desk, 'label', { default_value: 'desk-default' });

        assert.equal(new Furniture().get_property_value('label'), 'furniture-default');
        assert.equal(new Desk().get_property_value('label'), 'desk-default');
    });

    test('OverrideMetadata inherits unspecified fields from the parent descriptor', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        const clamp_to_10: CoerceValue = (_m, v) => Math.min(v as number, 10);
        Model.RegisterProperty(Furniture, 'height', 1, MetaData.Render, clamp_to_10);

        // Override only the default; coerce + meta_data must still apply.
        Model.OverrideMetadata(Desk, 'height', { default_value: 5 });

        const desk = new Desk();
        assert.equal(desk.get_property_value('height'), 5);

        // Coerce inherited from Furniture — clamps to 10.
        desk.set_property_value('height', 100);
        assert.equal(desk.get_property_value('height'), 10);
    });

    test('OverrideMetadata can replace just the coerce callback', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        Model.RegisterProperty(Furniture, 'height', 1, MetaData.Render);

        const clamp_to_5: CoerceValue = (_m, v) => Math.min(v as number, 5);
        Model.OverrideMetadata(Desk, 'height', { coerce_value: clamp_to_5 });

        // Desk's height uses the inherited default (1) but the override's coerce.
        assert.equal(new Desk().get_property_value('height'), 1);
        const desk = new Desk();
        desk.set_property_value('height', 100);
        assert.equal(desk.get_property_value('height'), 5);

        // Furniture instances are unaffected by the override.
        const furniture = new Furniture();
        furniture.set_property_value('height', 100);
        assert.equal(furniture.get_property_value('height'), 100);
    });

    test('OverrideMetadata throws when no ancestor has registered the property', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        assert.throws(
            () => Model.OverrideMetadata(Desk, 'unknown', { default_value: 0 }),
            /Cannot override metadata for property 'unknown'/,
        );
    });

    test('OverrideMetadata can be called repeatedly, chaining through previous overrides', () => {
        class A extends Model {}
        class B extends A {}
        class C extends B {}
        Model.RegisterProperty(A, 'x', 1, MetaData.Render);
        // B overrides default only.
        Model.OverrideMetadata(B, 'x', { default_value: 2 });
        // C overrides default only too; should NOT fall back to A because B is the nearer ancestor.
        Model.OverrideMetadata(C, 'x', { default_value: 3 });

        assert.equal(new A().get_property_value('x'), 1);
        assert.equal(new B().get_property_value('x'), 2);
        assert.equal(new C().get_property_value('x'), 3);
    });

    test('subclass binding works for an inherited property without re-registration', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        class View extends Model {}
        Model.RegisterProperty(Furniture, 'label', '', MetaData.Render);
        Model.RegisterProperty(View, 'label', '', MetaData.Render);

        const desk = new Desk();
        desk.set_property_value('label', 'on-desk');

        const view = new View();
        view.set_property_value('label', new Binding(desk, 'label'));
        assert.equal(view.get_property_value('label'), 'on-desk');

        desk.set_property_value('label', 'on-desk-2');
        assert.equal(view.get_property_value('label'), 'on-desk-2');
    });

    test('OverrideMetadata that adds a default fires the subclass default through subsequent get_property_value', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        Model.RegisterProperty(Furniture, 'label', 'furniture', MetaData.Render);
        Model.OverrideMetadata(Desk, 'label', { default_value: 'desk' });

        const desk = new Desk();
        // No set — descriptor walk finds Desk's overridden default.
        assert.equal(desk.get_property_value('label'), 'desk');
        assert.equal(desk.GetValueSource('label'), PropertyValueSource.Default);
    });
});

// Pins backlog item 4.1: MetaData is now a flag enum, so callers can
// combine layout-affecting flags with the bitwise-OR operator. Predicates
// affectsMeasure / affectsArrange / affectsRender provide readable checks.
describe('MetaData flag enum', () => {
    test('enum values are distinct powers of two so they can be OR-combined', () => {
        assert.equal(MetaData.None, 0);
        assert.equal(MetaData.Measure, 1);
        assert.equal(MetaData.Arrange, 2);
        assert.equal(MetaData.Render, 4);
    });

    test('predicates report true only for the flags actually set', () => {
        assert.equal(affectsMeasure(MetaData.Measure), true);
        assert.equal(affectsArrange(MetaData.Measure), false);
        assert.equal(affectsRender(MetaData.Measure), false);

        assert.equal(affectsMeasure(MetaData.Render), false);
        assert.equal(affectsRender(MetaData.Render), true);
    });

    test('combined flags are recognized by every predicate that applies', () => {
        const combined = MetaData.Measure | MetaData.Render;
        assert.equal(affectsMeasure(combined), true);
        assert.equal(affectsRender(combined), true);
        assert.equal(affectsArrange(combined), false);
    });

    test('all three flags can be combined and all predicates report true', () => {
        const all = MetaData.Measure | MetaData.Arrange | MetaData.Render;
        assert.equal(affectsMeasure(all), true);
        assert.equal(affectsArrange(all), true);
        assert.equal(affectsRender(all), true);
    });

    test('MetaData.None reports false for every predicate', () => {
        assert.equal(affectsMeasure(MetaData.None), false);
        assert.equal(affectsArrange(MetaData.None), false);
        assert.equal(affectsRender(MetaData.None), false);
    });

    test('a property registered with combined flags preserves them on the descriptor', () => {
        class Box extends Model {}
        Model.RegisterProperty(
            Box,
            'width',
            0,
            MetaData.Measure | MetaData.Arrange,
        );

        // Walk the registry the same way Model does internally to read the
        // descriptor's MetaData back; ensure both flags survived storage.
        const proto = (Model as unknown as {
            property_bags: WeakMap<Function, Map<string, { MetaData: MetaData }>>;
        }).property_bags;
        const descriptor = proto.get(Box)?.get('width');
        assert.notEqual(descriptor, undefined);
        assert.equal(affectsMeasure(descriptor!.MetaData), true);
        assert.equal(affectsArrange(descriptor!.MetaData), true);
        assert.equal(affectsRender(descriptor!.MetaData), false);
    });
});

// Pins Visual's invalidation behavior. A subclass exposes counters so we
// can assert which hooks fired for each kind of property change.
describe('Visual invalidation routing', () => {
    class TestVisual extends Model
    {
        measure_fires = 0;
        arrange_fires = 0;
        render_fires = 0;
        protected override MarkMeasureDirty(): void { this.measure_fires++; }
        protected override MarkArrangeDirty(): void { this.arrange_fires++; }
        protected override MarkRenderDirty(): void  { this.render_fires++; }
    }

    test('property with MetaData.Measure fires only MarkMeasureDirty', () => {
        Model.RegisterProperty(TestVisual, 'measure_only', 0, MetaData.Measure);
        const v = new TestVisual();
        v.set_property_value('measure_only', 5);
        assert.equal(v.measure_fires, 1);
        assert.equal(v.arrange_fires, 0);
        assert.equal(v.render_fires, 0);
    });

    test('property with MetaData.Render fires only MarkRenderDirty', () => {
        Model.RegisterProperty(TestVisual, 'render_only', 0, MetaData.Render);
        const v = new TestVisual();
        v.set_property_value('render_only', 5);
        assert.equal(v.measure_fires, 0);
        assert.equal(v.arrange_fires, 0);
        assert.equal(v.render_fires, 1);
    });

    test('property with combined Measure | Arrange | Render fires all three hooks', () => {
        Model.RegisterProperty(
            TestVisual,
            'all_flags',
            0,
            MetaData.Measure | MetaData.Arrange | MetaData.Render,
        );
        const v = new TestVisual();
        v.set_property_value('all_flags', 5);
        assert.equal(v.measure_fires, 1);
        assert.equal(v.arrange_fires, 1);
        assert.equal(v.render_fires, 1);
    });

    test('property with MetaData.None fires no hooks', () => {
        Model.RegisterProperty(TestVisual, 'no_flags', 0, MetaData.None);
        const v = new TestVisual();
        v.set_property_value('no_flags', 5);
        assert.equal(v.measure_fires, 0);
        assert.equal(v.arrange_fires, 0);
        assert.equal(v.render_fires, 0);
    });

    test('set_property_value still throws on unregistered property (no hooks fired)', () => {
        const v = new TestVisual();
        assert.throws(() => v.set_property_value('missing', 1));
        assert.equal(v.measure_fires, 0);
        assert.equal(v.arrange_fires, 0);
        assert.equal(v.render_fires, 0);
    });

    test('Visual still behaves as a Model: get/set roundtrip and listener fan-out work', () => {
        Model.RegisterProperty(TestVisual, 'count', 7, MetaData.Render);
        const v = new TestVisual();
        let listener_fires = 0;
        v.AddPropertyChangedListener('count', () => { listener_fires++; });
        assert.equal(v.get_property_value('count'), 7);
        v.set_property_value('count', 42);
        assert.equal(v.get_property_value('count'), 42);
        assert.equal(listener_fires, 1);
        assert.equal(v.render_fires, 1);
    });

    test('inherited properties are invalidated correctly via the metadata walk', () => {
        class BaseVisual extends TestVisual {}
        class DerivedVisual extends BaseVisual {}
        Model.RegisterProperty(BaseVisual, 'thickness', 0, MetaData.Arrange);

        const derived = new DerivedVisual();
        derived.set_property_value('thickness', 3);
        assert.equal(derived.arrange_fires, 1);
        assert.equal(derived.measure_fires, 0);
        assert.equal(derived.render_fires, 0);
    });

    test('binding-driven update invalidates the consumer Visual', () => {
        // The consumer Visual is bound to a source Model's leaf property.
        // Mutating the source pushes the new resolved value through the
        // Binding, which fires the consumer's EVD.OnPropertyChange — the
        // invalidation must fire even though set_property_value was never
        // called on the Visual.
        class Source extends Model {}
        Model.RegisterProperty(Source, 'label', '', MetaData.None);
        Model.RegisterProperty(TestVisual, 'bound_label', '', MetaData.Render);

        const source = new Source();
        source.set_property_value('label', 'initial');
        const v = new TestVisual();
        v.set_property_value('bound_label', new Binding(source, 'label'));
        // install fires render invalidation once
        assert.equal(v.render_fires, 1);

        source.set_property_value('label', 'changed');
        // binding push must have fired render invalidation a second time
        assert.equal(v.render_fires, 2);
    });

    test('ClearValue invalidates when the effective value differs from the default', () => {
        Model.RegisterProperty(TestVisual, 'cleared_prop', 'default', MetaData.Render);
        const v = new TestVisual();
        v.set_property_value('cleared_prop', 'set');
        assert.equal(v.render_fires, 1);

        v.ClearValue('cleared_prop');
        // Effective value went from 'set' to 'default' — invalidation fires.
        assert.equal(v.render_fires, 2);
        assert.equal(v.get_property_value('cleared_prop'), 'default');
    });

    test('ClearValue does NOT invalidate when the property was never set', () => {
        Model.RegisterProperty(TestVisual, 'never_set', 0, MetaData.Render);
        const v = new TestVisual();
        // EVD created lazily when ClearValue is called, but value never
        // changed (default → default), so EVD.OnPropertyChange does not fire.
        v.ClearValue('never_set');
        assert.equal(v.render_fires, 0);
    });

    test('per-instance listeners and Visual invalidation co-exist without polluting listener_count', () => {
        Model.RegisterProperty(TestVisual, 'count', 0, MetaData.Render);
        const v = new TestVisual();
        let user_fires = 0;
        v.AddPropertyChangedListener('count', () => { user_fires++; });

        // listener_count counts only user-facing listeners, not the
        // internal callback the Model uses to route onPropertyChanged.
        assert.equal(listener_count(v, 'count'), 1);

        v.set_property_value('count', 5);
        assert.equal(user_fires, 1);
        assert.equal(v.render_fires, 1);
    });
});

describe('Visual (base) is a leaf', () => {
    test('new Visual has no parent', () => {
        const v = new Model();
        assert.equal(parent_of(v), undefined);
    });

    test('a Visual leaf can be attached to a Panel and reports it via Parent', () => {
        const parent = new PanelBase();
        const leaf = new Model();
        parent.AddChild(leaf);
        assert.equal(parent_of(leaf), parent);
    });
});

describe('Panel tree construction (multi-child)', () => {
    test('a new Panel has no parent and no children', () => {
        const p = new PanelBase();
        assert.equal(parent_of(p), undefined);
        assert.deepEqual(p.children, []);
    });

    test('addChild sets the child Parent and appends to Children in order', () => {
        const parent = new PanelBase();
        const a = new Model();
        const b = new Model();
        parent.AddChild(a);
        parent.AddChild(b);
        assert.equal(parent_of(a), parent);
        assert.equal(parent_of(b), parent);
        assert.deepEqual(parent.children, [a, b]);
    });

    test('removeChild clears Parent and removes from Children', () => {
        const parent = new PanelBase();
        const child = new Model();
        parent.AddChild(child);
        parent.RemoveChild(child);
        assert.equal(parent_of(child), undefined);
        assert.deepEqual(parent.children, []);
    });

    test('throws when adding a Visual that already has a parent', () => {
        const a = new PanelBase();
        const b = new PanelBase();
        const child = new Model();
        a.AddChild(child);
        assert.throws(() => b.AddChild(child), /already has a parent/);
    });

    test('throws when adding self as a child', () => {
        const p = new PanelBase();
        assert.throws(() => p.AddChild(p), /own child/);
    });

    test('removeChild is a silent no-op when the visual is not actually a child', () => {
        const parent = new PanelBase();
        const stranger = new Model();
        parent.RemoveChild(stranger);
        assert.deepEqual(parent.children, []);
        assert.equal(parent_of(stranger), undefined);
    });

    test('walks up a three-level Panel tree via Parent', () => {
        const root = new PanelBase();
        const middle = new PanelBase();
        const leaf = new Model();
        root.AddChild(middle);
        middle.AddChild(leaf);
        assert.equal(parent_of(leaf), middle);
        assert.equal(parent_of(parent_of(leaf)), root);
        assert.equal(parent_of(parent_of(parent_of(leaf))), undefined);
    });

    test('detach-then-attach lets a Visual join a new parent cleanly', () => {
        const a = new PanelBase();
        const b = new PanelBase();
        const child = new Model();
        a.AddChild(child);
        a.RemoveChild(child);
        b.AddChild(child);
        assert.equal(parent_of(child), b);
        assert.deepEqual(a.children, []);
        assert.deepEqual(b.children, [child]);
    });

    test('removeChild preserves order of remaining children', () => {
        const parent = new PanelBase();
        const a = new Model();
        const b = new Model();
        const c = new Model();
        parent.AddChild(a);
        parent.AddChild(b);
        parent.AddChild(c);
        parent.RemoveChild(b);
        assert.deepEqual(parent.children, [a, c]);
    });
});

describe('Single tree construction (one-child slot)', () => {
    test('a new Single has no parent and no child', () => {
        const s = new Single();
        assert.equal(parent_of(s), undefined);
        assert.equal(s.child, undefined);
    });

    test('setChild attaches the child and exposes it via child', () => {
        const s = new Single();
        const c = new Model();
        s.SetChild(c);
        assert.equal(s.child, c);
        assert.equal(parent_of(c), s);
    });

    test('setChild(undefined) detaches the current child', () => {
        const s = new Single();
        const c = new Model();
        s.SetChild(c);
        s.SetChild(undefined);
        assert.equal(s.child, undefined);
        assert.equal(parent_of(c), undefined);
    });

    test('setChild replaces the existing child, detaching the previous one', () => {
        const s = new Single();
        const a = new Model();
        const b = new Model();
        s.SetChild(a);
        s.SetChild(b);
        assert.equal(s.child, b);
        assert.equal(parent_of(b), s);
        assert.equal(parent_of(a), undefined);
    });

    test('setChild is a no-op when called with the same child', () => {
        const s = new Single();
        const c = new Model();
        s.SetChild(c);
        s.SetChild(c);
        assert.equal(s.child, c);
        assert.equal(parent_of(c), s);
    });

    test('setChild throws when the child already has a different parent', () => {
        const owner = new PanelBase();
        const child = new Model();
        owner.AddChild(child);

        const s = new Single();
        assert.throws(() => s.SetChild(child), /already has a parent/);
    });

    test('setChild throws when assigning self as child', () => {
        const s = new Single();
        assert.throws(() => s.SetChild(s), /own child/);
    });

    test('Single nested inside Panel forms a mixed tree', () => {
        const root = new PanelBase();
        const wrapper = new Single();
        const leaf = new Model();
        root.AddChild(wrapper);
        wrapper.SetChild(leaf);

        assert.equal(parent_of(leaf), wrapper);
        assert.equal(parent_of(parent_of(leaf)), root);
        assert.deepEqual(root.children, [wrapper]);
        assert.equal(wrapper.child, leaf);
    });
});

// Pins backlog item 1.5: property value inheritance. Properties marked
// MetaData.Inherits resolve via the parent chain when no local override
// is set. Cached on each descendant's EVD with PropertyValueSource.InheritedValue
// and refreshed on Attach/Detach and on ancestor mutation.
describe('Property value inheritance', () => {
    test('inherits flag value and predicate', () => {
        assert.equal(MetaData.Inherits, 8);
        assert.equal(inherits(MetaData.Inherits), true);
        assert.equal(inherits(MetaData.None), false);
        assert.equal(inherits(MetaData.Inherits | MetaData.Render), true);
    });

    test('a child reads its parent local value through inheritance after Attach', () => {
        class Surface extends PanelBase {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const parent = new Surface();
        parent.set_property_value('fontSize', 20);
        const child = new Surface();
        parent.AddChild(child);

        assert.equal(child.get_property_value('fontSize'), 20);
        assert.equal(child.GetValueSource('fontSize'), PropertyValueSource.InheritedValue);
    });

    test('a detached Model with no parent falls back to descriptor default', () => {
        class Surface extends PanelBase {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);
        const orphan = new Surface();
        assert.equal(orphan.get_property_value('fontSize'), 10);
        assert.equal(orphan.GetValueSource('fontSize'), PropertyValueSource.Default);
    });

    test('a local override on the child shadows the inherited value', () => {
        class Surface extends PanelBase {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const parent = new Surface();
        parent.set_property_value('fontSize', 20);
        const child = new Surface();
        parent.AddChild(child);

        child.set_property_value('fontSize', 99);
        assert.equal(child.get_property_value('fontSize'), 99);
        assert.equal(child.GetValueSource('fontSize'), PropertyValueSource.LocalValue);

        // Changing the ancestor must NOT alter the overridden child.
        parent.set_property_value('fontSize', 30);
        assert.equal(child.get_property_value('fontSize'), 99);
    });

    test('Detach clears the inherited cache; reattach picks up the new parent value', () => {
        class Surface extends PanelBase {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const a = new Surface();
        a.set_property_value('fontSize', 20);
        const b = new Surface();
        b.set_property_value('fontSize', 30);
        const child = new Surface();

        a.AddChild(child);
        assert.equal(child.get_property_value('fontSize'), 20);

        a.RemoveChild(child);
        assert.equal(child.get_property_value('fontSize'), 10);
        assert.equal(child.GetValueSource('fontSize'), PropertyValueSource.Default);

        b.AddChild(child);
        assert.equal(child.get_property_value('fontSize'), 30);
    });

    test('ancestor mutation cascades down through a multi-level tree', () => {
        class Surface extends PanelBase {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const mid = new Surface();
        const leaf = new Surface();
        root.AddChild(mid);
        mid.AddChild(leaf);

        root.set_property_value('fontSize', 16);
        assert.equal(mid.get_property_value('fontSize'), 16);
        assert.equal(leaf.get_property_value('fontSize'), 16);
        assert.equal(leaf.GetValueSource('fontSize'), PropertyValueSource.InheritedValue);
    });

    test('a local override boundary stops the cascade for the subtree beyond it', () => {
        class Surface extends PanelBase {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const mid = new Surface();
        const leaf = new Surface();
        root.AddChild(mid);
        mid.AddChild(leaf);

        // Mid takes an explicit override; leaf inherits from mid.
        mid.set_property_value('fontSize', 99);
        assert.equal(leaf.get_property_value('fontSize'), 99);

        // Changing root must NOT reach leaf — mid's override blocks the cascade.
        root.set_property_value('fontSize', 16);
        assert.equal(mid.get_property_value('fontSize'), 99);
        assert.equal(leaf.get_property_value('fontSize'), 99);
    });

    test('a listener on the child fires when an ancestor changes the inherited value', () => {
        class Surface extends PanelBase {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const child = new Surface();
        root.AddChild(child);

        const captures: Array<[unknown, unknown]> = [];
        child.AddPropertyChangedListener(
            'fontSize',
            (_m, _p, o, n) => { captures.push([o, n]); },
        );

        root.set_property_value('fontSize', 16);
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![0], 10);   // was default
        assert.equal(captures[0]![1], 16);   // now inherited 16
    });

    test('a binding on the ancestor exposes the resolved value, not the Binding instance, to descendants', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);

        class Surface extends PanelBase {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const source = new Source();
        source.set_property_value('value', 42);

        const root = new Surface();
        root.set_property_value('fontSize', new Binding(source, 'value'));
        const child = new Surface();
        root.AddChild(child);

        // Child sees a number, not a Binding object.
        assert.equal(child.get_property_value('fontSize'), 42);
        assert.equal(child.GetValueSource('fontSize'), PropertyValueSource.InheritedValue);

        // When the binding's source changes, the resolved value propagates.
        source.set_property_value('value', 100);
        assert.equal(child.get_property_value('fontSize'), 100);
    });

    test('ClearValue on an ancestor cascades descendants back to the default', () => {
        class Surface extends PanelBase {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const child = new Surface();
        root.AddChild(child);

        root.set_property_value('fontSize', 16);
        assert.equal(child.get_property_value('fontSize'), 16);

        root.ClearValue('fontSize');
        assert.equal(child.get_property_value('fontSize'), 10);
        assert.equal(child.GetValueSource('fontSize'), PropertyValueSource.Default);
    });

    test('a non-inheritable property does not propagate at all', () => {
        class Surface extends PanelBase {}
        Model.RegisterProperty(Surface, 'plain', 'default', MetaData.None);

        const root = new Surface();
        const child = new Surface();
        root.AddChild(child);

        root.set_property_value('plain', 'set-on-root');
        // Child still reads its own default, never the ancestor's value.
        assert.equal(child.get_property_value('plain'), 'default');
        assert.equal(child.GetValueSource('plain'), PropertyValueSource.Default);
    });
});

// Pins backlog item 5.1: attached / cross-class property usage. Any
// property registered on any class can be set on any Model instance
// via the explicit-owner overload — storage uses a composite key so
// values from different owners don't collide. WPF-style attached
// properties (Grid.Row="2") and WPF-style cross-class inheritance
// (TextBlock.FontSize="14" on a <Border>) both use this single
// mechanism.
describe('Cross-class / attached properties', () => {
    test('explicit-owner set/get works for a property not in target class hierarchy', () => {
        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.None);

        class Border extends Single {}

        const b = new Border();
        b.set_property_value(TextBlock, 'fontSize', 14);
        assert.equal(b.get_property_value(TextBlock, 'fontSize'), 14);
    });

    test('implicit-owner accessor throws for a property the target class does not know', () => {
        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.None);
        class Border extends Single {}

        const b = new Border();
        assert.throws(
            () => b.set_property_value('fontSize', 14),
            /not found in model 'Border'/,
        );
    });

    test('explicit-owner accessor throws when the owner does not have the property', () => {
        class TextBlock extends Model {}
        // fontSize not registered.
        const b = new Model();
        assert.throws(
            () => b.set_property_value(TextBlock, 'fontSize', 14),
            /not found on owner 'TextBlock'/,
        );
    });

    test('default value comes from the owner descriptor', () => {
        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.None);
        class Border extends Single {}

        const b = new Border();
        assert.equal(b.get_property_value(TextBlock, 'fontSize'), 12);
        assert.equal(b.GetValueSource(TextBlock, 'fontSize'), PropertyValueSource.Default);
    });

    test('two different owners can register a same-named property without collision', () => {
        class Foo extends Model {}
        class Bar extends Model {}
        Model.RegisterProperty(Foo, 'value', 'foo-default', MetaData.None);
        Model.RegisterProperty(Bar, 'value', 'bar-default', MetaData.None);

        const target = new Model();
        target.set_property_value(Foo, 'value', 'set-via-foo');
        target.set_property_value(Bar, 'value', 'set-via-bar');

        assert.equal(target.get_property_value(Foo, 'value'), 'set-via-foo');
        assert.equal(target.get_property_value(Bar, 'value'), 'set-via-bar');
    });

    test('listener registered with explicit-owner overload fires for that (owner, name) pair only', () => {
        class Foo extends Model {}
        class Bar extends Model {}
        Model.RegisterProperty(Foo, 'value', 0, MetaData.None);
        Model.RegisterProperty(Bar, 'value', 0, MetaData.None);

        const target = new Model();
        let fooFires = 0;
        let barFires = 0;
        target.AddPropertyChangedListener(Foo, 'value', () => { fooFires++; });
        target.AddPropertyChangedListener(Bar, 'value', () => { barFires++; });

        target.set_property_value(Foo, 'value', 1);
        assert.equal(fooFires, 1);
        assert.equal(barFires, 0);

        target.set_property_value(Bar, 'value', 2);
        assert.equal(fooFires, 1);
        assert.equal(barFires, 1);
    });

    test('ClearValue on an explicitly-owned property resets it to the owner default', () => {
        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.None);
        const b = new Model();
        b.set_property_value(TextBlock, 'fontSize', 99);
        assert.equal(b.get_property_value(TextBlock, 'fontSize'), 99);

        b.ClearValue(TextBlock, 'fontSize');
        assert.equal(b.get_property_value(TextBlock, 'fontSize'), 12);
        assert.equal(b.GetValueSource(TextBlock, 'fontSize'), PropertyValueSource.Default);
    });

    test('Inherits cascades a cross-class property through descendants set on the ancestor', () => {
        // TextBlock.fontSize is the inheriting property; the value is
        // SET on a Border (an ancestor in the visual tree) that doesn't
        // know about TextBlock. Descendants that walk up find it.
        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.Inherits);

        class Border extends PanelBase {}

        const border = new Border();
        const child = new Model();
        border.AddChild(child);

        border.set_property_value(TextBlock, 'fontSize', 16);
        assert.equal(child.get_property_value(TextBlock, 'fontSize'), 16);
        assert.equal(child.GetValueSource(TextBlock, 'fontSize'), PropertyValueSource.InheritedValue);
    });

    test('Binding on a cross-class property pushes the resolved value to the consumer', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);

        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.None);

        const source = new Source();
        source.set_property_value('value', 18);

        const consumer = new Model();
        const captures: Array<[unknown, unknown]> = [];
        consumer.AddPropertyChangedListener(
            TextBlock,
            'fontSize',
            (_m, _p, o, n) => { captures.push([o, n]); },
        );

        consumer.set_property_value(TextBlock, 'fontSize', new Binding(source, 'value'));
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![1], 18);

        source.set_property_value('value', 22);
        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 18);
        assert.equal(captures[1]![1], 22);
    });

    test('RegisterAttachedProperty is a synonym for RegisterProperty', () => {
        class Grid extends PanelBase {}
        Model.RegisterAttachedProperty(Grid, 'Row', 0, MetaData.Arrange);

        const button = new Model();
        button.set_property_value(Grid, 'Row', 3);
        assert.equal(button.get_property_value(Grid, 'Row'), 3);
    });

    test('registering a property whose name contains "." is rejected', () => {
        class Bad extends Model {}
        assert.throws(
            () => Model.RegisterProperty(Bad, 'has.dot', 0, MetaData.None),
            /may not contain '\.'/,
        );
    });
});

// Pins backlog item 3.4 / 3.9: target-side writes flow through an
// installed TwoWay / OneWayToSource binding to the source instead of
// silently replacing the binding. This is WPF's PropertyChanged
// UpdateSourceTrigger semantic — the most common way TwoWay binding
// gets used.
describe('Target-side writeback through TwoWay / OneWayToSource bindings', () => {
    test('writing to a property holding a TwoWay binding updates the source', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        view.set_property_value('label', 'user-typed');

        assert.equal(desk.get_property_value('label'), 'user-typed');
        // Binding stays installed — the source is the canonical reference.
        assert.equal(view.GetValueSource('label'), PropertyValueSource.Binding);
    });

    test('writing to a property holding a OneWayToSource binding updates the source', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.OneWayToSource),
        );

        view.set_property_value('label', 'pushed');

        assert.equal(desk.get_property_value('label'), 'pushed');
        assert.equal(view.GetValueSource('label'), PropertyValueSource.Binding);
    });

    test('consumer listener fires exactly once with the right (old, new) transition', () => {
        const { company, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(
            'label',
            (_m, _p, o, n) => { captures.push([o, n]); },
        );

        view.set_property_value('label', 'typed-by-user');
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![0], 'desk-1');
        assert.equal(captures[0]![1], 'typed-by-user');
    });

    test('source-side listener also fires for the writeback', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        let sourceFires = 0;
        desk.AddPropertyChangedListener('label', () => { sourceFires++; });

        view.set_property_value('label', 'typed-by-user');
        assert.equal(sourceFires, 1);
    });

    test('OneWay binding is still replaced by a target-side write (regression guard)', () => {
        const { company, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label'), // default OneWay
        );

        view.set_property_value('label', 'local-override');
        assert.equal(view.get_property_value('label'), 'local-override');
        assert.equal(view.GetValueSource('label'), PropertyValueSource.LocalValue);
    });

    test('TwoWay writeback through a deep chain reaches the leaf', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        view.set_property_value('label', 'deep-write');
        assert.equal(desk.get_property_value('label'), 'deep-write');
        assert.equal(view.get_property_value('label'), 'deep-write');
        // Binding still installed.
        assert.equal(view.GetValueSource('label'), PropertyValueSource.Binding);
    });

    test('writeback failure (severed intermediate) falls back to local-replace', () => {
        // Sever the chain so binding.set_value will return false, then write.
        const { company, manager, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        manager.set_property_value('office', null); // path is now unwritable
        view.set_property_value('label', 'cannot-reach-desk');

        // Source desk is untouched (writeback failed).
        assert.equal(desk.get_property_value('label'), 'desk-1');
        // The binding got replaced as a local value so the user's write
        // isn't silently lost.
        assert.equal(view.GetValueSource('label'), PropertyValueSource.LocalValue);
        assert.equal(view.get_property_value('label'), 'cannot-reach-desk');
    });

    test('installing a new Binding replaces the old one (regression guard)', () => {
        // The TwoWay writeback path must not apply when the new value
        // IS a Binding — that branch should still install/replace.
        const { Company, Department, Manager, Office, Desk, company, ViewModel } = buildScene();
        const view = new ViewModel();
        view.set_property_value(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        // Build a second graph and bind to its leaf.
        const desk2 = new Desk();
        desk2.set_property_value('label', 'second-graph');
        const office2 = new Office();
        office2.set_property_value('desk', desk2);
        const manager2 = new Manager();
        manager2.set_property_value('office', office2);
        const department2 = new Department();
        department2.set_property_value('manager', manager2);
        const company2 = new Company();
        company2.set_property_value('department', department2);

        view.set_property_value(
            'label',
            new Binding(company2, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        assert.equal(view.get_property_value('label'), 'second-graph');
    });
});

// Pins backlog item 6.1: attached-property syntax in PropertyPath.
// Paths can now address attached / cross-class properties via the
// WPF syntax `(OwnerType.Property)`. Mixes freely with regular dotted
// segments and indexed accessors. Owner classes are resolved by name
// through Model's class registry (populated automatically by
// RegisterProperty).
describe('PropertyPath attached-property syntax', () => {
    test('a single-segment attached path resolves through Model.find_class', () => {
        class Grid extends Model {}
        Model.RegisterProperty(Grid, 'Row', 0, MetaData.None);

        const button = new Model();
        button.set_property_value(Grid, 'Row', 5);

        const binding = new Binding(button, '(Grid.Row)');
        assert.equal(binding.get_value(), 5);
    });

    test('an attached segment mixes with regular dotted segments', () => {
        class Grid extends Model {}
        Model.RegisterProperty(Grid, 'Row', 0, MetaData.None);

        // Build a tiny graph: root.child has Grid.Row = 7 set on it.
        class Box extends Model {}
        Model.RegisterProperty(Box, 'child', null, MetaData.None);

        const child = new Model();
        child.set_property_value(Grid, 'Row', 7);
        const root = new Box();
        root.set_property_value('child', child);

        const binding = new Binding(root, 'child.(Grid.Row)');
        assert.equal(binding.get_value(), 7);
    });

    test('a regular segment mixes after an attached segment', () => {
        class Holder extends Model {}
        class Inner extends Model {}
        Model.RegisterProperty(Holder, 'Bag', null, MetaData.None);
        Model.RegisterProperty(Inner, 'value', 0, MetaData.None);

        const inner = new Inner();
        inner.set_property_value('value', 99);

        const target = new Model();
        target.set_property_value(Holder, 'Bag', inner);

        const binding = new Binding(target, '(Holder.Bag).value');
        assert.equal(binding.get_value(), 99);
    });

    test('push notification fires when the attached value changes on the source', () => {
        class Grid extends Model {}
        Model.RegisterProperty(Grid, 'Row', 0, MetaData.None);

        class ViewModel extends Model {}
        Model.RegisterProperty(ViewModel, 'echoed', 0, MetaData.None);

        const button = new Model();
        button.set_property_value(Grid, 'Row', 1);

        const view = new ViewModel();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(
            'echoed',
            (_m, _p, o, n) => { captures.push([o, n]); },
        );

        view.set_property_value('echoed', new Binding(button, '(Grid.Row)'));
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![1], 1);

        button.set_property_value(Grid, 'Row', 9);
        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 1);
        assert.equal(captures[1]![1], 9);
    });

    test('TwoWay writeback through an attached-segment path reaches the leaf', () => {
        class Grid extends Model {}
        Model.RegisterProperty(Grid, 'Row', 0, MetaData.None);

        class ViewModel extends Model {}
        Model.RegisterProperty(ViewModel, 'editable', 0, MetaData.None);

        const button = new Model();

        const view = new ViewModel();
        view.set_property_value(
            'editable',
            new Binding(button, '(Grid.Row)', BindingMode.TwoWay),
        );

        view.set_property_value('editable', 11);
        assert.equal(button.get_property_value(Grid, 'Row'), 11);
    });

    test('unknown owner class in the path resolves to undefined', () => {
        class Anchor extends Model {}
        Model.RegisterProperty(Anchor, 'value', 'anchored', MetaData.None);
        // Note: nothing named 'NotRegistered' has been registered.

        const target = new Anchor();
        const binding = new Binding(target, '(NotRegistered.value)');
        assert.equal(binding.get_value(), undefined);
    });

    test('malformed attached segment (no dot inside parens) throws at parse time', () => {
        assert.throws(
            () => new Binding(new Model(), '(NoDotHere)'),
            /Invalid attached-property segment/,
        );
    });

    test('parse handles indexed access after an attached segment', () => {
        class Holder extends Model {}
        Model.RegisterProperty(Holder, 'List', null, MetaData.None);

        const target = new Model();
        target.set_property_value(Holder, 'List', ['first', 'second', 'third']);

        const binding = new Binding(target, '(Holder.List)[1]');
        assert.equal(binding.get_value(), 'second');
    });
});

// Pins backlog item 1.6: read-only properties. The declaring class
// gets a PropertyKey back from RegisterReadOnlyProperty; only the
// holder of the key can write the property. External code can read it
// and bind to it normally — exactly the WPF pattern used for derived
// properties like ActualWidth / IsMouseOver.
describe('Read-only properties', () => {
    test('RegisterReadOnlyProperty returns a key whose descriptor matches', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        assert.ok(key instanceof PropertyKey);
        assert.equal(key.descriptor.Name, 'actualWidth');
        assert.equal(key.descriptor.IsReadOnly, true);
    });

    test('get_property_value works without the key', () => {
        class Widget extends Model {}
        Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 42, MetaData.None);
        const w = new Widget();
        assert.equal(w.get_property_value('actualWidth'), 42);
    });

    test('public set_property_value (implicit owner) throws on a read-only property', () => {
        class Widget extends Model {}
        Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Widget();
        assert.throws(
            () => w.set_property_value('actualWidth', 100),
            /is read-only/,
        );
    });

    test('public set_property_value (explicit owner) throws on a read-only property', () => {
        class Widget extends Model {}
        Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Model();
        assert.throws(
            () => w.set_property_value(Widget, 'actualWidth', 100),
            /is read-only/,
        );
    });

    test('set_property_value_with_key bypasses the gate and writes the value', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Widget();

        w.set_property_value_with_key(key, 250);
        assert.equal(w.get_property_value('actualWidth'), 250);
        assert.equal(w.GetValueSource('actualWidth'), PropertyValueSource.LocalValue);
    });

    test('public ClearValue throws on a read-only property; ClearValueWithKey works', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Widget();
        w.set_property_value_with_key(key, 250);

        assert.throws(() => w.ClearValue('actualWidth'), /is read-only/);
        w.ClearValueWithKey(key);
        assert.equal(w.get_property_value('actualWidth'), 0);
        assert.equal(w.GetValueSource('actualWidth'), PropertyValueSource.Default);
    });

    test('listeners fire when the property is written via the key', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Widget();
        const captures: Array<[unknown, unknown]> = [];
        w.AddPropertyChangedListener(
            'actualWidth',
            (_m, _p, o, n) => { captures.push([o, n]); },
        );

        w.set_property_value_with_key(key, 100);
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![0], 0);
        assert.equal(captures[0]![1], 100);
    });

    test('a OneWay binding can READ a read-only property as its source', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const widget = new Widget();
        widget.set_property_value_with_key(key, 320);

        class Consumer extends Model {}
        Model.RegisterProperty(Consumer, 'echoed', 0, MetaData.None);
        const consumer = new Consumer();
        consumer.set_property_value('echoed', new Binding(widget, 'actualWidth'));

        assert.equal(consumer.get_property_value('echoed'), 320);

        // Source updates push through too.
        widget.set_property_value_with_key(key, 640);
        assert.equal(consumer.get_property_value('echoed'), 640);
    });

    test('installing a Binding on a read-only consumer property is blocked via public API', () => {
        class Widget extends Model {}
        Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);

        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);
        const src = new Source();

        const w = new Widget();
        assert.throws(
            () => w.set_property_value('actualWidth', new Binding(src, 'value')),
            /is read-only/,
        );
    });

    test('the owner can install a Binding on a read-only property via the key', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);

        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);
        const src = new Source();
        src.set_property_value('value', 555);

        const w = new Widget();
        w.set_property_value_with_key(key, new Binding(src, 'value'));
        assert.equal(w.get_property_value('actualWidth'), 555);
        assert.equal(w.GetValueSource('actualWidth'), PropertyValueSource.Binding);
    });

    test('OverrideMetadata on a read-only property preserves the read-only flag', () => {
        class Base extends Model {}
        Model.RegisterReadOnlyProperty(Base, 'computed', 0, MetaData.None);
        class Derived extends Base {}
        Model.OverrideMetadata(Derived, 'computed', { default_value: 99 });

        const d = new Derived();
        assert.equal(d.get_property_value('computed'), 99);  // override default applies
        assert.throws(
            () => d.set_property_value('computed', 1),
            /is read-only/,
        );
    });

    test('re-registering a property (read-only or not) under an existing name throws for read-only', () => {
        class Widget extends Model {}
        Model.RegisterReadOnlyProperty(Widget, 'computed', 0, MetaData.None);
        assert.throws(
            () => Model.RegisterReadOnlyProperty(Widget, 'computed', 0, MetaData.None),
            /already registered/,
        );
    });
});

// Pins backlog item 3.2: FallbackValue / TargetNullValue on Binding.
describe('Binding pipeline — FallbackValue / TargetNullValue', () => {
    test('fallbackValue substitutes when the path resolves to undefined', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'user', null, MetaData.None);
        const src = new Source();

        const b = new Binding(src, 'user.name', BindingMode.OneWay, {
            fallbackValue: 'Anonymous',
        });
        assert.equal(b.get_value(), 'Anonymous');
    });

    test('targetNullValue substitutes when the path resolves to null', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'middleName', null, MetaData.None);
        const src = new Source();
        src.set_property_value('middleName', null);

        const b = new Binding(src, 'middleName', BindingMode.OneWay, {
            targetNullValue: '—',
        });
        assert.equal(b.get_value(), '—');
    });

    test('no fallback/targetNull configured: raw undefined/null passes through', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'user', null, MetaData.None);
        const src = new Source();

        const b = new Binding(src, 'user.name');
        assert.equal(b.get_value(), undefined);
    });

    test('both options coexist and route by raw value type', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', undefined, MetaData.None);
        const src = new Source();

        const b = new Binding(src, 'value', BindingMode.OneWay, {
            fallbackValue: 'FALL',
            targetNullValue: 'NULL',
        });
        // default is undefined → fallback wins
        assert.equal(b.get_value(), 'FALL');
        src.set_property_value('value', null);
        assert.equal(b.get_value(), 'NULL');
        src.set_property_value('value', 'real');
        assert.equal(b.get_value(), 'real');
    });

    test('push notification: source goes undefined → consumer sees fallbackValue', () => {
        class Holder extends Model {}
        Model.RegisterProperty(Holder, 'inner', null, MetaData.None);
        class Inner extends Model {}
        Model.RegisterProperty(Inner, 'value', '', MetaData.None);

        const inner = new Inner();
        inner.set_property_value('value', 'present');
        const holder = new Holder();
        holder.set_property_value('inner', inner);

        class View extends Model {}
        Model.RegisterProperty(View, 'echoed', '', MetaData.None);
        const view = new View();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(
            'echoed',
            (_m, _p, o, n) => { captures.push([o, n]); },
        );

        view.set_property_value(
            'echoed',
            new Binding(holder, 'inner.value', BindingMode.OneWay, {
                fallbackValue: 'GONE',
            }),
        );
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![1], 'present');

        holder.set_property_value('inner', null);
        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 'present');
        assert.equal(captures[1]![1], 'GONE');
    });

    test("explicit { fallbackValue: undefined } is honored as a fallback (uses 'in' check)", () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'user', null, MetaData.None);
        const src = new Source();

        const b = new Binding(src, 'user.name', BindingMode.OneWay, {
            fallbackValue: undefined,
        });
        // Explicit undefined is still treated as configured, so the
        // substitution path runs (and substitutes undefined for
        // undefined — no-op visually but pinning the 'in' semantics).
        assert.equal(b.get_value(), undefined);
    });
});

// Pins backlog item 3.1: IValueConverter on Binding.
describe('Binding pipeline — ValueConverter', () => {
    test('converter.convert transforms the resolved value before delivery', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'celsius', 0, MetaData.None);
        const src = new Source();
        src.set_property_value('celsius', 100);

        const c2f: ValueConverter = {
            convert(v: any): any { return (v as number) * 9 / 5 + 32; },
        };
        const b = new Binding(src, 'celsius', BindingMode.OneWay, { converter: c2f });
        assert.equal(b.get_value(), 212);
    });

    test('convertBack reverses on TwoWay writeback', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'celsius', 0, MetaData.None);
        const src = new Source();

        const c2f: ValueConverter = {
            convert(v: any): any { return (v as number) * 9 / 5 + 32; },
            convertBack(v: any): any { return ((v as number) - 32) * 5 / 9; },
        };
        const b = new Binding(src, 'celsius', BindingMode.TwoWay, { converter: c2f });

        assert.equal(b.set_value(212), true);
        assert.equal(src.get_property_value('celsius'), 100);
    });

    test('TwoWay writeback with no convertBack passes value through unchanged', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', '', MetaData.None);
        const src = new Source();

        const oneWayConverter: ValueConverter = {
            convert(v: any): any { return `display:${v}`; },
            // no convertBack
        };
        const b = new Binding(src, 'value', BindingMode.TwoWay, { converter: oneWayConverter });

        b.set_value('raw');
        assert.equal(src.get_property_value('value'), 'raw');
    });

    test('converter runs before fallback in the pipeline', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);
        const src = new Source();
        src.set_property_value('value', 5);

        // Converter that returns null for 0, doubles otherwise.
        const conv: ValueConverter = {
            convert(v: any): any { return v === 0 ? null : (v as number) * 2; },
        };
        const b = new Binding(src, 'value', BindingMode.OneWay, {
            converter: conv,
            targetNullValue: 'NULL',
        });
        assert.equal(b.get_value(), 10);

        // After Convert returns null, targetNullValue substitutes.
        src.set_property_value('value', 0);
        assert.equal(b.get_value(), 'NULL');
    });

    test('push notification fires only when the post-pipeline value differs', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);
        const src = new Source();
        src.set_property_value('value', 1);

        // Converter that clamps everything to 0 or 1.
        const conv: ValueConverter = {
            convert(v: any): any { return (v as number) > 0 ? 1 : 0; },
        };
        class View extends Model {}
        Model.RegisterProperty(View, 'echoed', 0, MetaData.None);
        const view = new View();
        let fires = 0;
        view.AddPropertyChangedListener('echoed', () => { fires++; });

        view.set_property_value(
            'echoed',
            new Binding(src, 'value', BindingMode.OneWay, { converter: conv }),
        );
        // install fires once
        assert.equal(fires, 1);

        // Pre-pipeline: 1 → 5. Post-pipeline: 1 → 1 (both clamped). No fire.
        src.set_property_value('value', 5);
        assert.equal(fires, 1);

        // Pre-pipeline: 5 → 0. Post-pipeline: 1 → 0. Fires.
        src.set_property_value('value', 0);
        assert.equal(fires, 2);
    });
});

// Pins backlog item 3.3: StringFormat on Binding.
describe('Binding pipeline — StringFormat', () => {
    test("simple '{0}' substitution", () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'count', 0, MetaData.None);
        const src = new Source();
        src.set_property_value('count', 42);

        const b = new Binding(src, 'count', BindingMode.OneWay, {
            stringFormat: '$ {0}',
        });
        assert.equal(b.get_value(), '$ 42');
    });

    test('stringFormat composes after a user-supplied converter', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'name', '', MetaData.None);
        const src = new Source();
        src.set_property_value('name', 'world');

        const upper: ValueConverter = {
            convert(v: any): any { return String(v).toUpperCase(); },
        };
        const b = new Binding(src, 'name', BindingMode.OneWay, {
            converter: upper,
            stringFormat: 'Hello, {0}!',
        });
        assert.equal(b.get_value(), 'Hello, WORLD!');
    });

    test('format string without {0} placeholder yields itself literally', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'count', 0, MetaData.None);
        const src = new Source();
        src.set_property_value('count', 42);

        const b = new Binding(src, 'count', BindingMode.OneWay, {
            stringFormat: 'no-placeholder',
        });
        assert.equal(b.get_value(), 'no-placeholder');
    });

    test('stringFormat with fallback: fallback applies when raw is undefined', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'user', null, MetaData.None);
        const src = new Source();
        // user is null → user.name resolves to undefined.

        const b = new Binding(src, 'user.name', BindingMode.OneWay, {
            stringFormat: 'Hi, {0}!',
            fallbackValue: '(no user)',
        });
        // Raw → undefined. StringFormat would produce 'Hi, undefined!'.
        // Then undefined check: stringFormat already produced a string,
        // so fallback does NOT trigger (the pipeline is: convert →
        // format → null/undefined check; format produced a defined
        // string, so the check passes through).
        // This pins the documented order — fallback is for the *final*
        // value, not for intermediate raw undefined.
        assert.equal(b.get_value(), 'Hi, undefined!');
    });

    test('stringFormat one-way: TwoWay writeback bypasses format and goes raw to source', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'count', 0, MetaData.None);
        const src = new Source();

        const b = new Binding(src, 'count', BindingMode.TwoWay, {
            stringFormat: 'count = {0}',
        });
        // Writeback uses the raw user-supplied value because the
        // composed converter has no convertBack (StringFormat is
        // one-way). The value reaches the source unchanged.
        b.set_value(123);
        assert.equal(src.get_property_value('count'), 123);
    });
});
