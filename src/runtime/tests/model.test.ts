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
    APPROXIMATE_TEXT_MEASURER,
    PropertyValueSource,
    Model,
    PropertyKey,
    Element,
    Visual,
    Single,
    Panel,
    HorizontalAlignment,
    VerticalAlignment,
    Size,
    Rect,
    Thickness,
    type CoerceValue,
    type PropertyChangeCallback,
    type VisualHost,
    type DrawingContext,
    ObservableCollection,
    observe_array,
    Validation,
    type ValidationRule,
    MultiBinding,
    PriorityBinding,
    AncestorBinding,
    type ValidateValue,
    isNotDataBindable,
    isAnimationProhibited,
} from '../index.js';
import { resolveKey } from '../model-internals.js';

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
    desk._set_property_value_by_name('label', 'desk-1');
    desk._set_property_value_by_name('items', 12);

    const office = new Office();
    office._set_property_value_by_name('number', 314);
    office._set_property_value_by_name('desk', desk);

    const manager = new Manager();
    manager._set_property_value_by_name('name', 'Ada');
    manager._set_property_value_by_name('office', office);

    const department = new Department();
    department._set_property_value_by_name('code', 'ENG');
    department._set_property_value_by_name('manager', manager);

    const company = new Company();
    company._set_property_value_by_name('name', 'Mural');
    company._set_property_value_by_name('department', department);

    return {
        Company, Department, Manager, Office, Desk, ViewModel,
        company, department, manager, office, desk,
    };
}

describe('Binding — transitive paths across a graph of Models', () => {
    test('ViewModel.label bound through a 5-Model chain resolves transitively', () => {
        const { company, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'desk-1');
    });

    test('severing an intermediate Model returns undefined on the next read', () => {
        const { company, manager, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        manager._set_property_value_by_name('office', null);
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), undefined);
    });

    test('mutating the leaf Model is observable via the ViewModel on the next read', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'desk-1');
        desk._set_property_value_by_name('label', 'changed');
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'changed');
    });

    test('replacing a mid-chain Model subtree retargets resolution through the new branch', () => {
        const { company, department, Manager, Office, Desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'desk-1');

        const newDesk = new Desk();
        newDesk._set_property_value_by_name('label', 'desk-replaced');
        const newOffice = new Office();
        newOffice._set_property_value_by_name('desk', newDesk);
        const newManager = new Manager();
        newManager._set_property_value_by_name('office', newOffice);
        department._set_property_value_by_name('manager', newManager);

        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'desk-replaced');
    });

    test('Binding.set_value (TwoWay) writes the leaf Model property through the chain', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
            BindingMode.TwoWay,
        );
        view._set_property_value_by_name('label', binding);

        assert.equal(binding.set_value('renamed'), true);
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'renamed');
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'renamed');
    });

    test('two ViewModels bound to the same chain both see leaf mutations', () => {
        const { company, desk, ViewModel } = buildScene();
        const viewA = new ViewModel();
        const viewB = new ViewModel();
        viewA._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        viewB._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(viewA.get_property_value(resolveKey(viewA, undefined, 'label')), 'desk-1');
        assert.equal(viewB.get_property_value(resolveKey(viewB, undefined, 'label')), 'desk-1');

        desk._set_property_value_by_name('label', 'rotated');
        assert.equal(viewA.get_property_value(resolveKey(viewA, undefined, 'label')), 'rotated');
        assert.equal(viewB.get_property_value(resolveKey(viewB, undefined, 'label')), 'rotated');
    });

    test('two roots sharing a mid-chain Manager: both views reflect mutations to the shared subtree', () => {
        const { Company, Department, manager, company, desk, ViewModel } = buildScene();

        const dept2 = new Department();
        dept2._set_property_value_by_name('manager', manager);
        const co2 = new Company();
        co2._set_property_value_by_name('department', dept2);

        const view1 = new ViewModel();
        view1._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        const view2 = new ViewModel();
        view2._set_property_value_by_name(
            'label',
            new Binding(co2, 'department.manager.office.desk.label'),
        );

        assert.equal(view1.get_property_value(resolveKey(view1, undefined, 'label')), 'desk-1');
        assert.equal(view2.get_property_value(resolveKey(view2, undefined, 'label')), 'desk-1');

        desk._set_property_value_by_name('label', 'rotated');
        assert.equal(view1.get_property_value(resolveKey(view1, undefined, 'label')), 'rotated');
        assert.equal(view2.get_property_value(resolveKey(view2, undefined, 'label')), 'rotated');
    });

    test('rebinding a ViewModel.label to a different graph swaps the resolved value', () => {
        const { Company, Department, Manager, Office, Desk, ViewModel, company, desk } = buildScene();
        desk._set_property_value_by_name('label', 'graph-one');

        const desk2 = new Desk();
        desk2._set_property_value_by_name('label', 'graph-two');
        const office2 = new Office();
        office2._set_property_value_by_name('desk', desk2);
        const manager2 = new Manager();
        manager2._set_property_value_by_name('office', office2);
        const department2 = new Department();
        department2._set_property_value_by_name('manager', manager2);
        const company2 = new Company();
        company2._set_property_value_by_name('department', department2);

        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'graph-one');

        view._set_property_value_by_name(
            'label',
            new Binding(company2, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'graph-two');
    });

    test('indexed segments traverse an array of Manager Models', () => {
        const { Department, Manager, Office, Desk, ViewModel } = buildScene();

        const targetDesk = new Desk();
        targetDesk._set_property_value_by_name('label', 'corner-desk');
        const targetOffice = new Office();
        targetOffice._set_property_value_by_name('desk', targetDesk);
        const targetManager = new Manager();
        targetManager._set_property_value_by_name('office', targetOffice);

        const dept = new Department();
        dept._set_property_value_by_name(
            'managers',
            [new Manager(), new Manager(), targetManager, new Manager()],
        );

        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(dept, 'managers[2].office.desk.label'),
        );
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'corner-desk');

        targetDesk._set_property_value_by_name('label', 'rotated');
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'rotated');
    });

    test('listener on ViewModel.label fires on Binding install with resolved value, then again on leaf mutation', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'label'), (_m, _p, old_value, new_value) => { captures.push([old_value, new_value]); }, );

        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![0], '');
        assert.equal(captures[0]![1], 'desk-1');

        desk._set_property_value_by_name('label', 'changed');
        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 'desk-1');
        assert.equal(captures[1]![1], 'changed');

        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'changed');
    });
});

describe('TwoWay Bindings across a graph of Models', () => {
    test('writeback through an array of Manager Models updates the leaf Desk', () => {
        const { Department, Manager, Office, Desk } = buildScene();

        const targetDesk = new Desk();
        targetDesk._set_property_value_by_name('label', 'corner-desk');
        const targetOffice = new Office();
        targetOffice._set_property_value_by_name('desk', targetDesk);
        const targetManager = new Manager();
        targetManager._set_property_value_by_name('office', targetOffice);

        const dept = new Department();
        dept._set_property_value_by_name(
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
        assert.equal(targetDesk.get_property_value(resolveKey(targetDesk, undefined, 'label')), 'corner-renamed');
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
        desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'label'), cb);

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
        newDesk._set_property_value_by_name('label', 'desk-replaced');
        const newOffice = new Office();
        newOffice._set_property_value_by_name('desk', newDesk);
        const newManager = new Manager();
        newManager._set_property_value_by_name('office', newOffice);
        department._set_property_value_by_name('manager', newManager);

        assert.equal(binding.set_value('written-after-swap'), true);
        assert.equal(newDesk.get_property_value(resolveKey(newDesk, undefined, 'label')), 'written-after-swap');
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'desk-1');
        assert.equal(binding.get_value(), 'written-after-swap');
    });

    test('writeback into a shared mid-chain Manager is visible from a second root', () => {
        const { Company, Department, manager, company } = buildScene();

        const dept2 = new Department();
        dept2._set_property_value_by_name('manager', manager);
        const co2 = new Company();
        co2._set_property_value_by_name('department', dept2);

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

        manager._set_property_value_by_name('office', null);
        assert.equal(binding.set_value('nope'), false);
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'desk-1');
    });

    test('writeback to a mid-chain Model property replaces the subtree at that node', () => {
        const { Manager, Office, Desk, company, ViewModel } = buildScene();
        const swap = new Binding(company, 'department.manager', BindingMode.TwoWay);

        const newDesk = new Desk();
        newDesk._set_property_value_by_name('label', 'new-leaf');
        const newOffice = new Office();
        newOffice._set_property_value_by_name('desk', newDesk);
        const newManager = new Manager();
        newManager._set_property_value_by_name('office', newOffice);

        assert.equal(swap.set_value(newManager), true);

        // A separately created deep binding now resolves through the swapped subtree.
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'new-leaf');
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
        desk._set_property_value_by_name('label', 'initial');
        const office = new Office();
        office._set_property_value_by_name('desk', desk);
        const manager = new Manager();
        manager._set_property_value_by_name('office', office);
        const department = new Department();
        department._set_property_value_by_name('manager', manager);
        const branch = new Branch();
        branch._set_property_value_by_name('department', department);
        const region = new Region();
        region._set_property_value_by_name('branches', [branch]);
        const org = new Org();
        org._set_property_value_by_name('regions', [new Region(), region]);

        const binding = new Binding(
            org,
            'regions[1].branches[0].department.manager.office.desk.label',
            BindingMode.TwoWay,
        );
        assert.equal(binding.get_value(), 'initial');
        assert.equal(binding.set_value('renamed'), true);
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'renamed');
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
        a._set_property_value_by_name('label', 'a-initial');
        b._set_property_value_by_name('label', 'b-initial');

        let aFires = 0;
        let bFires = 0;
        a.AddPropertyChangedListener(resolveKey(a, undefined, 'label'), () => { aFires++; });
        b.AddPropertyChangedListener(resolveKey(b, undefined, 'label'), () => { bFires++; });

        a._set_property_value_by_name('label', 'a-changed');
        assert.equal(aFires, 1);
        assert.equal(bFires, 0);

        b._set_property_value_by_name('label', 'b-changed');
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

        a.AddPropertyChangedListener(resolveKey(a, undefined, 'label'), aCb);
        b.AddPropertyChangedListener(resolveKey(b, undefined, 'label'), bCb);

        a.RemovePropertyChangedListener(resolveKey(a, undefined, 'label'), aCb);

        a._set_property_value_by_name('label', 'a-changed');
        b._set_property_value_by_name('label', 'b-changed');

        assert.equal(aFires, 0);
        assert.equal(bFires, 1);
    });

    test('a listener added before any set still fires on the first set', () => {
        // Verifies that the EVD is created lazily on listener-add too, so
        // the "listener before any set" path still notifies.
        const { Desk } = buildScene();
        const desk = new Desk();

        let captured: [Model, string, unknown, unknown] | null = null;
        desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'label'), (m, p, o, n) => { captured = [m, p, o, n]; });

        desk._set_property_value_by_name('label', 'first-set');
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
            () => desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'nope'), () => {}),
            /not found in model 'Desk'/,
        );
    });

    test('multiple listeners on the same instance all fire, in registration order', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        const order: number[] = [];
        desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'label'), () => { order.push(1); });
        desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'label'), () => { order.push(2); });
        desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'label'), () => { order.push(3); });

        desk._set_property_value_by_name('label', 'fire');
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
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'label'), (_m, _p, o, n) => { captures.push([o, n]); }, );

        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        // install fires once with ('', 'desk-1')
        assert.equal(captures.length, 1);

        const newDesk = new Desk();
        newDesk._set_property_value_by_name('label', 'swapped-leaf');
        const newOffice = new Office();
        newOffice._set_property_value_by_name('desk', newDesk);
        const newManager = new Manager();
        newManager._set_property_value_by_name('office', newOffice);
        department._set_property_value_by_name('manager', newManager);

        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 'desk-1');
        assert.equal(captures[1]![1], 'swapped-leaf');
    });

    test('severing an intermediate Model pushes undefined to the consumer', () => {
        const { company, manager, ViewModel } = buildScene();
        const view = new ViewModel();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'label'), (_m, _p, o, n) => { captures.push([o, n]); }, );

        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(captures.length, 1);

        manager._set_property_value_by_name('office', null);
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
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'label'), () => { fires++; });

        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(fires, 1); // install

        // Build a new subtree whose leaf label is the SAME string as the
        // current resolved value ('desk-1').
        const newDesk = new Desk();
        newDesk._set_property_value_by_name('label', 'desk-1');
        const newOffice = new Office();
        newOffice._set_property_value_by_name('desk', newDesk);
        const newManager = new Manager();
        newManager._set_property_value_by_name('office', newOffice);
        department._set_property_value_by_name('manager', newManager);

        assert.equal(fires, 1);
    });

    test('two ViewModels bound to the same chain both receive push notifications independently', () => {
        const { company, desk, ViewModel } = buildScene();
        const viewA = new ViewModel();
        const viewB = new ViewModel();
        let aFires = 0;
        let bFires = 0;
        viewA.AddPropertyChangedListener(resolveKey(viewA, undefined, 'label'), () => { aFires++; });
        viewB.AddPropertyChangedListener(resolveKey(viewB, undefined, 'label'), () => { bFires++; });

        viewA._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        viewB._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(aFires, 1);
        assert.equal(bFires, 1);

        desk._set_property_value_by_name('label', 'rotated');
        assert.equal(aFires, 2);
        assert.equal(bFires, 2);
    });

    test('replacing a binding stops further notifications from the old chain', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        let fires = 0;
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'label'), () => { fires++; });

        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(fires, 1);

        // Swap the binding for a plain local value. The old binding's
        // path listeners are still attached to chain Models (cleanup is
        // backlog item 2.5), but the EVD must have detached its
        // subscription so the old chain can no longer push to it.
        view._set_property_value_by_name('label', 'local-override');
        assert.equal(fires, 2);

        desk._set_property_value_by_name('label', 'this-should-not-propagate');
        assert.equal(fires, 2);
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'local-override');
    });

    test('writing through a TwoWay binding pushes the new value back to the consumer', () => {
        const { company, ViewModel } = buildScene();
        const view = new ViewModel();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'label'), (_m, _p, o, n) => { captures.push([o, n]); }, );

        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
            BindingMode.TwoWay,
        );
        view._set_property_value_by_name('label', binding);
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

// Test-side accessor for Visual's protected `visualParent` getter.
// Production API keeps the parent link encapsulated; tests assert
// tree structure through this helper instead. Returns the visual
// parent — for every Visual added via Attach (the default convenience
// in Single.SetChild / Panel.AddChild), visualParent === logicalParent,
// so the existing inheritance tests asserting "child reads parent's
// value" stay valid against this getter.
function parent_of(visual: Visual | undefined): Visual | undefined
{
    if (visual === undefined) return undefined;
    return (visual as unknown as { visualParent: Visual | undefined }).visualParent;
}

// Pins backlog item 2.5: Binding/PropertyPath disposal. Listeners attached
// by PropertyPath.Traverse must be removed when the binding is no longer
// used, otherwise they accumulate on chain Models indefinitely.
describe('Binding / PropertyPath disposal', () => {
    test('replacing a Binding with a local value removes the old chain listeners', () => {
        const { company, department, manager, office, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );

        // Every Model in the chain has exactly one path listener installed.
        assert.equal(listener_count(company, 'department'), 1);
        assert.equal(listener_count(department, 'manager'), 1);
        assert.equal(listener_count(manager, 'office'), 1);
        assert.equal(listener_count(office, 'desk'), 1);
        assert.equal(listener_count(desk, 'label'), 1);

        view._set_property_value_by_name('label', 'local-override');

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
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(listener_count(desk, 'label'), 1);

        // Build a second graph and point view.label at its leaf.
        const desk2 = new Desk();
        const office2 = new Office();
        office2._set_property_value_by_name('desk', desk2);
        const manager2 = new Manager();
        manager2._set_property_value_by_name('office', office2);
        const department2 = new Department();
        department2._set_property_value_by_name('manager', manager2);
        const company2 = new Company();
        company2._set_property_value_by_name('department', department2);

        view._set_property_value_by_name(
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
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'label'), () => { fires++; });

        const binding = new Binding(
            company,
            'department.manager.office.desk.label',
        );
        view._set_property_value_by_name('label', binding);
        // install fires once
        assert.equal(fires, 1);

        // Replace with a local value — disposes the binding.
        view._set_property_value_by_name('label', 'local');
        // replacement fires (oldResolved → local)
        assert.equal(fires, 2);

        // Mutating any chain Model must not fire view's listener.
        desk._set_property_value_by_name('label', 'after-dispose');
        assert.equal(fires, 2);
    });

    test('listener count is per-instance — disposing one binding does not affect a parallel binding on a different graph', () => {
        const { Company, Department, Manager, Office, Desk, company, desk } = buildScene();

        const desk2 = new Desk();
        const office2 = new Office();
        office2._set_property_value_by_name('desk', desk2);
        const manager2 = new Manager();
        manager2._set_property_value_by_name('office', office2);
        const department2 = new Department();
        department2._set_property_value_by_name('manager', manager2);
        const company2 = new Company();
        company2._set_property_value_by_name('department', department2);

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
        assert.equal(desk.GetValueSource(resolveKey(desk, undefined, 'label')), PropertyValueSource.Default);
    });

    test('GetValueSource becomes LocalValue after a plain set_property_value', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        desk._set_property_value_by_name('label', 'set-locally');
        assert.equal(desk.GetValueSource(resolveKey(desk, undefined, 'label')), PropertyValueSource.LocalValue);
    });

    test('GetValueSource becomes Binding after installing a Binding', () => {
        const { company, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(view.GetValueSource(resolveKey(view, undefined, 'label')), PropertyValueSource.Binding);
    });

    test('GetValueSource stays Default after AddPropertyChangedListener (no value set yet)', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'label'), () => {});
        // Listener creates an EVD lazily at Default priority; the source
        // should still report Default until something is actually set.
        assert.equal(desk.GetValueSource(resolveKey(desk, undefined, 'label')), PropertyValueSource.Default);
    });

    test('ClearValue resets a locally-set property back to its registered default', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        desk._set_property_value_by_name('label', 'set-locally');
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'set-locally');

        desk.ClearValue(resolveKey(desk, undefined, 'label'));
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), '');   // default for 'label'
        assert.equal(desk.GetValueSource(resolveKey(desk, undefined, 'label')), PropertyValueSource.Default);
    });

    test('ClearValue fires PropertyChanged with (oldEffective, defaultValue) when the value changed', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        desk._set_property_value_by_name('items', 42);

        const captures: Array<[unknown, unknown]> = [];
        desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'items'), (_m, _p, o, n) => { captures.push([o, n]); }, );

        desk.ClearValue(resolveKey(desk, undefined, 'items'));
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![0], 42);
        assert.equal(captures[0]![1], 0);   // default for 'items'
    });

    test('ClearValue is a silent no-op when the property has never been set', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        let fires = 0;
        desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'label'), () => { fires++; });

        desk.ClearValue(resolveKey(desk, undefined, 'label'));
        assert.equal(fires, 0);
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), '');
    });

    test('ClearValue on a bound property disposes the binding and detaches its chain listeners', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'),
        );
        assert.equal(listener_count(desk, 'label'), 1);
        assert.equal(view.GetValueSource(resolveKey(view, undefined, 'label')), PropertyValueSource.Binding);

        view.ClearValue(resolveKey(view, undefined, 'label'));

        assert.equal(view.GetValueSource(resolveKey(view, undefined, 'label')), PropertyValueSource.Default);
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), '');     // default
        assert.equal(listener_count(desk, 'label'), 0);          // chain cleaned up
    });

    test('after ClearValue, a subsequent set_property_value installs as LocalValue again', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        desk._set_property_value_by_name('label', 'first');
        desk.ClearValue(resolveKey(desk, undefined, 'label'));
        desk._set_property_value_by_name('label', 'second');
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'second');
        assert.equal(desk.GetValueSource(resolveKey(desk, undefined, 'label')), PropertyValueSource.LocalValue);
    });

    test('ClearValue throws on an unregistered property', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        assert.throws(
            () => desk.ClearValue(resolveKey(desk, undefined, 'nope')),
            /not found in model 'Desk'/,
        );
    });

    test('GetValueSource throws on an unregistered property', () => {
        const { Desk } = buildScene();
        const desk = new Desk();
        assert.throws(
            () => desk.GetValueSource(resolveKey(desk, undefined, 'nope')),
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
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'base-default');
    });

    test('a subclass instance can set an inherited property and read it back', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        Model.RegisterProperty(Furniture, 'label', '', MetaData.Render);

        const desk = new Desk();
        desk._set_property_value_by_name('label', 'on-desk');
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'on-desk');
        assert.equal(desk.GetValueSource(resolveKey(desk, undefined, 'label')), PropertyValueSource.LocalValue);
    });

    test('a subclass listener fires only for the subclass instance, not for base instances', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        Model.RegisterProperty(Furniture, 'label', '', MetaData.Render);

        const furniture = new Furniture();
        const desk = new Desk();
        let deskFires = 0;
        let furnitureFires = 0;
        desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'label'), () => { deskFires++; });
        furniture.AddPropertyChangedListener(resolveKey(furniture, undefined, 'label'), () => { furnitureFires++; });

        desk._set_property_value_by_name('label', 'x');
        assert.equal(deskFires, 1);
        assert.equal(furnitureFires, 0);
    });

    test('OverrideMetadata changes the default for the subclass while leaving the base class alone', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        const LabelKey = Model.RegisterProperty(Furniture, 'label', 'furniture-default', MetaData.Render);
        Model.OverrideMetadata(Desk, LabelKey, { default_value: 'desk-default' });

        assert.equal(new Furniture().get_property_value(resolveKey(new Furniture(), undefined, 'label')), 'furniture-default');
        assert.equal(new Desk().get_property_value(resolveKey(new Desk(), undefined, 'label')), 'desk-default');
    });

    test('OverrideMetadata inherits unspecified fields from the parent descriptor', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        const clamp_to_10: CoerceValue = (_m, v) => Math.min(v as number, 10);
        const HeightKey = Model.RegisterProperty(Furniture, 'height', 1, MetaData.Render, clamp_to_10);

        // Override only the default; coerce + meta_data must still apply.
        Model.OverrideMetadata(Desk, HeightKey, { default_value: 5 });

        const desk = new Desk();
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'height')), 5);

        // Coerce inherited from Furniture — clamps to 10.
        desk._set_property_value_by_name('height', 100);
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'height')), 10);
    });

    test('OverrideMetadata can replace just the coerce callback', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        const HeightKey = Model.RegisterProperty(Furniture, 'height', 1, MetaData.Render);

        const clamp_to_5: CoerceValue = (_m, v) => Math.min(v as number, 5);
        Model.OverrideMetadata(Desk, HeightKey, { coerce_value: clamp_to_5 });

        // Desk's height uses the inherited default (1) but the override's coerce.
        assert.equal(new Desk().get_property_value(resolveKey(new Desk(), undefined, 'height')), 1);
        const desk = new Desk();
        desk._set_property_value_by_name('height', 100);
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'height')), 5);

        // Furniture instances are unaffected by the override.
        const furniture = new Furniture();
        furniture._set_property_value_by_name('height', 100);
        assert.equal(furniture.get_property_value(resolveKey(furniture, undefined, 'height')), 100);
    });

    test('OverrideMetadata throws when no ancestor has registered the property', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        // Register on a sibling class to obtain a typed key whose
        // descriptor name doesn't appear in Desk's ancestor chain.
        class Stranger extends Model {}
        const StrangerKey = Model.RegisterProperty(Stranger, 'unknown', 0, MetaData.None);
        assert.throws(
            () => Model.OverrideMetadata(Desk, StrangerKey, { default_value: 0 }),
            /Cannot override metadata for property 'unknown'/,
        );
    });

    test('OverrideMetadata can be called repeatedly, chaining through previous overrides', () => {
        class A extends Model {}
        class B extends A {}
        class C extends B {}
        const XKey = Model.RegisterProperty(A, 'x', 1, MetaData.Render);
        // B overrides default only.
        Model.OverrideMetadata(B, XKey, { default_value: 2 });
        // C overrides default only too; should NOT fall back to A because B is the nearer ancestor.
        Model.OverrideMetadata(C, XKey, { default_value: 3 });

        assert.equal(new A().get_property_value(resolveKey(new A(), undefined, 'x')), 1);
        assert.equal(new B().get_property_value(resolveKey(new B(), undefined, 'x')), 2);
        assert.equal(new C().get_property_value(resolveKey(new C(), undefined, 'x')), 3);
    });

    test('subclass binding works for an inherited property without re-registration', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        class View extends Model {}
        Model.RegisterProperty(Furniture, 'label', '', MetaData.Render);
        Model.RegisterProperty(View, 'label', '', MetaData.Render);

        const desk = new Desk();
        desk._set_property_value_by_name('label', 'on-desk');

        const view = new View();
        view._set_property_value_by_name('label', new Binding(desk, 'label'));
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'on-desk');

        desk._set_property_value_by_name('label', 'on-desk-2');
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'on-desk-2');
    });

    test('OverrideMetadata that adds a default fires the subclass default through subsequent get_property_value', () => {
        class Furniture extends Model {}
        class Desk extends Furniture {}
        const LabelKey = Model.RegisterProperty(Furniture, 'label', 'furniture', MetaData.Render);
        Model.OverrideMetadata(Desk, LabelKey, { default_value: 'desk' });

        const desk = new Desk();
        // No set — descriptor walk finds Desk's overridden default.
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'desk');
        assert.equal(desk.GetValueSource(resolveKey(desk, undefined, 'label')), PropertyValueSource.Default);
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

// Pins Visual's invalidation behavior. A subclass overrides Invalidate*
// to count fires per phase, so we can assert which Invalidate method
// each kind of property change routes to.
describe('Visual invalidation routing', () => {
    class TestVisual extends Element
    {
        measure_fires = 0;
        arrange_fires = 0;
        render_fires = 0;
        public override InvalidateMeasure(): void { this.measure_fires++; super.InvalidateMeasure(); }
        public override InvalidateArrange(): void { this.arrange_fires++; super.InvalidateArrange(); }
        public override InvalidateVisual(): void  { this.render_fires++;  super.InvalidateVisual();  }
    }

    test('property with MetaData.Measure fires only InvalidateMeasure', () => {
        Model.RegisterProperty(TestVisual, 'measure_only', 0, MetaData.Measure);
        const v = new TestVisual();
        v._set_property_value_by_name('measure_only', 5);
        assert.equal(v.measure_fires, 1);
        assert.equal(v.arrange_fires, 0);
        assert.equal(v.render_fires, 0);
    });

    test('property with MetaData.Render fires only InvalidateVisual', () => {
        Model.RegisterProperty(TestVisual, 'render_only', 0, MetaData.Render);
        const v = new TestVisual();
        v._set_property_value_by_name('render_only', 5);
        assert.equal(v.measure_fires, 0);
        assert.equal(v.arrange_fires, 0);
        assert.equal(v.render_fires, 1);
    });

    test('property with combined Measure | Arrange | Render fires all three Invalidate methods', () => {
        Model.RegisterProperty(
            TestVisual,
            'all_flags',
            0,
            MetaData.Measure | MetaData.Arrange | MetaData.Render,
        );
        const v = new TestVisual();
        v._set_property_value_by_name('all_flags', 5);
        assert.equal(v.measure_fires, 1);
        assert.equal(v.arrange_fires, 1);
        assert.equal(v.render_fires, 1);
    });

    test('property with MetaData.None fires no Invalidate methods', () => {
        Model.RegisterProperty(TestVisual, 'no_flags', 0, MetaData.None);
        const v = new TestVisual();
        v._set_property_value_by_name('no_flags', 5);
        assert.equal(v.measure_fires, 0);
        assert.equal(v.arrange_fires, 0);
        assert.equal(v.render_fires, 0);
    });

    test('set_property_value still throws on unregistered property (no Invalidate fired)', () => {
        const v = new TestVisual();
        assert.throws(() => v._set_property_value_by_name('missing', 1));
        assert.equal(v.measure_fires, 0);
        assert.equal(v.arrange_fires, 0);
        assert.equal(v.render_fires, 0);
    });

    test('Visual still behaves as a Model: get/set roundtrip and listener fan-out work', () => {
        Model.RegisterProperty(TestVisual, 'count', 7, MetaData.Render);
        const v = new TestVisual();
        let listener_fires = 0;
        v.AddPropertyChangedListener(resolveKey(v, undefined, 'count'), () => { listener_fires++; });
        assert.equal(v.get_property_value(resolveKey(v, undefined, 'count')), 7);
        v._set_property_value_by_name('count', 42);
        assert.equal(v.get_property_value(resolveKey(v, undefined, 'count')), 42);
        assert.equal(listener_fires, 1);
        assert.equal(v.render_fires, 1);
    });

    test('inherited properties are invalidated correctly via the metadata walk', () => {
        class BaseVisual extends TestVisual {}
        class DerivedVisual extends BaseVisual {}
        Model.RegisterProperty(BaseVisual, 'thickness', 0, MetaData.Arrange);

        const derived = new DerivedVisual();
        derived._set_property_value_by_name('thickness', 3);
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
        source._set_property_value_by_name('label', 'initial');
        const v = new TestVisual();
        v._set_property_value_by_name('bound_label', new Binding(source, 'label'));
        // install fires render invalidation once
        assert.equal(v.render_fires, 1);

        source._set_property_value_by_name('label', 'changed');
        // binding push must have fired render invalidation a second time
        assert.equal(v.render_fires, 2);
    });

    test('ClearValue invalidates when the effective value differs from the default', () => {
        Model.RegisterProperty(TestVisual, 'cleared_prop', 'default', MetaData.Render);
        const v = new TestVisual();
        v._set_property_value_by_name('cleared_prop', 'set');
        assert.equal(v.render_fires, 1);

        v.ClearValue(resolveKey(v, undefined, 'cleared_prop'));
        // Effective value went from 'set' to 'default' — invalidation fires.
        assert.equal(v.render_fires, 2);
        assert.equal(v.get_property_value(resolveKey(v, undefined, 'cleared_prop')), 'default');
    });

    test('ClearValue does NOT invalidate when the property was never set', () => {
        Model.RegisterProperty(TestVisual, 'never_set', 0, MetaData.Render);
        const v = new TestVisual();
        // EVD created lazily when ClearValue is called, but value never
        // changed (default → default), so EVD.OnPropertyChange does not fire.
        v.ClearValue(resolveKey(v, undefined, 'never_set'));
        assert.equal(v.render_fires, 0);
    });

    test('per-instance listeners and Visual invalidation co-exist without polluting listener_count', () => {
        Model.RegisterProperty(TestVisual, 'count', 0, MetaData.Render);
        const v = new TestVisual();
        let user_fires = 0;
        v.AddPropertyChangedListener(resolveKey(v, undefined, 'count'), () => { user_fires++; });

        // listener_count counts only user-facing listeners, not the
        // internal callback the Model uses to route onPropertyChanged.
        assert.equal(listener_count(v, 'count'), 1);

        v._set_property_value_by_name('count', 5);
        assert.equal(user_fires, 1);
        assert.equal(v.render_fires, 1);
    });
});

describe('Visual (base) is a leaf', () => {
    test('new Visual has no parent', () => {
        const v = new Visual();
        assert.equal(parent_of(v), undefined);
    });

    test('a Visual leaf can be attached to a Panel and reports it via Parent', () => {
        const parent = new Panel();
        const leaf = new Visual();
        parent.AddChild(leaf);
        assert.equal(parent_of(leaf), parent);
    });
});

describe('Panel tree construction (multi-child)', () => {
    test('a new Panel has no parent and no children', () => {
        const p = new Panel();
        assert.equal(parent_of(p), undefined);
        assert.deepEqual([...p.Children], []);
    });

    test('addChild sets the child Parent and appends to Children in order', () => {
        const parent = new Panel();
        const a = new Visual();
        const b = new Visual();
        parent.AddChild(a);
        parent.AddChild(b);
        assert.equal(parent_of(a), parent);
        assert.equal(parent_of(b), parent);
        assert.deepEqual([...parent.Children], [a, b]);
    });

    test('removeChild clears Parent and removes from Children', () => {
        const parent = new Panel();
        const child = new Visual();
        parent.AddChild(child);
        parent.RemoveChild(child);
        assert.equal(parent_of(child), undefined);
        assert.deepEqual([...parent.Children], []);
    });

    test('throws when adding a Visual that already has a parent', () => {
        const a = new Panel();
        const b = new Panel();
        const child = new Visual();
        a.AddChild(child);
        assert.throws(() => b.AddChild(child), /already has a (visual|logical) parent/);
    });

    test('throws when adding self as a child', () => {
        const p = new Panel();
        assert.throws(() => p.AddChild(p), /own child/);
    });

    test('removeChild is a silent no-op when the visual is not actually a child', () => {
        const parent = new Panel();
        const stranger = new Visual();
        parent.RemoveChild(stranger);
        assert.deepEqual([...parent.Children], []);
        assert.equal(parent_of(stranger), undefined);
    });

    test('walks up a three-level Panel tree via Parent', () => {
        const root = new Panel();
        const middle = new Panel();
        const leaf = new Visual();
        root.AddChild(middle);
        middle.AddChild(leaf);
        assert.equal(parent_of(leaf), middle);
        assert.equal(parent_of(parent_of(leaf)), root);
        assert.equal(parent_of(parent_of(parent_of(leaf))), undefined);
    });

    test('detach-then-attach lets a Visual join a new parent cleanly', () => {
        const a = new Panel();
        const b = new Panel();
        const child = new Visual();
        a.AddChild(child);
        a.RemoveChild(child);
        b.AddChild(child);
        assert.equal(parent_of(child), b);
        assert.deepEqual([...a.Children], []);
        assert.deepEqual([...b.Children], [child]);
    });

    test('removeChild preserves order of remaining children', () => {
        const parent = new Panel();
        const a = new Visual();
        const b = new Visual();
        const c = new Visual();
        parent.AddChild(a);
        parent.AddChild(b);
        parent.AddChild(c);
        parent.RemoveChild(b);
        assert.deepEqual([...parent.Children], [a, c]);
    });

    test('Children is an observable collection — subscribers see AddChild / RemoveChild / InsertChild mutations', () => {
        const parent = new Panel();
        const a = new Visual();
        const b = new Visual();
        const c = new Visual();
        const events: string[] = [];
        parent.Children.Subscribe(change => { events.push(change.kind); });

        parent.AddChild(a);
        parent.AddChild(b);
        parent.InsertChild(1, c);   // [a, c, b]
        parent.RemoveChild(c);      // [a, b]
        assert.deepEqual(events, ['inserted', 'inserted', 'inserted', 'removed']);
        assert.deepEqual([...parent.Children], [a, b]);
    });

    test('InsertChild places a Visual at the requested index and wires Attach', () => {
        const parent = new Panel();
        const a = new Visual();
        const b = new Visual();
        const c = new Visual();
        parent.AddChild(a);
        parent.AddChild(b);
        parent.InsertChild(1, c);
        assert.deepEqual([...parent.Children], [a, c, b]);
        assert.equal(parent_of(c), parent);
    });

    test('AddVisualChild / InsertVisualChild / RemoveVisualChild mutate the same observable collection', () => {
        // Visual-only attach: child gets visualParent = panel but NO
        // logicalParent. The collection still reflects the child.
        const panel = new Panel();
        const a = new Visual();
        panel.AddVisualChild(a);
        assert.equal(panel.Children.Count, 1);
        assert.equal(parent_of(a), panel);  // visualParent
        // logicalParent stays undefined for visual-only attach (helper
        // reads visualParent for tests; logical parent is what's gone).

        panel.RemoveVisualChild(a);
        assert.equal(panel.Children.Count, 0);
        assert.equal(parent_of(a), undefined);
    });

    test('visualChildren / logicalChildren remain snapshot arrays (length, indexing) backed by the observable', () => {
        const parent = new Panel();
        const a = new Visual();
        const b = new Visual();
        parent.AddChild(a);
        parent.AddChild(b);
        const snap1 = parent.visualChildren;
        assert.equal(snap1.length, 2);
        assert.equal(snap1[0], a);
        // Same snapshot returned on a second read without intervening mutation.
        assert.equal(parent.visualChildren, snap1);
        // After a mutation the snapshot is invalidated; new array.
        parent.RemoveChild(a);
        const snap2 = parent.visualChildren;
        assert.notEqual(snap2, snap1);
        assert.deepEqual([...snap2], [b]);
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
        const c = new Visual();
        s.SetChild(c);
        assert.equal(s.child, c);
        assert.equal(parent_of(c), s);
    });

    test('setChild(undefined) detaches the current child', () => {
        const s = new Single();
        const c = new Visual();
        s.SetChild(c);
        s.SetChild(undefined);
        assert.equal(s.child, undefined);
        assert.equal(parent_of(c), undefined);
    });

    test('setChild replaces the existing child, detaching the previous one', () => {
        const s = new Single();
        const a = new Visual();
        const b = new Visual();
        s.SetChild(a);
        s.SetChild(b);
        assert.equal(s.child, b);
        assert.equal(parent_of(b), s);
        assert.equal(parent_of(a), undefined);
    });

    test('setChild is a no-op when called with the same child', () => {
        const s = new Single();
        const c = new Visual();
        s.SetChild(c);
        s.SetChild(c);
        assert.equal(s.child, c);
        assert.equal(parent_of(c), s);
    });

    test('setChild throws when the child already has a different parent', () => {
        const owner = new Panel();
        const child = new Visual();
        owner.AddChild(child);

        const s = new Single();
        assert.throws(() => s.SetChild(child), /already has a (visual|logical) parent/);
    });

    test('setChild throws when assigning self as child', () => {
        const s = new Single();
        assert.throws(() => s.SetChild(s), /own child/);
    });

    test('Single nested inside Panel forms a mixed tree', () => {
        const root = new Panel();
        const wrapper = new Single();
        const leaf = new Visual();
        root.AddChild(wrapper);
        wrapper.SetChild(leaf);

        assert.equal(parent_of(leaf), wrapper);
        assert.equal(parent_of(parent_of(leaf)), root);
        assert.deepEqual([...root.Children], [wrapper]);
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
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const parent = new Surface();
        parent._set_property_value_by_name('fontSize', 20);
        const child = new Surface();
        parent.AddChild(child);

        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 20);
        assert.equal(child.GetValueSource(resolveKey(child, undefined, 'fontSize')), PropertyValueSource.InheritedValue);
    });

    test('a detached Model with no parent falls back to descriptor default', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);
        const orphan = new Surface();
        assert.equal(orphan.get_property_value(resolveKey(orphan, undefined, 'fontSize')), 10);
        assert.equal(orphan.GetValueSource(resolveKey(orphan, undefined, 'fontSize')), PropertyValueSource.Default);
    });

    test('a local override on the child shadows the inherited value', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const parent = new Surface();
        parent._set_property_value_by_name('fontSize', 20);
        const child = new Surface();
        parent.AddChild(child);

        child._set_property_value_by_name('fontSize', 99);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 99);
        assert.equal(child.GetValueSource(resolveKey(child, undefined, 'fontSize')), PropertyValueSource.LocalValue);

        // Changing the ancestor must NOT alter the overridden child.
        parent._set_property_value_by_name('fontSize', 30);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 99);
    });

    test('Detach clears the inherited cache; reattach picks up the new parent value', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const a = new Surface();
        a._set_property_value_by_name('fontSize', 20);
        const b = new Surface();
        b._set_property_value_by_name('fontSize', 30);
        const child = new Surface();

        a.AddChild(child);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 20);

        a.RemoveChild(child);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 10);
        assert.equal(child.GetValueSource(resolveKey(child, undefined, 'fontSize')), PropertyValueSource.Default);

        b.AddChild(child);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 30);
    });

    test('ancestor mutation cascades down through a multi-level tree', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const mid = new Surface();
        const leaf = new Surface();
        root.AddChild(mid);
        mid.AddChild(leaf);

        root._set_property_value_by_name('fontSize', 16);
        assert.equal(mid.get_property_value(resolveKey(mid, undefined, 'fontSize')), 16);
        assert.equal(leaf.get_property_value(resolveKey(leaf, undefined, 'fontSize')), 16);
        assert.equal(leaf.GetValueSource(resolveKey(leaf, undefined, 'fontSize')), PropertyValueSource.InheritedValue);
    });

    test('a local override boundary stops the cascade for the subtree beyond it', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const mid = new Surface();
        const leaf = new Surface();
        root.AddChild(mid);
        mid.AddChild(leaf);

        // Mid takes an explicit override; leaf inherits from mid.
        mid._set_property_value_by_name('fontSize', 99);
        assert.equal(leaf.get_property_value(resolveKey(leaf, undefined, 'fontSize')), 99);

        // Changing root must NOT reach leaf — mid's override blocks the cascade.
        root._set_property_value_by_name('fontSize', 16);
        assert.equal(mid.get_property_value(resolveKey(mid, undefined, 'fontSize')), 99);
        assert.equal(leaf.get_property_value(resolveKey(leaf, undefined, 'fontSize')), 99);
    });

    test('a listener on the child fires when an ancestor changes the inherited value', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const child = new Surface();
        root.AddChild(child);

        const captures: Array<[unknown, unknown]> = [];
        child.AddPropertyChangedListener(resolveKey(child, undefined, 'fontSize'), (_m, _p, o, n) => { captures.push([o, n]); }, );

        root._set_property_value_by_name('fontSize', 16);
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![0], 10);   // was default
        assert.equal(captures[0]![1], 16);   // now inherited 16
    });

    test('a binding on the ancestor exposes the resolved value, not the Binding instance, to descendants', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);

        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const source = new Source();
        source._set_property_value_by_name('value', 42);

        const root = new Surface();
        root._set_property_value_by_name('fontSize', new Binding(source, 'value'));
        const child = new Surface();
        root.AddChild(child);

        // Child sees a number, not a Binding object.
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 42);
        assert.equal(child.GetValueSource(resolveKey(child, undefined, 'fontSize')), PropertyValueSource.InheritedValue);

        // When the binding's source changes, the resolved value propagates.
        source._set_property_value_by_name('value', 100);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 100);
    });

    test('ClearValue on an ancestor cascades descendants back to the default', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const child = new Surface();
        root.AddChild(child);

        root._set_property_value_by_name('fontSize', 16);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 16);

        root.ClearValue(resolveKey(root, undefined, 'fontSize'));
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 10);
        assert.equal(child.GetValueSource(resolveKey(child, undefined, 'fontSize')), PropertyValueSource.Default);
    });

    test('a non-inheritable property does not propagate at all', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'plain', 'default', MetaData.None);

        const root = new Surface();
        const child = new Surface();
        root.AddChild(child);

        root._set_property_value_by_name('plain', 'set-on-root');
        // Child still reads its own default, never the ancestor's value.
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'plain')), 'default');
        assert.equal(child.GetValueSource(resolveKey(child, undefined, 'plain')), PropertyValueSource.Default);
    });

    // Pins the staleness fix: when a higher-priority source masks
    // inheritance, ancestor mutations still refresh the cached
    // InheritedValue slot — they just don't fire notifications. When
    // the higher source later clears, the EVD falls through to the
    // CURRENT ancestor value rather than to the one captured before
    // the higher source was installed.
    test('inherited cache stays fresh while a local override shadows it', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const child = new Surface();
        root.AddChild(child);

        root._set_property_value_by_name('fontSize', 16);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 16);

        // Local override shadows inheritance.
        child._set_property_value_by_name('fontSize', 99);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 99);
        assert.equal(child.GetValueSource(resolveKey(child, undefined, 'fontSize')), PropertyValueSource.LocalValue);

        // Mutate the ancestor while the override is active. The child's
        // effective value stays 99 (the override still wins) but the
        // cached InheritedValue slot must be updated under the hood.
        root._set_property_value_by_name('fontSize', 24);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 99);

        // Clearing the override must reveal the FRESH ancestor value (24),
        // not the stale one (16) captured before the override was set.
        child.ClearValue(resolveKey(child, undefined, 'fontSize'));
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 24);
        assert.equal(child.GetValueSource(resolveKey(child, undefined, 'fontSize')), PropertyValueSource.InheritedValue);
    });

    // Same invariant from the other direction: when the ancestor's
    // value goes away entirely while the child is shadowed, clearing
    // the shadow must fall through to the default — not to the value
    // that was inherited before the ancestor cleared.
    test('inherited cache clears under shadow when ancestor stops providing a value', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const child = new Surface();
        root.AddChild(child);

        root._set_property_value_by_name('fontSize', 16);
        child._set_property_value_by_name('fontSize', 99);
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 99);

        // Ancestor stops providing a value while the override masks the
        // cache. Without the fix, the child's cached InheritedValue
        // would remain 16 and ClearValue would resurrect it.
        root.ClearValue(resolveKey(root, undefined, 'fontSize'));
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 99);

        child.ClearValue(resolveKey(child, undefined, 'fontSize'));
        assert.equal(child.get_property_value(resolveKey(child, undefined, 'fontSize')), 10);
        assert.equal(child.GetValueSource(resolveKey(child, undefined, 'fontSize')), PropertyValueSource.Default);
    });

    // Cross-shadowing across two layers: only the directly-shadowed
    // Visual needs its cache refreshed; descendants beyond the shadow
    // boundary keep inheriting from the shadowing Visual until ITS
    // shadow lifts, at which point the cascade reaches them through
    // the normal change-notification path.
    test('inherited cache refresh under shadow propagates correctly across multiple levels', () => {
        class Surface extends Panel {}
        Model.RegisterProperty(Surface, 'fontSize', 10, MetaData.Inherits);

        const root = new Surface();
        const mid  = new Surface();
        const leaf = new Surface();
        root.AddChild(mid);
        mid.AddChild(leaf);

        root._set_property_value_by_name('fontSize', 16);
        mid._set_property_value_by_name('fontSize', 99);
        // Leaf inherits from mid (the closer ancestor with a value).
        assert.equal(leaf.get_property_value(resolveKey(leaf, undefined, 'fontSize')), 99);

        // Mutate root while mid shadows. Mid's cache updates silently;
        // leaf's cache stays at 99 (still correct — mid still wins).
        root._set_property_value_by_name('fontSize', 24);
        assert.equal(leaf.get_property_value(resolveKey(leaf, undefined, 'fontSize')), 99);

        // Clear mid's override — cascade reaches leaf, which picks up
        // the fresh root value (24), not the stale 16.
        mid.ClearValue(resolveKey(mid, undefined, 'fontSize'));
        assert.equal(mid.get_property_value(resolveKey(mid, undefined, 'fontSize')), 24);
        assert.equal(leaf.get_property_value(resolveKey(leaf, undefined, 'fontSize')), 24);
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
        b._set_property_value_by_name(TextBlock, 'fontSize', 14);
        assert.equal(b.get_property_value(resolveKey(b, TextBlock, 'fontSize')), 14);
    });

    test('implicit-owner accessor throws for a property the target class does not know', () => {
        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.None);
        class Border extends Single {}

        const b = new Border();
        assert.throws(
            () => b._set_property_value_by_name('fontSize', 14),
            /not found in model 'Border'/,
        );
    });

    test('explicit-owner accessor throws when the owner does not have the property', () => {
        class TextBlock extends Model {}
        // fontSize not registered.
        const b = new Model();
        assert.throws(
            () => b._set_property_value_by_name(TextBlock, 'fontSize', 14),
            /not found on owner 'TextBlock'/,
        );
    });

    test('default value comes from the owner descriptor', () => {
        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.None);
        class Border extends Single {}

        const b = new Border();
        assert.equal(b.get_property_value(resolveKey(b, TextBlock, 'fontSize')), 12);
        assert.equal(b.GetValueSource(resolveKey(b, TextBlock, 'fontSize')), PropertyValueSource.Default);
    });

    test('two different owners can register a same-named property without collision', () => {
        class Foo extends Model {}
        class Bar extends Model {}
        Model.RegisterProperty(Foo, 'value', 'foo-default', MetaData.None);
        Model.RegisterProperty(Bar, 'value', 'bar-default', MetaData.None);

        const target = new Model();
        target._set_property_value_by_name(Foo, 'value', 'set-via-foo');
        target._set_property_value_by_name(Bar, 'value', 'set-via-bar');

        assert.equal(target.get_property_value(resolveKey(target, Foo, 'value')), 'set-via-foo');
        assert.equal(target.get_property_value(resolveKey(target, Bar, 'value')), 'set-via-bar');
    });

    test('listener registered with explicit-owner overload fires for that (owner, name) pair only', () => {
        class Foo extends Model {}
        class Bar extends Model {}
        Model.RegisterProperty(Foo, 'value', 0, MetaData.None);
        Model.RegisterProperty(Bar, 'value', 0, MetaData.None);

        const target = new Model();
        let fooFires = 0;
        let barFires = 0;
        target.AddPropertyChangedListener(resolveKey(target, Foo, 'value'), () => { fooFires++; });
        target.AddPropertyChangedListener(resolveKey(target, Bar, 'value'), () => { barFires++; });

        target._set_property_value_by_name(Foo, 'value', 1);
        assert.equal(fooFires, 1);
        assert.equal(barFires, 0);

        target._set_property_value_by_name(Bar, 'value', 2);
        assert.equal(fooFires, 1);
        assert.equal(barFires, 1);
    });

    test('ClearValue on an explicitly-owned property resets it to the owner default', () => {
        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.None);
        const b = new Model();
        b._set_property_value_by_name(TextBlock, 'fontSize', 99);
        assert.equal(b.get_property_value(resolveKey(b, TextBlock, 'fontSize')), 99);

        b.ClearValue(resolveKey(b, TextBlock, 'fontSize'));
        assert.equal(b.get_property_value(resolveKey(b, TextBlock, 'fontSize')), 12);
        assert.equal(b.GetValueSource(resolveKey(b, TextBlock, 'fontSize')), PropertyValueSource.Default);
    });

    test('Inherits cascades a cross-class property through descendants set on the ancestor', () => {
        // TextBlock.fontSize is the inheriting property; the value is
        // SET on a Border (an ancestor in the visual tree) that doesn't
        // know about TextBlock. Descendants that walk up find it.
        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.Inherits);

        class Border extends Panel {}

        const border = new Border();
        const child = new Visual();
        border.AddChild(child);

        border._set_property_value_by_name(TextBlock, 'fontSize', 16);
        assert.equal(child.get_property_value(resolveKey(child, TextBlock, 'fontSize')), 16);
        assert.equal(child.GetValueSource(resolveKey(child, TextBlock, 'fontSize')), PropertyValueSource.InheritedValue);
    });

    test('Binding on a cross-class property pushes the resolved value to the consumer', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);

        class TextBlock extends Model {}
        Model.RegisterProperty(TextBlock, 'fontSize', 12, MetaData.None);

        const source = new Source();
        source._set_property_value_by_name('value', 18);

        const consumer = new Model();
        const captures: Array<[unknown, unknown]> = [];
        consumer.AddPropertyChangedListener(resolveKey(consumer, TextBlock, 'fontSize'), (_m, _p, o, n) => { captures.push([o, n]); }, );

        consumer._set_property_value_by_name(TextBlock, 'fontSize', new Binding(source, 'value'));
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![1], 18);

        source._set_property_value_by_name('value', 22);
        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 18);
        assert.equal(captures[1]![1], 22);
    });

    test('RegisterAttachedProperty is a synonym for RegisterProperty', () => {
        class Grid extends Panel {}
        Model.RegisterAttachedProperty(Grid, 'Row', 0, MetaData.Arrange);

        const button = new Model();
        button._set_property_value_by_name(Grid, 'Row', 3);
        assert.equal(button.get_property_value(resolveKey(button, Grid, 'Row')), 3);
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
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        view._set_property_value_by_name('label', 'user-typed');

        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'user-typed');
        // Binding stays installed — the source is the canonical reference.
        assert.equal(view.GetValueSource(resolveKey(view, undefined, 'label')), PropertyValueSource.Binding);
    });

    test('writing to a property holding a OneWayToSource binding updates the source', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.OneWayToSource),
        );

        view._set_property_value_by_name('label', 'pushed');

        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'pushed');
        assert.equal(view.GetValueSource(resolveKey(view, undefined, 'label')), PropertyValueSource.Binding);
    });

    test('consumer listener fires exactly once with the right (old, new) transition', () => {
        const { company, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'label'), (_m, _p, o, n) => { captures.push([o, n]); }, );

        view._set_property_value_by_name('label', 'typed-by-user');
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![0], 'desk-1');
        assert.equal(captures[0]![1], 'typed-by-user');
    });

    test('source-side listener also fires for the writeback', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        let sourceFires = 0;
        desk.AddPropertyChangedListener(resolveKey(desk, undefined, 'label'), () => { sourceFires++; });

        view._set_property_value_by_name('label', 'typed-by-user');
        assert.equal(sourceFires, 1);
    });

    test('OneWay binding is still replaced by a target-side write (regression guard)', () => {
        const { company, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label'), // default OneWay
        );

        view._set_property_value_by_name('label', 'local-override');
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'local-override');
        assert.equal(view.GetValueSource(resolveKey(view, undefined, 'label')), PropertyValueSource.LocalValue);
    });

    test('TwoWay writeback through a deep chain reaches the leaf', () => {
        const { company, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        view._set_property_value_by_name('label', 'deep-write');
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'deep-write');
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'deep-write');
        // Binding still installed.
        assert.equal(view.GetValueSource(resolveKey(view, undefined, 'label')), PropertyValueSource.Binding);
    });

    test('writeback failure (severed intermediate) falls back to local-replace', () => {
        // Sever the chain so binding.set_value will return false, then write.
        const { company, manager, desk, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        manager._set_property_value_by_name('office', null); // path is now unwritable
        view._set_property_value_by_name('label', 'cannot-reach-desk');

        // Source desk is untouched (writeback failed).
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'label')), 'desk-1');
        // The binding got replaced as a local value so the user's write
        // isn't silently lost.
        assert.equal(view.GetValueSource(resolveKey(view, undefined, 'label')), PropertyValueSource.LocalValue);
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'cannot-reach-desk');
    });

    test('installing a new Binding replaces the old one (regression guard)', () => {
        // The TwoWay writeback path must not apply when the new value
        // IS a Binding — that branch should still install/replace.
        const { Company, Department, Manager, Office, Desk, company, ViewModel } = buildScene();
        const view = new ViewModel();
        view._set_property_value_by_name(
            'label',
            new Binding(company, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        // Build a second graph and bind to its leaf.
        const desk2 = new Desk();
        desk2._set_property_value_by_name('label', 'second-graph');
        const office2 = new Office();
        office2._set_property_value_by_name('desk', desk2);
        const manager2 = new Manager();
        manager2._set_property_value_by_name('office', office2);
        const department2 = new Department();
        department2._set_property_value_by_name('manager', manager2);
        const company2 = new Company();
        company2._set_property_value_by_name('department', department2);

        view._set_property_value_by_name(
            'label',
            new Binding(company2, 'department.manager.office.desk.label', BindingMode.TwoWay),
        );

        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'second-graph');
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
        button._set_property_value_by_name(Grid, 'Row', 5);

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
        child._set_property_value_by_name(Grid, 'Row', 7);
        const root = new Box();
        root._set_property_value_by_name('child', child);

        const binding = new Binding(root, 'child.(Grid.Row)');
        assert.equal(binding.get_value(), 7);
    });

    test('a regular segment mixes after an attached segment', () => {
        class Holder extends Model {}
        class Inner extends Model {}
        Model.RegisterProperty(Holder, 'Bag', null, MetaData.None);
        Model.RegisterProperty(Inner, 'value', 0, MetaData.None);

        const inner = new Inner();
        inner._set_property_value_by_name('value', 99);

        const target = new Model();
        target._set_property_value_by_name(Holder, 'Bag', inner);

        const binding = new Binding(target, '(Holder.Bag).value');
        assert.equal(binding.get_value(), 99);
    });

    test('push notification fires when the attached value changes on the source', () => {
        class Grid extends Model {}
        Model.RegisterProperty(Grid, 'Row', 0, MetaData.None);

        class ViewModel extends Model {}
        Model.RegisterProperty(ViewModel, 'echoed', 0, MetaData.None);

        const button = new Model();
        button._set_property_value_by_name(Grid, 'Row', 1);

        const view = new ViewModel();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'echoed'), (_m, _p, o, n) => { captures.push([o, n]); }, );

        view._set_property_value_by_name('echoed', new Binding(button, '(Grid.Row)'));
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![1], 1);

        button._set_property_value_by_name(Grid, 'Row', 9);
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
        view._set_property_value_by_name(
            'editable',
            new Binding(button, '(Grid.Row)', BindingMode.TwoWay),
        );

        view._set_property_value_by_name('editable', 11);
        assert.equal(button.get_property_value(resolveKey(button, Grid, 'Row')), 11);
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
        target._set_property_value_by_name(Holder, 'List', ['first', 'second', 'third']);

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
        assert.equal(w.get_property_value(resolveKey(w, undefined, 'actualWidth')), 42);
    });

    test('public set_property_value (implicit owner) throws on a read-only property', () => {
        class Widget extends Model {}
        Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Widget();
        assert.throws(
            () => w._set_property_value_by_name('actualWidth', 100),
            /is read-only/,
        );
    });

    test('public set_property_value (explicit owner) throws on a read-only property', () => {
        class Widget extends Model {}
        Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Model();
        assert.throws(
            () => w._set_property_value_by_name(Widget, 'actualWidth', 100),
            /is read-only/,
        );
    });

    test('set_property_value_with_key bypasses the gate and writes the value', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Widget();

        w.set_property_value_with_key(key, 250);
        assert.equal(w.get_property_value(resolveKey(w, undefined, 'actualWidth')), 250);
        assert.equal(w.GetValueSource(resolveKey(w, undefined, 'actualWidth')), PropertyValueSource.LocalValue);
    });

    test('public ClearValue throws on a read-only property; ClearValueWithKey works', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Widget();
        w.set_property_value_with_key(key, 250);

        assert.throws(() => w.ClearValue(resolveKey(w, undefined, 'actualWidth')), /is read-only/);
        w.ClearValueWithKey(key);
        assert.equal(w.get_property_value(resolveKey(w, undefined, 'actualWidth')), 0);
        assert.equal(w.GetValueSource(resolveKey(w, undefined, 'actualWidth')), PropertyValueSource.Default);
    });

    test('listeners fire when the property is written via the key', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Widget();
        const captures: Array<[unknown, unknown]> = [];
        w.AddPropertyChangedListener(resolveKey(w, undefined, 'actualWidth'), (_m, _p, o, n) => { captures.push([o, n]); }, );

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
        consumer._set_property_value_by_name('echoed', new Binding(widget, 'actualWidth'));

        assert.equal(consumer.get_property_value(resolveKey(consumer, undefined, 'echoed')), 320);

        // Source updates push through too.
        widget.set_property_value_with_key(key, 640);
        assert.equal(consumer.get_property_value(resolveKey(consumer, undefined, 'echoed')), 640);
    });

    test('installing a Binding on a read-only consumer property is blocked via public API', () => {
        class Widget extends Model {}
        Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);

        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);
        const src = new Source();

        const w = new Widget();
        assert.throws(
            () => w._set_property_value_by_name('actualWidth', new Binding(src, 'value')),
            /is read-only/,
        );
    });

    test('the owner can install a Binding on a read-only property via the key', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty(Widget, 'actualWidth', 0, MetaData.None);

        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);
        const src = new Source();
        src._set_property_value_by_name('value', 555);

        const w = new Widget();
        w.set_property_value_with_key(key, new Binding(src, 'value'));
        assert.equal(w.get_property_value(resolveKey(w, undefined, 'actualWidth')), 555);
        assert.equal(w.GetValueSource(resolveKey(w, undefined, 'actualWidth')), PropertyValueSource.Binding);
    });

    test('OverrideMetadata on a read-only property preserves the read-only flag', () => {
        class Base extends Model {}
        const ComputedKey = Model.RegisterReadOnlyProperty(Base, 'computed', 0, MetaData.None);
        class Derived extends Base {}
        Model.OverrideMetadata(Derived, ComputedKey, { default_value: 99 });

        const d = new Derived();
        assert.equal(d.get_property_value(resolveKey(d, undefined, 'computed')), 99);  // override default applies
        assert.throws(
            () => d._set_property_value_by_name('computed', 1),
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

// Pins the typed-PropertyKey surface: RegisterProperty returns a
// `PropertyKey<T>` whose phantom T flows through the typed overloads of
// get_property_value / set_property_value, so DPs can be accessed
// without `as T` casts. The string-keyed surface still works in parallel
// (the binding layer is inherently string-keyed and stays that way).
describe('Typed PropertyKey<T>', () => {
    test('RegisterProperty returns a PropertyKey whose descriptor matches', () => {
        class Widget extends Model {}
        const key = Model.RegisterProperty<number>(Widget, 'width', 0, MetaData.None);
        assert.ok(key instanceof PropertyKey);
        assert.equal(key.descriptor.Name, 'width');
        assert.equal(key.descriptor.IsReadOnly, false);
    });

    test('get_property_value(key) and set_property_value(key, v) round-trip', () => {
        class Widget extends Model {}
        const widthKey = Model.RegisterProperty<number>(Widget, 'width', 10, MetaData.None);
        const w = new Widget();

        // Default read via key.
        assert.equal(w.get_property_value(widthKey), 10);

        // Typed write + typed read.
        w.set_property_value(widthKey, 42);
        assert.equal(w.get_property_value(widthKey), 42);

        // The string-keyed surface sees the same value — same DP, two access paths.
        assert.equal(w.get_property_value(resolveKey(w, undefined, 'width')), 42);
    });

    test('RegisterProperty is idempotent — re-registering returns a key for the existing descriptor', () => {
        class Widget extends Model {}
        const a = Model.RegisterProperty<number>(Widget, 'width', 10, MetaData.None);
        const b = Model.RegisterProperty<number>(Widget, 'width', 999, MetaData.None);
        // Same underlying descriptor; default value of the first wins.
        assert.equal(a.descriptor, b.descriptor);
        const w = new Widget();
        assert.equal(w.get_property_value(b), 10);
    });

    test('set_property_value(key, …) refuses to write a read-only DP', () => {
        class Widget extends Model {}
        const key = Model.RegisterReadOnlyProperty<number>(Widget, 'actualWidth', 0, MetaData.None);
        const w = new Widget();
        assert.throws(
            () => w.set_property_value(key, 100),
            /is read-only/,
        );
        // set_property_value_with_key remains the privileged escape hatch.
        w.set_property_value_with_key(key, 100);
        assert.equal(w.get_property_value(key), 100);
    });

    test('listeners attached by key fire on writes that go through any surface', () => {
        class Widget extends Model {}
        const widthKey = Model.RegisterProperty<number>(Widget, 'width', 0, MetaData.None);
        const w = new Widget();
        const captures: Array<[unknown, unknown]> = [];
        w.AddPropertyChangedListener(widthKey, (_m, _p, o, n) => { captures.push([o, n]); });

        w.set_property_value(widthKey, 7);            // typed write
        w._set_property_value_by_name('width', 8);              // string-keyed write — same DP
        assert.equal(captures.length, 2);
        assert.deepEqual(captures[0], [0, 7]);
        assert.deepEqual(captures[1], [7, 8]);
    });

    test('RemovePropertyChangedListener(key, cb) removes the listener', () => {
        class Widget extends Model {}
        const widthKey = Model.RegisterProperty<number>(Widget, 'width', 0, MetaData.None);
        const w = new Widget();
        const captures: Array<[unknown, unknown]> = [];
        const cb: PropertyChangeCallback = (_m, _p, o, n) => { captures.push([o, n]); };
        w.AddPropertyChangedListener(widthKey, cb);

        w.set_property_value(widthKey, 1);
        w.RemovePropertyChangedListener(widthKey, cb);
        w.set_property_value(widthKey, 2);

        assert.equal(captures.length, 1);
        assert.deepEqual(captures[0], [0, 1]);
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
        src._set_property_value_by_name('middleName', null);

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
        src._set_property_value_by_name('value', null);
        assert.equal(b.get_value(), 'NULL');
        src._set_property_value_by_name('value', 'real');
        assert.equal(b.get_value(), 'real');
    });

    test('push notification: source goes undefined → consumer sees fallbackValue', () => {
        class Holder extends Model {}
        Model.RegisterProperty(Holder, 'inner', null, MetaData.None);
        class Inner extends Model {}
        Model.RegisterProperty(Inner, 'value', '', MetaData.None);

        const inner = new Inner();
        inner._set_property_value_by_name('value', 'present');
        const holder = new Holder();
        holder._set_property_value_by_name('inner', inner);

        class View extends Model {}
        Model.RegisterProperty(View, 'echoed', '', MetaData.None);
        const view = new View();
        const captures: Array<[unknown, unknown]> = [];
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'echoed'), (_m, _p, o, n) => { captures.push([o, n]); }, );

        view._set_property_value_by_name(
            'echoed',
            new Binding(holder, 'inner.value', BindingMode.OneWay, {
                fallbackValue: 'GONE',
            }),
        );
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![1], 'present');

        holder._set_property_value_by_name('inner', null);
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
        src._set_property_value_by_name('celsius', 100);

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
        assert.equal(src.get_property_value(resolveKey(src, undefined, 'celsius')), 100);
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
        assert.equal(src.get_property_value(resolveKey(src, undefined, 'value')), 'raw');
    });

    test('converter runs before fallback in the pipeline', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);
        const src = new Source();
        src._set_property_value_by_name('value', 5);

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
        src._set_property_value_by_name('value', 0);
        assert.equal(b.get_value(), 'NULL');
    });

    test('push notification fires only when the post-pipeline value differs', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'value', 0, MetaData.None);
        const src = new Source();
        src._set_property_value_by_name('value', 1);

        // Converter that clamps everything to 0 or 1.
        const conv: ValueConverter = {
            convert(v: any): any { return (v as number) > 0 ? 1 : 0; },
        };
        class View extends Model {}
        Model.RegisterProperty(View, 'echoed', 0, MetaData.None);
        const view = new View();
        let fires = 0;
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'echoed'), () => { fires++; });

        view._set_property_value_by_name(
            'echoed',
            new Binding(src, 'value', BindingMode.OneWay, { converter: conv }),
        );
        // install fires once
        assert.equal(fires, 1);

        // Pre-pipeline: 1 → 5. Post-pipeline: 1 → 1 (both clamped). No fire.
        src._set_property_value_by_name('value', 5);
        assert.equal(fires, 1);

        // Pre-pipeline: 5 → 0. Post-pipeline: 1 → 0. Fires.
        src._set_property_value_by_name('value', 0);
        assert.equal(fires, 2);
    });
});

// Pins backlog item 3.3: StringFormat on Binding.
describe('Binding pipeline — StringFormat', () => {
    test("simple '{0}' substitution", () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'count', 0, MetaData.None);
        const src = new Source();
        src._set_property_value_by_name('count', 42);

        const b = new Binding(src, 'count', BindingMode.OneWay, {
            stringFormat: '$ {0}',
        });
        assert.equal(b.get_value(), '$ 42');
    });

    test('stringFormat composes after a user-supplied converter', () => {
        class Source extends Model {}
        Model.RegisterProperty(Source, 'name', '', MetaData.None);
        const src = new Source();
        src._set_property_value_by_name('name', 'world');

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
        src._set_property_value_by_name('count', 42);

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
        assert.equal(src.get_property_value(resolveKey(src, undefined, 'count')), 123);
    });
});

// Pins backlog item 3.8: default-mode inference.
// A property registered with MetaData.BindsTwoWayByDefault flips an
// install-time binding's mode to TwoWay when the binding was constructed
// without an explicit mode (WPF parity with
// FrameworkPropertyMetadataOptions.BindsTwoWayByDefault). Explicit modes
// are preserved.
describe('Binding default-mode inference (BindsTwoWayByDefault)', () => {
    test('an unset mode flips to TwoWay when the target declares BindsTwoWayByDefault', () => {
        class Source extends Model {}
        class Target extends Model {}
        Model.RegisterProperty(Source, 'v', 0, MetaData.None);
        Model.RegisterProperty(Target, 'x', 0, MetaData.BindsTwoWayByDefault);

        const src = new Source();
        src._set_property_value_by_name('v', 7);
        const tgt = new Target();

        const b = new Binding(src, 'v'); // no explicit mode
        tgt._set_property_value_by_name('x', b);

        // The reader is wired up.
        assert.equal(tgt.get_property_value(resolveKey(tgt, undefined, 'x')), 7);
        // Mode was inferred at install time.
        assert.equal(b.mode, BindingMode.TwoWay);
        // Writeback through the target now flows to the source.
        tgt._set_property_value_by_name('x', 99);
        assert.equal(src.get_property_value(resolveKey(src, undefined, 'v')), 99);
        assert.equal(tgt.GetValueSource(resolveKey(tgt, undefined, 'x')), PropertyValueSource.Binding);
    });

    test('an unset mode stays OneWay when the target does NOT declare BindsTwoWayByDefault', () => {
        class Source extends Model {}
        class Target extends Model {}
        Model.RegisterProperty(Source, 'v', 0, MetaData.None);
        Model.RegisterProperty(Target, 'x', 0, MetaData.None);

        const src = new Source();
        src._set_property_value_by_name('v', 7);
        const tgt = new Target();

        const b = new Binding(src, 'v');
        tgt._set_property_value_by_name('x', b);

        assert.equal(b.mode, BindingMode.OneWay);
        // Target-side write replaces the OneWay binding as a local value
        // (existing 3.4 / 3.9 behavior — regression guard).
        tgt._set_property_value_by_name('x', 99);
        assert.equal(src.get_property_value(resolveKey(src, undefined, 'v')), 7);
        assert.equal(tgt.GetValueSource(resolveKey(tgt, undefined, 'x')), PropertyValueSource.LocalValue);
    });

    test('an explicit OneWay overrides BindsTwoWayByDefault — explicit mode always wins', () => {
        class Source extends Model {}
        class Target extends Model {}
        Model.RegisterProperty(Source, 'v', 0, MetaData.None);
        Model.RegisterProperty(Target, 'x', 0, MetaData.BindsTwoWayByDefault);

        const src = new Source();
        src._set_property_value_by_name('v', 7);
        const tgt = new Target();

        const b = new Binding(src, 'v', BindingMode.OneWay);
        tgt._set_property_value_by_name('x', b);

        assert.equal(b.mode, BindingMode.OneWay);
        tgt._set_property_value_by_name('x', 99);
        assert.equal(src.get_property_value(resolveKey(src, undefined, 'v')), 7);
    });

    test('an explicit TwoWay is preserved when the target does NOT declare BindsTwoWayByDefault', () => {
        class Source extends Model {}
        class Target extends Model {}
        Model.RegisterProperty(Source, 'v', 0, MetaData.None);
        Model.RegisterProperty(Target, 'x', 0, MetaData.None);

        const src = new Source();
        src._set_property_value_by_name('v', 7);
        const tgt = new Target();

        const b = new Binding(src, 'v', BindingMode.TwoWay);
        tgt._set_property_value_by_name('x', b);

        assert.equal(b.mode, BindingMode.TwoWay);
        tgt._set_property_value_by_name('x', 99);
        assert.equal(src.get_property_value(resolveKey(src, undefined, 'v')), 99);
    });

    test('mode is OneWay before install (only the install path consults the descriptor)', () => {
        // The Binding constructor doesn't know its eventual target, so
        // the inferred-default cannot apply at construction time. It
        // must remain the constructor's fallback (OneWay) until install.
        class Source extends Model {}
        Model.RegisterProperty(Source, 'v', 0, MetaData.None);
        const src = new Source();

        const b = new Binding(src, 'v');
        assert.equal(b.mode, BindingMode.OneWay);
    });

    test('BindsTwoWayByDefault composes with other MetaData flags', () => {
        // Pin that the new flag occupies its own bit and doesn't collide
        // with the existing Measure / Render / Inherits / Arrange ones.
        class Source extends Model {}
        class Target extends Model {}
        Model.RegisterProperty(Source, 'v', 0, MetaData.None);
        Model.RegisterProperty(
            Target,
            'x',
            0,
            MetaData.Render | MetaData.BindsTwoWayByDefault,
        );

        const src = new Source();
        src._set_property_value_by_name('v', 7);
        const tgt = new Target();

        const b = new Binding(src, 'v');
        tgt._set_property_value_by_name('x', b);

        assert.equal(b.mode, BindingMode.TwoWay);
        tgt._set_property_value_by_name('x', 99);
        assert.equal(src.get_property_value(resolveKey(src, undefined, 'v')), 99);
    });
});

// Test-side helpers + stub host for the VisualHost back-pointer tests.
// Visual's `target` getter and `SetTarget` mutator are both protected;
// these reach in via bracket access — same pattern the production code
// uses when one Visual subclass needs to drive another's tree-walk hooks.
class TestHost implements VisualHost
{
    public measure_marked: Visual[] = [];
    public arrange_marked: Visual[] = [];
    public render_marked: Visual[] = [];
    public OnMeasureInvalidated(v: Visual): void { this.measure_marked.push(v); }
    public OnArrangeInvalidated(v: Visual): void { this.arrange_marked.push(v); }
    public OnRenderInvalidated(v: Visual):  void { this.render_marked.push(v); }
    // VisualHost gained a text measurement service — the tests don't
    // exercise it, so we plug in the stateless default.
    public readonly TextMeasurer = APPROXIMATE_TEXT_MEASURER;
}

function target_of(v: Visual): VisualHost | undefined
{
    return (v as unknown as { target: VisualHost | undefined }).target;
}

function set_target(v: Visual, host: VisualHost | undefined): void
{
    (v as unknown as { SetTarget(h: VisualHost | undefined): void }).SetTarget(host);
}

// Pins the design point in visual-engine-design.md §3 / connection
// discussion: every Visual exposes an O(1) back-pointer to the
// PresentationTarget (any VisualHost) that owns its root, propagated
// through Attach/Detach and seeded by the root assignment. The Visual's
// InvalidateMeasure / InvalidateArrange / InvalidateVisual methods use
// it to route per-phase notifications into the host's dirty queues
// without walking the parent chain.
describe('VisualHost back-pointer (target) on Visual', () => {
    test('a standalone Visual has no target', () => {
        const v = new Visual();
        assert.equal(target_of(v), undefined);
    });

    test('SetTarget on a leaf Visual sets and clears its target', () => {
        const v = new Visual();
        const host = new TestHost();
        set_target(v, host);
        assert.equal(target_of(v), host);
        set_target(v, undefined);
        assert.equal(target_of(v), undefined);
    });

    test('SetTarget on a Panel cascades to all children', () => {
        const root = new Panel();
        const a = new Visual();
        const b = new Visual();
        root.AddChild(a);
        root.AddChild(b);

        const host = new TestHost();
        set_target(root, host);
        assert.equal(target_of(root), host);
        assert.equal(target_of(a),    host);
        assert.equal(target_of(b),    host);
    });

    test('SetTarget on a Single cascades to its child and a deeper subtree', () => {
        const root = new Single();
        const mid  = new Panel();
        const leaf = new Visual();
        root.SetChild(mid);
        mid.AddChild(leaf);

        const host = new TestHost();
        set_target(root, host);
        assert.equal(target_of(root), host);
        assert.equal(target_of(mid),  host);
        assert.equal(target_of(leaf), host);
    });

    test('Attach on a mounted Panel propagates target to the new child', () => {
        const root = new Panel();
        const host = new TestHost();
        set_target(root, host);

        const fresh = new Visual();
        assert.equal(target_of(fresh), undefined);

        root.AddChild(fresh);
        assert.equal(target_of(fresh), host);
    });

    test('Detach clears target on the detached subtree', () => {
        const root = new Panel();
        const mid  = new Panel();
        const leaf = new Visual();
        root.AddChild(mid);
        mid.AddChild(leaf);

        const host = new TestHost();
        set_target(root, host);
        assert.equal(target_of(leaf), host);

        root.RemoveChild(mid);
        assert.equal(target_of(mid),  undefined);
        assert.equal(target_of(leaf), undefined);
    });

    test('moving a subtree from one host to another via detach+attach', () => {
        const host1 = new TestHost();
        const host2 = new TestHost();
        const root1 = new Panel();
        const root2 = new Panel();
        set_target(root1, host1);
        set_target(root2, host2);

        const moving = new Single();
        const leaf   = new Visual();
        moving.SetChild(leaf);
        root1.AddChild(moving);
        assert.equal(target_of(moving), host1);
        assert.equal(target_of(leaf),   host1);

        root1.RemoveChild(moving);
        root2.AddChild(moving);
        assert.equal(target_of(moving), host2);
        assert.equal(target_of(leaf),   host2);
    });

    test('SetTarget throws when reassigning to a different non-undefined host', () => {
        const v = new Visual();
        const host1 = new TestHost();
        const host2 = new TestHost();
        set_target(v, host1);
        assert.throws(() => set_target(v, host2), /already attached to a host/);
    });

    test('SetTarget is idempotent — setting the same host twice does not throw', () => {
        const v = new Visual();
        const host = new TestHost();
        set_target(v, host);
        set_target(v, host); // no-op
        assert.equal(target_of(v), host);
    });

    test('InvalidateVisual on an attached Visual routes to target.OnRenderInvalidated', () => {
        class Renderer extends Element
        {
            static {
                Model.RegisterProperty(Renderer, 'flag', false, MetaData.Render);
            }
        }
        const host = new TestHost();
        const v = new Renderer();
        set_target(v, host);

        v._set_property_value_by_name('flag', true);
        assert.deepEqual(host.render_marked, [v]);
        assert.deepEqual(host.measure_marked, []);
        assert.deepEqual(host.arrange_marked, []);
    });

    test('InvalidateVisual on a detached Visual is silent (no error)', () => {
        class Renderer extends Element
        {
            static {
                Model.RegisterProperty(Renderer, 'flag', false, MetaData.Render);
            }
        }
        const v = new Renderer();
        // No target set — property change must not throw.
        assert.doesNotThrow(() => v._set_property_value_by_name('flag', true));
    });

    test('a Render-flagged property on a deeply-nested Visual still routes to host', () => {
        class Leaf extends Element
        {
            static {
                Model.RegisterProperty(Leaf, 'flag', false, MetaData.Render);
            }
        }

        const host = new TestHost();
        const root = new Panel();
        const mid  = new Single();
        const leaf = new Leaf();
        root.AddChild(mid);
        mid.SetChild(leaf);
        set_target(root, host);

        leaf._set_property_value_by_name('flag', true);
        assert.deepEqual(host.render_marked, [leaf]);
    });

    test('a Measure+Arrange property routes to both host queues with the right Visual', () => {
        class Box extends Element
        {
            static {
                Model.RegisterProperty(Box, 'size', 0, MetaData.Measure | MetaData.Arrange);
            }
        }
        const host = new TestHost();
        const v = new Box();
        set_target(v, host);

        v._set_property_value_by_name('size', 10);
        assert.deepEqual(host.measure_marked, [v]);
        assert.deepEqual(host.arrange_marked, [v]);
        assert.deepEqual(host.render_marked,  []);
    });
});

// Pins the public Measure / Arrange / Render lifecycle on Visual: the
// caching, the cross-phase invalidation cascade, and the
// MeasureOverride / ArrangeOverride / RenderOverride hooks subclasses
// implement.
describe('Visual layout lifecycle (Measure / Arrange / Render)', () => {
    // Layout-aware test Visual: counts every override call and records
    // the last availableSize / finalSize / dc seen. Configurable
    // DesiredSize lets tests assert the cache reflects whatever
    // MeasureOverride returned.
    class LaidOutVisual extends Element
    {
        public measure_calls = 0;
        public arrange_calls = 0;
        public render_calls  = 0;
        public last_available: Size | undefined;
        public last_final: Size | undefined;
        public last_dc: DrawingContext | undefined;

        constructor(private readonly fixed_desired: Size = new Size(100, 50)) { super(); }

        protected override MeasureOverride(availableSize: Size): Size
        {
            this.measure_calls++;
            this.last_available = availableSize;
            return this.fixed_desired;
        }

        protected override ArrangeOverride(finalSize: Size): Size
        {
            this.arrange_calls++;
            this.last_final = finalSize;
            return finalSize;
        }

        protected override RenderOverride(dc: DrawingContext): void
        {
            this.render_calls++;
            this.last_dc = dc;
        }
    }

    // Empty DrawingContext stand-in — the runtime-side interface is a
    // marker; visual-engine augments the method surface.
    const noop_dc: DrawingContext = {} as DrawingContext;

    test('initial state is invalid and zero-sized', () => {
        const v = new LaidOutVisual();
        assert.equal(v.IsMeasureValid, false);
        assert.equal(v.IsArrangeValid, false);
        assert.ok(v.DesiredSize.Equals(Size.Zero));
        assert.ok(v.RenderSize.Equals(Size.Zero));
        assert.ok(v.ArrangedRect.Equals(Rect.Zero));
    });

    test('Measure runs MeasureOverride, caches DesiredSize, marks measure valid', () => {
        const v = new LaidOutVisual(new Size(200, 100));
        v.Measure(new Size(500, 500));
        assert.equal(v.measure_calls, 1);
        assert.ok(v.last_available!.Equals(new Size(500, 500)));
        assert.ok(v.DesiredSize.Equals(new Size(200, 100)));
        assert.equal(v.IsMeasureValid, true);
    });

    test('Measure with the same availableSize is cached (no re-call)', () => {
        const v = new LaidOutVisual();
        v.Measure(new Size(500, 500));
        v.Measure(new Size(500, 500));
        v.Measure(new Size(500, 500));
        assert.equal(v.measure_calls, 1);
    });

    test('Measure with a different availableSize re-runs MeasureOverride', () => {
        const v = new LaidOutVisual();
        v.Measure(new Size(500, 500));
        v.Measure(new Size(600, 700));
        assert.equal(v.measure_calls, 2);
        assert.ok(v.last_available!.Equals(new Size(600, 700)));
    });

    test('Measure invalidates a previously-valid Arrange (new desired size needs new arrangement)', () => {
        const v = new LaidOutVisual();
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(v.IsArrangeValid, true);

        v.Measure(new Size(800, 800));
        assert.equal(v.IsArrangeValid, false);
    });

    test('Arrange runs ArrangeOverride, caches RenderSize and ArrangedRect', () => {
        const v = new LaidOutVisual();
        v.Measure(new Size(500, 500));
        const rect = new Rect(10, 20, 200, 100);
        v.Arrange(rect);
        assert.equal(v.arrange_calls, 1);
        assert.ok(v.last_final!.Equals(new Size(200, 100)));
        assert.ok(v.RenderSize.Equals(new Size(200, 100)));
        assert.ok(v.ArrangedRect.Equals(rect));
        assert.equal(v.IsArrangeValid, true);
    });

    test('Arrange with the same finalRect is cached (no re-call)', () => {
        const v = new LaidOutVisual();
        v.Measure(new Size(500, 500));
        const rect = new Rect(0, 0, 100, 50);
        v.Arrange(rect);
        v.Arrange(rect);
        v.Arrange(rect);
        assert.equal(v.arrange_calls, 1);
    });

    test('Arrange forces a Measure if measure state is invalid', () => {
        const v = new LaidOutVisual();
        v.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(v.measure_calls, 1);
        assert.equal(v.arrange_calls, 1);
        assert.equal(v.IsMeasureValid, true);
        assert.equal(v.IsArrangeValid, true);
    });

    test('Render runs RenderOverride and passes the DC through unchanged', () => {
        const v = new LaidOutVisual();
        v.Render(noop_dc);
        assert.equal(v.render_calls, 1);
        assert.equal(v.last_dc, noop_dc);
    });

    test('InvalidateMeasure clears both measure and arrange validity', () => {
        const v = new LaidOutVisual();
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(v.IsMeasureValid, true);
        assert.equal(v.IsArrangeValid, true);

        v.InvalidateMeasure();
        assert.equal(v.IsMeasureValid, false);
        assert.equal(v.IsArrangeValid, false);
    });

    test('InvalidateArrange clears only arrange validity (measure stays cached)', () => {
        const v = new LaidOutVisual();
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 100, 100));

        v.InvalidateArrange();
        assert.equal(v.IsMeasureValid, true);
        assert.equal(v.IsArrangeValid, false);
    });

    test('InvalidateVisual does not affect measure/arrange validity (render has no cached state)', () => {
        const v = new LaidOutVisual();
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 100, 100));

        v.InvalidateVisual();
        assert.equal(v.IsMeasureValid, true);
        assert.equal(v.IsArrangeValid, true);
    });

    test('base Visual default MeasureOverride returns Size.Zero', () => {
        const v = new Visual();
        v.Measure(new Size(500, 500));
        assert.ok(v.DesiredSize.Equals(Size.Zero));
    });

    test('base Visual default ArrangeOverride returns finalSize as RenderSize', () => {
        const v = new Visual();
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(10, 10, 200, 100));
        assert.ok(v.RenderSize.Equals(new Size(200, 100)));
    });

    test('parent MeasureOverride can call child.Measure and read child.DesiredSize', () => {
        // A custom Panel that sums child widths and takes the max child
        // height — the classic "horizontal stack" measure pattern.
        class HorizontalStack extends Panel
        {
            protected override MeasureOverride(availableSize: Size): Size
            {
                let width = 0;
                let height = 0;
                for (const child of this.Children)
                {
                    child.Measure(availableSize);
                    width += child.DesiredSize.Width;
                    height = Math.max(height, child.DesiredSize.Height);
                }
                return new Size(width, height);
            }
        }

        const stack = new HorizontalStack();
        const a = new LaidOutVisual(new Size(100, 50));
        const b = new LaidOutVisual(new Size(200, 30));
        const c = new LaidOutVisual(new Size(50,  80));
        stack.AddChild(a);
        stack.AddChild(b);
        stack.AddChild(c);

        stack.Measure(new Size(1000, 1000));
        assert.ok(stack.DesiredSize.Equals(new Size(350, 80)));
        assert.ok(a.DesiredSize.Equals(new Size(100, 50)));
        assert.ok(b.DesiredSize.Equals(new Size(200, 30)));
        assert.ok(c.DesiredSize.Equals(new Size(50,  80)));
    });

    test('a Measure-flagged property change invalidates measure (and arrange)', () => {
        class Sized extends LaidOutVisual
        {
            static {
                Model.RegisterProperty(Sized, 'shape', 0, MetaData.Measure);
            }
        }
        const v = new Sized();
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(v.IsMeasureValid, true);
        assert.equal(v.IsArrangeValid, true);

        v._set_property_value_by_name('shape', 1);
        assert.equal(v.IsMeasureValid, false);
        assert.equal(v.IsArrangeValid, false);
    });

    test('a Render-flagged property change leaves measure and arrange valid', () => {
        class Painted extends LaidOutVisual
        {
            static {
                Model.RegisterProperty(Painted, 'color', 'red', MetaData.Render);
            }
        }
        const v = new Painted();
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 100, 100));

        v._set_property_value_by_name('color', 'blue');
        assert.equal(v.IsMeasureValid, true);
        assert.equal(v.IsArrangeValid, true);
    });

    // Width / Height — explicit size constraints. NaN sentinel means
    // "size to content"; any number wins over MeasureOverride and clamps
    // ArrangeOverride's finalSize.

    test('default Width and Height are NaN ("size to content")', () => {
        const v = new Visual();
        assert.equal(Number.isNaN(v.Width),  true);
        assert.equal(Number.isNaN(v.Height), true);
    });

    test('setting Width invalidates measure (MetaData.Measure on the property)', () => {
        const v = new LaidOutVisual();
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(v.IsMeasureValid, true);
        assert.equal(v.IsArrangeValid, true);

        v.Width = 50;
        assert.equal(v.IsMeasureValid, false);
        assert.equal(v.IsArrangeValid, false);
    });

    test('Measure with explicit Width overrides whatever MeasureOverride returns', () => {
        const v = new LaidOutVisual(new Size(80, 40));
        v.Width = 200;
        v.Measure(new Size(500, 500));
        assert.equal(v.DesiredSize.Width,  200);
        assert.equal(v.DesiredSize.Height, 40);
    });

    test('Measure with explicit Height overrides whatever MeasureOverride returns', () => {
        const v = new LaidOutVisual(new Size(80, 40));
        v.Height = 200;
        v.Measure(new Size(500, 500));
        assert.equal(v.DesiredSize.Width,  80);
        assert.equal(v.DesiredSize.Height, 200);
    });

    test('explicit Width clamps the availableSize passed to MeasureOverride (when Width < available)', () => {
        const v = new LaidOutVisual();
        v.Width = 50;
        v.Measure(new Size(500, 500));
        // MeasureOverride should see (50, 500) as the constrained available.
        assert.ok(v.last_available!.Equals(new Size(50, 500)));
    });

    test('explicit Width larger than available still passes the explicit Width to MeasureOverride (WPF MinMax semantics)', () => {
        // With Width set, the per-axis [min, max] range collapses to
        // [Width, Width]. The clamp(available, min, max) call forces the
        // value back UP to Width when available is smaller. MeasureOverride
        // then sees the asserted size — its children measure themselves
        // against what the Visual will actually be, not what the parent
        // happens to have offered. DesiredSize reflects the same.
        const v = new LaidOutVisual();
        v.Width = 1000;
        v.Measure(new Size(500, 500));
        assert.ok(v.last_available!.Equals(new Size(1000, 500)));
        assert.equal(v.DesiredSize.Width, 1000);
    });

    test('explicit Width clamps the finalSize handed to ArrangeOverride (even if the parent gives more)', () => {
        const v = new LaidOutVisual();
        v.Width = 100;
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 300, 300));
        assert.ok(v.last_final!.Equals(new Size(100, 300)));
        // RenderSize follows ArrangeOverride's return (defaults to finalSize).
        assert.ok(v.RenderSize.Equals(new Size(100, 300)));
    });

    test('Arrange centers a Stretch-aligned Visual with explicit Width / Height inside its parent slot', () => {
        // Default HorizontalAlignment + VerticalAlignment = Stretch. With
        // an explicit size that's smaller than the slot, Stretch falls
        // back to Center (WPF semantics). ArrangedRect becomes the final
        // aligned rect — slot origin + alignment offset, size = render
        // size — not the raw parent slot.
        const v = new LaidOutVisual();
        v.Width  = 100;
        v.Height = 80;
        const slot = new Rect(10, 20, 300, 200);
        v.Measure(new Size(500, 500));
        v.Arrange(slot);
        // offsetX = (300 - 100) / 2 = 100; offsetY = (200 - 80) / 2 = 60.
        assert.ok(v.ArrangedRect.Equals(new Rect(10 + 100, 20 + 60, 100, 80)));
        assert.ok(v.RenderSize.Equals(new Size(100, 80)));
    });

    test('clearing Width back to NaN re-enables MeasureOverride-driven sizing', () => {
        const v = new LaidOutVisual(new Size(80, 40));
        v.Width = 200;
        v.Measure(new Size(500, 500));
        assert.equal(v.DesiredSize.Width, 200);

        v.Width = Number.NaN;
        v.Measure(new Size(500, 500));
        assert.equal(v.DesiredSize.Width, 80);
    });

    // MinWidth / MinHeight / MaxWidth / MaxHeight — range constraints
    // resolved together with Width / Height into a single [min, max]
    // per axis. Default range is [0, +Infinity] = no constraint.

    test('MinWidth floors DesiredSize when MeasureOverride returns smaller', () => {
        const v = new LaidOutVisual(new Size(20, 50));
        v.MinWidth = 100;
        v.Measure(new Size(500, 500));
        assert.equal(v.DesiredSize.Width, 100);
        assert.equal(v.DesiredSize.Height, 50);
    });

    test('MaxWidth caps DesiredSize when MeasureOverride returns larger', () => {
        const v = new LaidOutVisual(new Size(500, 50));
        v.MaxWidth = 200;
        v.Measure(new Size(1000, 1000));
        assert.equal(v.DesiredSize.Width, 200);
        assert.equal(v.DesiredSize.Height, 50);
    });

    test('MinHeight + MaxHeight together define a vertical range', () => {
        const v = new LaidOutVisual(new Size(10, 5));
        v.MinHeight = 20;
        v.MaxHeight = 100;
        v.Measure(new Size(500, 500));
        // MeasureOverride returned Height=5, floored by MinHeight=20.
        assert.equal(v.DesiredSize.Height, 20);

        const v2 = new LaidOutVisual(new Size(10, 500));
        v2.MinHeight = 20;
        v2.MaxHeight = 100;
        v2.Measure(new Size(500, 500));
        // MeasureOverride returned Height=500, capped by MaxHeight=100.
        assert.equal(v2.DesiredSize.Height, 100);
    });

    test('explicit Width clamped by user MinWidth wins when Width < MinWidth', () => {
        const v = new LaidOutVisual();
        v.MinWidth = 100;
        v.Width    = 50;  // conflicts — MinWidth wins
        v.Measure(new Size(500, 500));
        assert.equal(v.DesiredSize.Width, 100);
    });

    test('explicit Width clamped by user MaxWidth wins when Width > MaxWidth', () => {
        const v = new LaidOutVisual();
        v.MaxWidth = 100;
        v.Width    = 500;
        v.Measure(new Size(500, 500));
        assert.equal(v.DesiredSize.Width, 100);
    });

    test('MeasureOverride availableSize is clamped to the resolved [min, max] range', () => {
        const v = new LaidOutVisual();
        v.MinWidth = 200;
        v.MaxWidth = 400;
        v.Measure(new Size(50, 50));
        // available.Width = 50 floored to MinWidth = 200.
        assert.ok(v.last_available!.Equals(new Size(200, 50)));
    });

    // HorizontalAlignment / VerticalAlignment — positioning within the
    // parent slot when render area is smaller than slot. Defaults Stretch.

    test('default HorizontalAlignment and VerticalAlignment are Stretch', () => {
        const v = new Visual();
        assert.equal(v.HorizontalAlignment, HorizontalAlignment.Stretch);
        assert.equal(v.VerticalAlignment,   VerticalAlignment.Stretch);
    });

    test('Stretch without explicit size fills the slot — ArrangedRect equals the slot', () => {
        const v = new LaidOutVisual(new Size(50, 40));
        const slot = new Rect(10, 20, 300, 200);
        v.Measure(new Size(500, 500));
        v.Arrange(slot);
        assert.ok(v.ArrangedRect.Equals(slot));
        assert.ok(v.RenderSize.Equals(new Size(300, 200)));
    });

    test('Left alignment + explicit Width positions render area at slot.X', () => {
        const v = new LaidOutVisual();
        v.Width = 100;
        v.HorizontalAlignment = HorizontalAlignment.Left;
        v.VerticalAlignment   = VerticalAlignment.Stretch;
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(10, 20, 300, 200));
        assert.equal(v.ArrangedRect.X,      10);
        assert.equal(v.ArrangedRect.Width,  100);
        // Vertical stretch — fills the slot.
        assert.equal(v.ArrangedRect.Y,      20);
        assert.equal(v.ArrangedRect.Height, 200);
    });

    test('Right alignment positions render area at slot.X + (slot.Width - render.Width)', () => {
        const v = new LaidOutVisual();
        v.Width = 100;
        v.HorizontalAlignment = HorizontalAlignment.Right;
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(10, 20, 300, 200));
        // offsetX = 300 - 100 = 200; ArrangedRect.X = 10 + 200 = 210.
        assert.equal(v.ArrangedRect.X,     210);
        assert.equal(v.ArrangedRect.Width, 100);
    });

    test('Center alignment splits the extra space evenly', () => {
        const v = new LaidOutVisual();
        v.Width = 100;
        v.HorizontalAlignment = HorizontalAlignment.Center;
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(10, 20, 300, 200));
        // offsetX = (300 - 100) / 2 = 100; ArrangedRect.X = 110.
        assert.equal(v.ArrangedRect.X,     110);
        assert.equal(v.ArrangedRect.Width, 100);
    });

    test('VerticalAlignment behaves symmetrically (Top / Center / Bottom)', () => {
        const make = (align: VerticalAlignment): Rect => {
            const v = new LaidOutVisual();
            v.Height = 60;
            v.VerticalAlignment = align;
            v.Measure(new Size(500, 500));
            v.Arrange(new Rect(0, 0, 200, 200));
            return v.ArrangedRect;
        };
        // extra = 200 - 60 = 140
        assert.equal(make(VerticalAlignment.Top).Y,    0);
        assert.equal(make(VerticalAlignment.Center).Y, 70);
        assert.equal(make(VerticalAlignment.Bottom).Y, 140);
    });

    test('Stretch + explicit Width = render at Width, centered (WPF Stretch fallback)', () => {
        const v = new LaidOutVisual();
        v.Width  = 100;
        v.Height = 80;
        // Both alignments default to Stretch.
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 300, 200));
        // (300-100)/2 = 100; (200-80)/2 = 60
        assert.ok(v.ArrangedRect.Equals(new Rect(100, 60, 100, 80)));
    });

    test('alignment change invalidates Arrange but not Measure', () => {
        const v = new LaidOutVisual();
        v.Width = 100;
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 200, 200));
        assert.equal(v.IsMeasureValid, true);
        assert.equal(v.IsArrangeValid, true);

        v.HorizontalAlignment = HorizontalAlignment.Right;
        // HorizontalAlignment is registered Arrange-only.
        assert.equal(v.IsMeasureValid, true);
        assert.equal(v.IsArrangeValid, false);
    });

    test('render area overflows slot — alignment offset is 0 (clipped at slot origin)', () => {
        const v = new LaidOutVisual();
        v.Width = 500; // larger than slot
        v.HorizontalAlignment = HorizontalAlignment.Center;
        v.Measure(new Size(1000, 1000));
        v.Arrange(new Rect(10, 20, 100, 100));
        // extra = 100 - 500 = -400; offset clamped to 0.
        assert.equal(v.ArrangedRect.X,     10);
        assert.equal(v.ArrangedRect.Width, 500);
    });

    // Margin — outer spacing around a Visual. Eats into availableSize
    // at Measure time, inflates DesiredSize so the parent reserves the
    // bounding box, and offsets the rendered area at Arrange time.

    test('default Margin is Thickness.Zero', () => {
        const v = new Visual();
        assert.ok(v.Margin.IsZero);
    });

    test('setting Margin invalidates measure (and cascades to arrange)', () => {
        const v = new LaidOutVisual();
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(v.IsMeasureValid, true);
        assert.equal(v.IsArrangeValid, true);

        v.Margin = new Thickness(5);
        assert.equal(v.IsMeasureValid, false);
        assert.equal(v.IsArrangeValid, false);
    });

    test('Margin subtracts from availableSize handed to MeasureOverride', () => {
        const v = new LaidOutVisual(new Size(50, 30));
        v.Margin = new Thickness(10, 20, 30, 40); // L T R B → H=40, V=60
        v.Measure(new Size(500, 500));
        // MeasureOverride sees available minus margin's horizontal/vertical sum.
        assert.ok(v.last_available!.Equals(new Size(500 - 40, 500 - 60)));
    });

    test('Margin inflates DesiredSize so the parent reserves the bounding box', () => {
        const v = new LaidOutVisual(new Size(50, 30));
        v.Margin = new Thickness(10, 20, 30, 40);
        v.Measure(new Size(500, 500));
        // DesiredSize = MeasureOverride's result + margin H/V.
        assert.equal(v.DesiredSize.Width,  50 + 40);
        assert.equal(v.DesiredSize.Height, 30 + 60);
    });

    test('available smaller than margin clamps inner budget to 0 (no negative)', () => {
        const v = new LaidOutVisual(new Size(0, 0));
        v.Margin = new Thickness(1000);
        v.Measure(new Size(50, 50));
        assert.ok(v.last_available!.Equals(new Size(0, 0)));
    });

    test('Arrange + Stretch fills the slot minus the margin', () => {
        const v = new LaidOutVisual(new Size(50, 30));
        v.Margin = new Thickness(10);
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 300, 200));
        // marginedRect = (10, 10, 280, 180). Stretch fills it.
        assert.ok(v.ArrangedRect.Equals(new Rect(10, 10, 280, 180)));
    });

    test('Arrange + Stretch + explicit Width centers within the margined slot', () => {
        const v = new LaidOutVisual();
        v.Width  = 100;
        v.Height = 80;
        v.Margin = new Thickness(10);
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 300, 200));
        // marginedRect = (10, 10, 280, 180); centered → (10+90, 10+50, 100, 80).
        assert.ok(v.ArrangedRect.Equals(new Rect(100, 60, 100, 80)));
    });

    test('Arrange + Left + explicit Width hugs the inner-left (slot.X + margin.Left)', () => {
        const v = new LaidOutVisual();
        v.Width = 100;
        v.HorizontalAlignment = HorizontalAlignment.Left;
        v.Margin = new Thickness(15, 25, 35, 45);
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 300, 200));
        // marginedRect.X = 0 + 15 = 15; Left → offset 0 → ArrangedRect.X = 15.
        assert.equal(v.ArrangedRect.X,     15);
        assert.equal(v.ArrangedRect.Width, 100);
    });

    test('Arrange + Right + explicit Width hugs the inner-right (slot.Right - margin.Right - Width)', () => {
        const v = new LaidOutVisual();
        v.Width = 100;
        v.HorizontalAlignment = HorizontalAlignment.Right;
        v.Margin = new Thickness(15, 0, 35, 0);
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 300, 200));
        // marginedRect = (15, 0, 300-15-35, 200) = (15, 0, 250, 200).
        // Right: offsetX = 250 - 100 = 150. ArrangedRect.X = 15 + 150 = 165.
        assert.equal(v.ArrangedRect.X,     165);
        assert.equal(v.ArrangedRect.Width, 100);
    });

    test('asymmetric Margin: Top vs Bottom offset only applies on the chosen side', () => {
        const v = new LaidOutVisual();
        v.Height = 50;
        v.VerticalAlignment = VerticalAlignment.Top;
        v.Margin = new Thickness(0, 20, 0, 40); // L T R B
        v.Measure(new Size(500, 500));
        v.Arrange(new Rect(0, 0, 300, 200));
        // Top alignment → render lands at margin.Top from slot origin.
        assert.equal(v.ArrangedRect.Y,      20);
        assert.equal(v.ArrangedRect.Height, 50);
    });

    test('Margin combined with Border: a child Visual with Margin sits inside Border insets PLUS its margin', () => {
        // Verifies the layered concerns compose correctly: Border uses
        // BorderThickness + Padding for the child slot, then the child's
        // Margin further insets the rendered area.
        class FixedSize extends Element {
            constructor(private readonly box: Size) { super(); }
            protected override MeasureOverride(_a: Size): Size { return this.box; }
        }

        const child = new FixedSize(new Size(40, 30));
        child.Margin = new Thickness(5);

        // Use a Single subclass that mimics Border's measure/arrange
        // pattern without depending on Controls (keeps runtime tests
        // self-contained).
        class Wrap extends Single {
            constructor(c: Visual) { super(); this.SetChild(c); }
            protected override MeasureOverride(a: Size): Size {
                if (this.child === undefined) return Size.Zero;
                // Inset by a fixed 10 each side for this test.
                this.child.Measure(new Size(
                    Math.max(0, a.Width  - 20),
                    Math.max(0, a.Height - 20),
                ));
                return new Size(this.child.DesiredSize.Width + 20, this.child.DesiredSize.Height + 20);
            }
            protected override ArrangeOverride(s: Size): Size {
                if (this.child !== undefined) {
                    this.child.Arrange(new Rect(10, 10, Math.max(0, s.Width - 20), Math.max(0, s.Height - 20)));
                }
                return s;
            }
        }

        const wrap = new Wrap(child);
        wrap.Measure(new Size(500, 500));
        wrap.Arrange(new Rect(0, 0, 200, 200));

        // Wrap arranges child to (10, 10, 180, 180). Child has Margin=5
        // and default Stretch — marginedRect inside child = (15, 15, 170, 170).
        // Stretch fills, so ArrangedRect = (15, 15, 170, 170).
        assert.ok(child.ArrangedRect.Equals(new Rect(15, 15, 170, 170)));
    });
});

describe('Model.EnumerateProperties — DP surface introspection', () => {
    test('returns descriptors registered on the class itself', () => {
        class Base extends Model {
            static {
                Model.RegisterProperty(Base, 'Alpha', 0, MetaData.None);
                Model.RegisterProperty(Base, 'Beta',  '',  MetaData.None);
            }
        }
        const props = Model.EnumerateProperties(Base);
        const names = props.map(p => p.Name).sort();
        assert.deepEqual(names, ['Alpha', 'Beta']);
        for (const p of props) assert.equal(p.RootOwner, Base);
    });

    test('walks the prototype chain and surfaces ancestor DPs', () => {
        class Parent extends Model {
            static { Model.RegisterProperty(Parent, 'ParentProp', 0, MetaData.None); }
        }
        class Child extends Parent {
            static { Model.RegisterProperty(Child, 'ChildProp', 0, MetaData.None); }
        }
        const props = Model.EnumerateProperties(Child);
        const names = props.map(p => p.Name).sort();
        assert.deepEqual(names, ['ChildProp', 'ParentProp']);
        // RootOwner reflects each property's registering class so a
        // consumer (e.g. the LSP completion provider) can label
        // inherited entries differently.
        const parentEntry = props.find(p => p.Name === 'ParentProp')!;
        const childEntry  = props.find(p => p.Name === 'ChildProp')!;
        assert.equal(parentEntry.RootOwner, Parent);
        assert.equal(childEntry.RootOwner,  Child);
    });

    test('classes with no registered DPs return an empty list', () => {
        class Empty extends Model {}
        assert.deepEqual(Model.EnumerateProperties(Empty), []);
    });

    test('integrates with Model.find_class for name-keyed enumeration', () => {
        // The intended LSP flow: user types `[TargetType=Foo]`, the
        // analyzer captures 'Foo', and the completion provider hands
        // the string to `find_class` + `EnumerateProperties`. This
        // test pins the round-trip on a locally-declared class so it
        // doesn't depend on Controls being loaded.
        class Foo extends Model {
            static { Model.RegisterProperty(Foo, 'Gamma', 0, MetaData.None); }
        }
        const resolved = Model.find_class('Foo');
        assert.equal(resolved, Foo);
        const props = Model.EnumerateProperties(resolved!);
        assert.equal(props.length, 1);
        assert.equal(props[0]!.Name, 'Gamma');
    });
});

// Pins backlog item 1.1: CoerceValue runs on EVERY effective-value
// recomputation, not just the first set. Storage holds the raw value;
// `value` applies coerce on read. GetValueSource returns CoercedValue
// when coerce produced a different value than the underlying base.
describe('Coerce on every effective-value recomputation', () => {
    const clamp_to_10: CoerceValue = (_m, v) => Math.min(v as number, 10);

    test('subsequent sets are coerced (not just the first)', () => {
        class Slider extends Model {
            static { Model.RegisterProperty(Slider, 'Value', 0, MetaData.None, clamp_to_10); }
        }
        const s = new Slider();
        s._set_property_value_by_name('Value', 100);
        assert.equal(s.get_property_value(resolveKey(s, undefined, 'Value')), 10);

        // Second set must also be clamped — the bug being fixed.
        s._set_property_value_by_name('Value', 999);
        assert.equal(s.get_property_value(resolveKey(s, undefined, 'Value')), 10);

        // A within-range write reads back unchanged.
        s._set_property_value_by_name('Value', 5);
        assert.equal(s.get_property_value(resolveKey(s, undefined, 'Value')), 5);
    });

    test('storage holds raw — coerce that depends on sibling state re-evaluates on read', () => {
        // ceiling-based clamp: re-coerces when Ceiling changes, even
        // though the user never re-set Value.
        const clamp_to_ceiling: CoerceValue = (model, v) =>
            Math.min(v as number, model.get_property_value(resolveKey(model, undefined, 'Ceiling')) as number);
        class Range extends Model {
            static {
                Model.RegisterProperty(Range, 'Ceiling', 100, MetaData.None);
                Model.RegisterProperty(Range, 'Value',   0,   MetaData.None, clamp_to_ceiling);
            }
        }
        const r = new Range();
        r._set_property_value_by_name('Value', 80);
        assert.equal(r.get_property_value(resolveKey(r, undefined, 'Value')), 80);

        // Narrow the ceiling; Value re-coerces on next read.
        r._set_property_value_by_name('Ceiling', 50);
        assert.equal(r.get_property_value(resolveKey(r, undefined, 'Value')), 50);

        // Widen the ceiling; the stored raw (80) re-emerges.
        r._set_property_value_by_name('Ceiling', 200);
        assert.equal(r.get_property_value(resolveKey(r, undefined, 'Value')), 80);
    });

    test('GetValueSource returns CoercedValue when coerce changed the base value', () => {
        class Slider extends Model {
            static { Model.RegisterProperty(Slider, 'Value', 0, MetaData.None, clamp_to_10); }
        }
        const s = new Slider();
        s._set_property_value_by_name('Value', 100);  // clamped to 10
        assert.equal(s.GetValueSource(resolveKey(s, undefined, 'Value')), PropertyValueSource.CoercedValue);
    });

    test('GetValueSource returns the base source when coerce left the value unchanged', () => {
        class Slider extends Model {
            static { Model.RegisterProperty(Slider, 'Value', 0, MetaData.None, clamp_to_10); }
        }
        const s = new Slider();
        s._set_property_value_by_name('Value', 5);  // within range, no clamp
        assert.equal(s.GetValueSource(resolveKey(s, undefined, 'Value')), PropertyValueSource.LocalValue);
    });

    test('default value is coerced on read', () => {
        // Default 100 with a clamp-to-10 callback: get returns 10, not 100.
        // EVD is never created for an unset property — the default-fallback
        // path still has to honor coerce.
        class Capped extends Model {
            static { Model.RegisterProperty(Capped, 'Value', 100, MetaData.None, clamp_to_10); }
        }
        const c = new Capped();
        assert.equal(c.get_property_value(resolveKey(c, undefined, 'Value')), 10);
    });

    test('PropertyChanged listeners see post-coerce new values', () => {
        class Slider extends Model {
            static { Model.RegisterProperty(Slider, 'Value', 0, MetaData.None, clamp_to_10); }
        }
        const s = new Slider();
        const captures: Array<[unknown, unknown]> = [];
        s.AddPropertyChangedListener(resolveKey(s, undefined, 'Value'), (_m, _p, o, n) => { captures.push([o, n]); });

        s._set_property_value_by_name('Value', 100);  // clamped
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![0], 0);   // old: default
        assert.equal(captures[0]![1], 10);  // new: post-coerce, NOT 100
    });

    test('binding push notifications carry post-coerce values', () => {
        class Source extends Model {
            static { Model.RegisterProperty(Source, 'Raw', 0, MetaData.None); }
        }
        class Sink extends Model {
            static { Model.RegisterProperty(Sink, 'Value', 0, MetaData.None, clamp_to_10); }
        }
        const src = new Source();
        src._set_property_value_by_name('Raw', 5);
        const sink = new Sink();
        const captures: Array<[unknown, unknown]> = [];
        sink.AddPropertyChangedListener(resolveKey(sink, undefined, 'Value'), (_m, _p, o, n) => { captures.push([o, n]); });

        sink._set_property_value_by_name('Value', new Binding(src, 'Raw'));
        // Install fires with (default 0, resolved 5) — both within range, no clamp.
        assert.equal(captures.length, 1);
        assert.equal(captures[0]![1], 5);

        // Source mutation pushes a value the sink will clamp. The
        // listener must see the post-coerce new value, matching what
        // a `value` read would return.
        src._set_property_value_by_name('Raw', 99);
        assert.equal(captures.length, 2);
        assert.equal(captures[1]![0], 5);    // old: post-coerce
        assert.equal(captures[1]![1], 10);   // new: clamped, NOT 99
        assert.equal(sink.get_property_value(resolveKey(sink, undefined, 'Value')), 10);
    });

    test('ClearValue with a coerce callback falls back to the coerced default', () => {
        class Capped extends Model {
            static { Model.RegisterProperty(Capped, 'Value', 100, MetaData.None, clamp_to_10); }
        }
        const c = new Capped();
        c._set_property_value_by_name('Value', 5);
        assert.equal(c.get_property_value(resolveKey(c, undefined, 'Value')), 5);

        c.ClearValue(resolveKey(c, undefined, 'Value'));
        // Default is 100 raw; coerce clamps it to 10.
        assert.equal(c.get_property_value(resolveKey(c, undefined, 'Value')), 10);
        // Source flips to CoercedValue since coerce changed the base default.
        assert.equal(c.GetValueSource(resolveKey(c, undefined, 'Value')), PropertyValueSource.CoercedValue);
    });
});

// Pins backlog item 2.4 / 7.2: bindings that traverse arrays or
// ObservableCollections re-resolve when the collection itself mutates
// (item replaced, item inserted/removed before the index, collection
// cleared). For collections-as-leaf, the binding emits a pulse on
// every mutation so consumers see PropertyChanged even though the
// resolved value's identity is unchanged. Mirrors WPF's
// INotifyCollectionChanged channel surfaced through the binding.
describe('Binding — INotifyCollectionChanged through PropertyPath', () => {
    // Local scene independent of buildScene so the OC fixtures stay
    // isolated from the existing plain-array path tests.
    function ocScene()
    {
        class Department extends Model {}
        class Manager extends Model {}
        class Office extends Model {}
        class Desk extends Model {}
        class ViewModel extends Model {}
        Model.RegisterProperty(Department, 'managers', null, MetaData.None);
        Model.RegisterProperty(Manager,    'office',   null, MetaData.None);
        Model.RegisterProperty(Office,     'desk',     null, MetaData.None);
        Model.RegisterProperty(Desk,       'label',    '',   MetaData.None);
        Model.RegisterProperty(ViewModel,  'label',    '',   MetaData.None);
        Model.RegisterProperty(ViewModel,  'managers', null, MetaData.None);

        function makeManager(label: string): Model
        {
            const desk = new Desk();
            desk._set_property_value_by_name('label', label);
            const office = new Office();
            office._set_property_value_by_name('desk', desk);
            const m = new Manager();
            m._set_property_value_by_name('office', office);
            return m;
        }
        return { Department, ViewModel, makeManager };
    }

    test('ObservableCollection: SetAt at the bound index pushes the new leaf value', () => {
        const { Department, ViewModel, makeManager } = ocScene();
        const collection = new ObservableCollection<Model>([
            makeManager('mgr-0'), makeManager('mgr-1'), makeManager('mgr-2'),
        ]);
        const dept = new Department();
        dept._set_property_value_by_name('managers', collection);

        const view = new ViewModel();
        view._set_property_value_by_name('label', new Binding(dept, 'managers[1].office.desk.label'));
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'mgr-1');

        collection.SetAt(1, makeManager('mgr-1-replaced'));
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'mgr-1-replaced');
    });

    test('ObservableCollection: Insert before the bound index shifts the resolved value', () => {
        const { Department, ViewModel, makeManager } = ocScene();
        const collection = new ObservableCollection<Model>([
            makeManager('mgr-0'), makeManager('mgr-1'), makeManager('mgr-2'),
        ]);
        const dept = new Department();
        dept._set_property_value_by_name('managers', collection);

        const view = new ViewModel();
        view._set_property_value_by_name('label', new Binding(dept, 'managers[1].office.desk.label'));
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'mgr-1');

        // Insert at index 0 shifts our bound index — what was index 1
        // is now index 2; the new index 1 is what was index 0.
        collection.Insert(0, makeManager('mgr-pre'));
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'mgr-0');
    });

    test('ObservableCollection: Insert after the bound index does not change the resolved value', () => {
        const { Department, ViewModel, makeManager } = ocScene();
        const collection = new ObservableCollection<Model>([
            makeManager('mgr-0'), makeManager('mgr-1'), makeManager('mgr-2'),
        ]);
        const dept = new Department();
        dept._set_property_value_by_name('managers', collection);

        const view = new ViewModel();
        const captures: Array<unknown> = [];
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'label'), (_m, _p, _o, n) => { captures.push(n); });
        view._set_property_value_by_name('label', new Binding(dept, 'managers[1].office.desk.label'));
        assert.equal(captures.length, 1);  // install fire

        collection.Add(makeManager('mgr-tail'));  // append, doesn't affect idx 1
        assert.equal(captures.length, 1, 'no spurious push when index 1 is unaffected');
    });

    test('ObservableCollection: RemoveAt before the bound index shifts the resolved value', () => {
        const { Department, ViewModel, makeManager } = ocScene();
        const collection = new ObservableCollection<Model>([
            makeManager('mgr-0'), makeManager('mgr-1'), makeManager('mgr-2'),
        ]);
        const dept = new Department();
        dept._set_property_value_by_name('managers', collection);

        const view = new ViewModel();
        view._set_property_value_by_name('label', new Binding(dept, 'managers[1].office.desk.label'));
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'mgr-1');

        collection.RemoveAt(0);
        // What was index 1 is now index 0; what was index 2 is now index 1.
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'mgr-2');
    });

    test('ObservableCollection: Clear resolves the binding to undefined', () => {
        const { Department, ViewModel, makeManager } = ocScene();
        const collection = new ObservableCollection<Model>([
            makeManager('mgr-0'), makeManager('mgr-1'),
        ]);
        const dept = new Department();
        dept._set_property_value_by_name('managers', collection);

        const view = new ViewModel();
        view._set_property_value_by_name('label', new Binding(dept, 'managers[0].office.desk.label'));
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'mgr-0');

        collection.Clear();
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), undefined);
    });

    test('Plain array via observe_array Proxy: SetAt-style assignment pushes', () => {
        const { Department, ViewModel, makeManager } = ocScene();
        // Plain array, NOT ObservableCollection.
        const arr = [makeManager('mgr-0'), makeManager('mgr-1'), makeManager('mgr-2')];
        const dept = new Department();
        dept._set_property_value_by_name('managers', arr);

        const view = new ViewModel();
        view._set_property_value_by_name('label', new Binding(dept, 'managers[1].office.desk.label'));
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'mgr-1');

        // Wrapping happens during traversal; consumers wanting reactivity
        // mutate through the proxy. Walk to the proxy via observe_array
        // (idempotent — returns the cached proxy).
        const proxy = observe_array(arr);
        proxy[1] = makeManager('mgr-1-replaced');
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'mgr-1-replaced');
    });

    test('Plain array via observe_array Proxy: push triggers re-resolve at higher indices', () => {
        const { Department, ViewModel, makeManager } = ocScene();
        const arr = [makeManager('mgr-0')];  // single item — index 1 is initially out of range
        const dept = new Department();
        dept._set_property_value_by_name('managers', arr);

        const view = new ViewModel();
        view._set_property_value_by_name('label', new Binding(dept, 'managers[1].office.desk.label'));
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), undefined);

        const proxy = observe_array(arr);
        proxy.push(makeManager('mgr-late'));
        // Now index 1 has a manager — binding re-resolves.
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'mgr-late');
    });

    test('ObservableCollection as leaf: pulses on mutation even though identity is unchanged', () => {
        const { ViewModel } = ocScene();
        const collection = new ObservableCollection<number>([1, 2, 3]);
        const holder = new ViewModel();
        holder._set_property_value_by_name('managers', collection);

        const view = new ViewModel();
        const captures: Array<unknown> = [];
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'managers'), (_m, _p, _o, n) => { captures.push(n); });
        view._set_property_value_by_name('managers', new Binding(holder, 'managers'));
        assert.equal(captures.length, 1);  // install fire
        assert.equal(captures[0], collection);

        // Collection mutation: identity unchanged, pulse fires.
        collection.Add(4);
        assert.equal(captures.length, 2);
        assert.equal(captures[1], collection);

        collection.RemoveAt(0);
        assert.equal(captures.length, 3);
    });

    test('Replacing the source collection drops the old subscription and subscribes to the new one', () => {
        const { Department, ViewModel, makeManager } = ocScene();
        const collA = new ObservableCollection<Model>([makeManager('a-0'), makeManager('a-1')]);
        const collB = new ObservableCollection<Model>([makeManager('b-0'), makeManager('b-1'), makeManager('b-2')]);
        const dept = new Department();
        dept._set_property_value_by_name('managers', collA);

        const view = new ViewModel();
        view._set_property_value_by_name('label', new Binding(dept, 'managers[1].office.desk.label'));
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'a-1');

        // Swap to a new collection — the binding follows.
        dept._set_property_value_by_name('managers', collB);
        assert.equal(view.get_property_value(resolveKey(view, undefined, 'label')), 'b-1');

        // Mutating the OLD collection now does nothing observable.
        const captures: Array<unknown> = [];
        view.AddPropertyChangedListener(resolveKey(view, undefined, 'label'), (_m, _p, _o, n) => { captures.push(n); });
        collA.SetAt(1, makeManager('a-1-orphaned'));
        assert.equal(captures.length, 0, 'old collection is detached');

        // Mutating the NEW collection still pushes.
        collB.SetAt(1, makeManager('b-1-replaced'));
        assert.equal(captures.length, 1);
    });

    test('Binding.dispose tears down collection subscriptions', () => {
        const { Department, makeManager } = ocScene();
        const collection = new ObservableCollection<Model>([makeManager('mgr-0'), makeManager('mgr-1')]);
        const dept = new Department();
        dept._set_property_value_by_name('managers', collection);

        const binding = new Binding(dept, 'managers[1].office.desk.label');
        let pulseCount = 0;
        binding.setOnValueChanged(() => { pulseCount++; });
        binding.setOnCollectionPulse(() => { pulseCount++; });

        collection.SetAt(1, makeManager('mgr-1-pre-dispose'));
        assert.equal(pulseCount, 1);

        binding.dispose();
        collection.SetAt(1, makeManager('mgr-1-post-dispose'));
        assert.equal(pulseCount, 1, 'no callbacks fire after dispose');
    });
});

// Pins backlog 3.5: Binding.validationRules run on every read and on
// TwoWay writeback. Failures surface via Validation.HasError / Errors
// attached properties on the target Model; writeback is blocked when
// any rule fails.
describe('Binding — ValidationRules', () => {
    const notEmpty: ValidationRule = {
        validate(v): { isValid: boolean; errorContent?: string } {
            return typeof v === 'string' && v.length > 0
                ? { isValid: true }
                : { isValid: false, errorContent: 'required' };
        },
    };
    const positive: ValidationRule = {
        validate(v): { isValid: boolean; errorContent?: string } {
            return typeof v === 'number' && v > 0
                ? { isValid: true }
                : { isValid: false, errorContent: 'must be positive' };
        },
    };

    function vrScene()
    {
        class Source extends Model {
            static { Model.RegisterProperty(Source, 'value', '', MetaData.None); }
        }
        class Target extends Model {
            static { Model.RegisterProperty(Target, 'label', '', MetaData.None); }
        }
        return { Source, Target };
    }

    test('Install with a failing rule populates Validation.Errors on the target', () => {
        const { Source, Target } = vrScene();
        const src = new Source();
        src._set_property_value_by_name('value', '');  // fails notEmpty

        const target = new Target();
        target._set_property_value_by_name(
            'label',
            new Binding(src, 'value', BindingMode.OneWay, { validationRules: [notEmpty] }),
        );

        assert.equal(Validation.GetHasError(target), true);
        const errors = Validation.GetErrors(target);
        assert.equal(errors.length, 1);
        assert.equal(errors[0]!.errorContent, 'required');
        assert.equal(errors[0]!.value, '');
    });

    test('Install with a passing rule leaves Validation clean', () => {
        const { Source, Target } = vrScene();
        const src = new Source();
        src._set_property_value_by_name('value', 'hello');

        const target = new Target();
        target._set_property_value_by_name(
            'label',
            new Binding(src, 'value', BindingMode.OneWay, { validationRules: [notEmpty] }),
        );

        assert.equal(Validation.GetHasError(target), false);
        assert.equal(Validation.GetErrors(target).length, 0);
    });

    test('Source mutation flips validation state on push', () => {
        const { Source, Target } = vrScene();
        const src = new Source();
        src._set_property_value_by_name('value', 'ok');
        const target = new Target();
        target._set_property_value_by_name(
            'label',
            new Binding(src, 'value', BindingMode.OneWay, { validationRules: [notEmpty] }),
        );
        assert.equal(Validation.GetHasError(target), false);

        src._set_property_value_by_name('value', '');  // now fails
        assert.equal(Validation.GetHasError(target), true);

        src._set_property_value_by_name('value', 'restored');  // passes again
        assert.equal(Validation.GetHasError(target), false);
    });

    test('Multiple rules — every failure shows in Errors', () => {
        class Source extends Model {
            static { Model.RegisterProperty(Source, 'n', 0, MetaData.None); }
        }
        class Target extends Model {
            static { Model.RegisterProperty(Target, 'n', 0, MetaData.None); }
        }
        const lessThan10: ValidationRule = {
            validate(v): { isValid: boolean; errorContent?: string } {
                return typeof v === 'number' && v < 10
                    ? { isValid: true }
                    : { isValid: false, errorContent: 'must be < 10' };
            },
        };
        const src = new Source();
        src._set_property_value_by_name('n', -5);  // fails positive
        const target = new Target();
        target._set_property_value_by_name(
            'n',
            new Binding(src, 'n', BindingMode.OneWay, { validationRules: [positive, lessThan10] }),
        );
        const errors = Validation.GetErrors(target);
        assert.equal(errors.length, 1);
        assert.equal(errors[0]!.errorContent, 'must be positive');

        src._set_property_value_by_name('n', 100);  // fails lessThan10, passes positive
        const errors2 = Validation.GetErrors(target);
        assert.equal(errors2.length, 1);
        assert.equal(errors2[0]!.errorContent, 'must be < 10');

        src._set_property_value_by_name('n', 5);  // both pass
        assert.equal(Validation.GetHasError(target), false);
    });

    test('TwoWay writeback blocked when rule fails; source keeps previous value', () => {
        const { Source, Target } = vrScene();
        const src = new Source();
        src._set_property_value_by_name('value', 'good');

        const target = new Target();
        target._set_property_value_by_name(
            'label',
            new Binding(src, 'value', BindingMode.TwoWay, { validationRules: [notEmpty] }),
        );
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'label')), 'good');
        assert.equal(Validation.GetHasError(target), false);

        // Attempt to write '' — fails notEmpty, source stays at 'good',
        // target stays at 'good' (the previous value).
        target._set_property_value_by_name('label', '');
        assert.equal(src.get_property_value(resolveKey(src, undefined, 'value')), 'good');
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'label')), 'good');
        assert.equal(Validation.GetHasError(target), true);
        assert.equal(Validation.GetErrors(target)[0]!.errorContent, 'required');

        // Valid writeback clears the error and updates the source.
        target._set_property_value_by_name('label', 'fixed');
        assert.equal(src.get_property_value(resolveKey(src, undefined, 'value')), 'fixed');
        assert.equal(Validation.GetHasError(target), false);
    });

    test('Replacing a binding clears the old binding\'s errors', () => {
        const { Source, Target } = vrScene();
        const srcA = new Source();
        srcA._set_property_value_by_name('value', '');  // fails
        const srcB = new Source();
        srcB._set_property_value_by_name('value', 'ok');

        const target = new Target();
        target._set_property_value_by_name(
            'label',
            new Binding(srcA, 'value', BindingMode.OneWay, { validationRules: [notEmpty] }),
        );
        assert.equal(Validation.GetHasError(target), true);

        // Replace with a clean binding — the old error is dropped.
        target._set_property_value_by_name(
            'label',
            new Binding(srcB, 'value', BindingMode.OneWay, { validationRules: [notEmpty] }),
        );
        assert.equal(Validation.GetHasError(target), false);
        assert.equal(Validation.GetErrors(target).length, 0);
    });

    test('Multiple bindings on the same target aggregate their errors', () => {
        class Source extends Model {
            static {
                Model.RegisterProperty(Source, 'a', '', MetaData.None);
                Model.RegisterProperty(Source, 'b', '', MetaData.None);
            }
        }
        class Target extends Model {
            static {
                Model.RegisterProperty(Target, 'a', '', MetaData.None);
                Model.RegisterProperty(Target, 'b', '', MetaData.None);
            }
        }
        const src = new Source();
        const target = new Target();
        target._set_property_value_by_name(
            'a',
            new Binding(src, 'a', BindingMode.OneWay, { validationRules: [notEmpty] }),
        );
        target._set_property_value_by_name(
            'b',
            new Binding(src, 'b', BindingMode.OneWay, { validationRules: [notEmpty] }),
        );
        // Both fail.
        assert.equal(Validation.GetErrors(target).length, 2);

        // Fix one — the other's error remains.
        src._set_property_value_by_name('a', 'now-ok');
        assert.equal(Validation.GetErrors(target).length, 1);
        assert.equal(Validation.GetHasError(target), true);
    });

    test('Binding without validationRules pays no Validation overhead', () => {
        const { Source, Target } = vrScene();
        const src = new Source();
        src._set_property_value_by_name('value', 'anything');

        const target = new Target();
        target._set_property_value_by_name(
            'label',
            new Binding(src, 'value', BindingMode.OneWay),  // no rules
        );
        // Validation properties stay at their defaults.
        assert.equal(Validation.GetHasError(target), false);
        assert.equal(Validation.GetErrors(target).length, 0);
    });
});

// Pins backlog 3.6: general MultiBinding(bindings[], converter) +
// PriorityBinding(bindings[]). Closes the WPF-shape gap alongside the
// existing inline-expression MultiBinding factory.
describe('MultiBinding / PriorityBinding — child Binding form', () => {
    function mbScene()
    {
        class A extends Model {
            static { Model.RegisterProperty(A, 'x', 0, MetaData.None); }
        }
        class B extends Model {
            static { Model.RegisterProperty(B, 'y', 0, MetaData.None); }
        }
        class Target extends Model {
            static { Model.RegisterProperty(Target, 'sum', 0, MetaData.None); }
        }
        return { A, B, Target };
    }

    test('MultiBinding combines values from independent sources via the converter', () => {
        const { A, B, Target } = mbScene();
        const a = new A(); a._set_property_value_by_name('x', 2);
        const b = new B(); b._set_property_value_by_name('y', 3);

        const target = new Target();
        target._set_property_value_by_name(
            'sum',
            MultiBinding(
                [new Binding(a, 'x'), new Binding(b, 'y')],
                (x, y) => (x as number) + (y as number),
            ),
        );
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'sum')), 5);

        a._set_property_value_by_name('x', 10);
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'sum')), 13);

        b._set_property_value_by_name('y', 100);
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'sum')), 110);
    });

    test('MultiBinding converter exceptions surface as undefined (fallbackValue can apply on the outer target)', () => {
        const { A, B, Target } = mbScene();
        const a = new A(); a._set_property_value_by_name('x', 0);
        const b = new B(); b._set_property_value_by_name('y', 1);

        const target = new Target();
        target._set_property_value_by_name(
            'sum',
            MultiBinding(
                [new Binding(a, 'x'), new Binding(b, 'y')],
                (x, y) =>
                {
                    if ((x as number) === 0) throw new Error('boom');
                    return (x as number) / (y as number);
                },
            ),
        );
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'sum')), undefined);

        // Fix the source so the converter no longer throws.
        a._set_property_value_by_name('x', 4);
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'sum')), 4);
    });

    test('MultiBinding existing factory overload (Visual + paths) still compiles and runs via the same export', () => {
        // The legacy inline-expression factory is the 3-arg overload.
        // This test confirms the overloaded signature didn't break it.
        // We use the simplest possible case — a fixed Visual subclass
        // with a DataContext — to verify the dispatch path.
        class Host extends Element {
            static { Model.RegisterProperty(Host, 'sum', 0, MetaData.None); }
        }
        const host = new Host();
        host.DataContext = { a: 7, b: 8 };

        host._set_property_value_by_name(
            'sum',
            MultiBinding(host, ['a', 'b'], (a, b) => (a as number) + (b as number)),
        );
        assert.equal(host.get_property_value(resolveKey(host, undefined, 'sum')), 15);
    });

    test('PriorityBinding picks the first child whose resolved value is not undefined', () => {
        class A extends Model {
            static { Model.RegisterProperty(A, 'preferred', undefined, MetaData.None); }
        }
        class B extends Model {
            static { Model.RegisterProperty(B, 'fallback', 'default', MetaData.None); }
        }
        class Target extends Model {
            static { Model.RegisterProperty(Target, 'title', '', MetaData.None); }
        }
        const a = new A();
        const b = new B();
        const target = new Target();

        target._set_property_value_by_name(
            'title',
            PriorityBinding([new Binding(a, 'preferred'), new Binding(b, 'fallback')]),
        );
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'title')), 'default');

        // Set the preferred — it now wins.
        a._set_property_value_by_name('preferred', 'user-set');
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'title')), 'user-set');

        // Clear the preferred back to undefined — fallback re-appears.
        a._set_property_value_by_name('preferred', undefined);
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'title')), 'default');
    });

    test('PriorityBinding returns undefined when every child is undefined', () => {
        class A extends Model {
            static { Model.RegisterProperty(A, 'x', undefined, MetaData.None); }
        }
        class Target extends Model {
            static { Model.RegisterProperty(Target, 'title', 'INITIAL', MetaData.None); }
        }
        const a1 = new A();
        const a2 = new A();
        const target = new Target();
        target._set_property_value_by_name(
            'title',
            PriorityBinding([new Binding(a1, 'x'), new Binding(a2, 'x')]),
        );
        // Both undefined → combined value undefined → propagates through
        // (no fallbackValue here, so the consumer sees undefined).
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'title')), undefined);
    });

    test('MultiBinding.dispose tears down child bindings', () => {
        const { A, B, Target } = mbScene();
        const a = new A(); a._set_property_value_by_name('x', 1);
        const b = new B(); b._set_property_value_by_name('y', 1);

        const mb = MultiBinding(
            [new Binding(a, 'x'), new Binding(b, 'y')],
            (x, y) => (x as number) + (y as number),
        );
        const target = new Target();
        target._set_property_value_by_name('sum', mb);
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'sum')), 2);

        // Replace with a local value — EVD disposes the binding.
        target._set_property_value_by_name('sum', 99);
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'sum')), 99);

        // Mutations on the original sources no longer push.
        a._set_property_value_by_name('x', 100);
        b._set_property_value_by_name('y', 100);
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'sum')), 99);
    });
});

// Pins backlog 3.7 (FindAncestor part): AncestorBinding walks visualParent
// chain to find a named-type ancestor, then binds to one of its
// properties. ElementName side already covered by element-name-binding.ts
// and the compiler's $head.Property lowering.
describe('AncestorBinding — FindAncestor RelativeSource', () => {
    test('Binds to the nearest ancestor of the named type', () => {
        class Outer extends Panel {
            static { Model.RegisterProperty(Outer, 'Title', 'outer-title', MetaData.None); }
        }
        class Inner extends Element {
            static { Model.RegisterProperty(Inner, 'echo', '', MetaData.None); }
        }
        const outer = new Outer();
        const inner = new Inner();
        outer.AddChild(inner);

        inner._set_property_value_by_name(
            'echo',
            AncestorBinding(inner, Outer, 'Title'),
        );
        assert.equal(inner.get_property_value(resolveKey(inner, undefined, 'echo')), 'outer-title');

        outer._set_property_value_by_name('Title', 'changed');
        assert.equal(inner.get_property_value(resolveKey(inner, undefined, 'echo')), 'changed');
    });

    test('Walks past intermediate non-matching ancestors', () => {
        class Outer extends Panel {
            static { Model.RegisterProperty(Outer, 'Tag', 'A', MetaData.None); }
        }
        class Middle extends Panel {}
        class Inner extends Element {
            static { Model.RegisterProperty(Inner, 'echo', '', MetaData.None); }
        }
        const outer = new Outer();
        const middle = new Middle();
        const inner = new Inner();
        outer.AddChild(middle);
        middle.AddChild(inner);

        inner._set_property_value_by_name('echo', AncestorBinding(inner, Outer, 'Tag'));
        assert.equal(inner.get_property_value(resolveKey(inner, undefined, 'echo')), 'A');
    });

    test('level=2 finds the 2nd-nearest matching ancestor', () => {
        class Grand extends Panel {
            static { Model.RegisterProperty(Grand, 'Tag', 'GRAND', MetaData.None); }
        }
        class Parent extends Grand {}  // also matches Grand
        class Inner extends Element {
            static { Model.RegisterProperty(Inner, 'echo', '', MetaData.None); }
        }
        const grand = new Grand();
        const parent = new Parent();
        const inner = new Inner();
        grand.AddChild(parent);
        parent.AddChild(inner);

        // level=1 → nearest (parent), level=2 → grandparent.
        inner._set_property_value_by_name('echo', AncestorBinding(inner, Grand, 'Tag', 2));
        assert.equal(inner.get_property_value(resolveKey(inner, undefined, 'echo')), 'GRAND');

        grand._set_property_value_by_name('Tag', 'updated');
        assert.equal(inner.get_property_value(resolveKey(inner, undefined, 'echo')), 'updated');
    });

    test('Missing ancestor resolves to undefined', () => {
        class NotAnAncestor extends Panel {}
        class Outer extends Panel {}
        class Inner extends Element {
            static { Model.RegisterProperty(Inner, 'echo', 'INITIAL', MetaData.None); }
        }
        const outer = new Outer();
        const inner = new Inner();
        outer.AddChild(inner);

        inner._set_property_value_by_name(
            'echo',
            AncestorBinding(inner, NotAnAncestor, 'whatever'),
        );
        assert.equal(inner.get_property_value(resolveKey(inner, undefined, 'echo')), undefined);
    });

    test('dispose unsubscribes from the resolved ancestor', () => {
        class Outer extends Panel {
            static { Model.RegisterProperty(Outer, 'Title', 'first', MetaData.None); }
        }
        class Inner extends Element {
            static { Model.RegisterProperty(Inner, 'echo', '', MetaData.None); }
        }
        const outer = new Outer();
        const inner = new Inner();
        outer.AddChild(inner);

        inner._set_property_value_by_name('echo', AncestorBinding(inner, Outer, 'Title'));
        assert.equal(inner.get_property_value(resolveKey(inner, undefined, 'echo')), 'first');

        // Replace with a local value — EVD disposes the binding.
        inner._set_property_value_by_name('echo', 'local');
        assert.equal(inner.get_property_value(resolveKey(inner, undefined, 'echo')), 'local');

        // Mutations on the ancestor no longer push through.
        outer._set_property_value_by_name('Title', 'after-dispose');
        assert.equal(inner.get_property_value(resolveKey(inner, undefined, 'echo')), 'local');
    });
});

// Pins backlog 4.2: ValidateValue callback in PropertyMetadata rejects
// writes that fall outside the property's allowed domain. WPF parity.
describe('ValidateValue callback', () => {
    const positiveInt: ValidateValue = (v) =>
        typeof v === 'number' && Number.isInteger(v) && v >= 0;

    test('A valid write succeeds; an invalid write throws and does not mutate state', () => {
        class Item extends Model {
            static {
                Model.RegisterProperty(Item, 'count', 0, MetaData.None, undefined, positiveInt);
            }
        }
        const item = new Item();
        item._set_property_value_by_name('count', 5);
        assert.equal(item.get_property_value(resolveKey(item, undefined, 'count')), 5);

        assert.throws(
            () => item._set_property_value_by_name('count', -1),
            /rejected by validate_value/,
        );
        // State unchanged after a rejected write.
        assert.equal(item.get_property_value(resolveKey(item, undefined, 'count')), 5);

        assert.throws(
            () => item._set_property_value_by_name('count', 1.5),
            /rejected by validate_value/,
        );
        assert.equal(item.get_property_value(resolveKey(item, undefined, 'count')), 5);
    });

    test('Default value that fails the rule throws at registration time', () => {
        class Bad extends Model {}
        assert.throws(
            () => Model.RegisterProperty(Bad, 'count', -1, MetaData.None, undefined, positiveInt),
            /Default value for property 'Bad\.count' fails its validate_value callback/,
        );
    });

    test('Validate runs BEFORE coerce — a value the rule rejects never reaches coerce', () => {
        let coerceCalls = 0;
        const coerce: CoerceValue = (_m, v) =>
        {
            coerceCalls++;
            return v;
        };
        class Slider extends Model {
            static {
                Model.RegisterProperty(Slider, 'Value', 0, MetaData.None, coerce, positiveInt);
            }
        }
        const s = new Slider();
        s._set_property_value_by_name('Value', 3);
        const before = coerceCalls;

        assert.throws(() => s._set_property_value_by_name('Value', -5), /rejected by validate_value/);
        // Coerce was not called for the rejected write.
        assert.equal(coerceCalls, before);
    });

    test('Bindings bypass validate_value at write time — the binding install is not a "value"', () => {
        // The user installs a Binding object; what matters for validation
        // is the resolved value the binding produces, not the Binding
        // instance itself. validate_value applies to direct value sets.
        class Source extends Model {
            static { Model.RegisterProperty(Source, 'n', 0, MetaData.None); }
        }
        class Target extends Model {
            static {
                Model.RegisterProperty(Target, 'n', 0, MetaData.None, undefined, positiveInt);
            }
        }
        const src = new Source();
        src._set_property_value_by_name('n', 42);
        const target = new Target();
        // No throw — installing a Binding is always valid; the binding's
        // resolved value is what matters at read time, and validate_value
        // is a write-side gate.
        target._set_property_value_by_name('n', new Binding(src, 'n'));
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'n')), 42);
    });

    test('OverrideMetadata can replace just the validate_value callback', () => {
        class Furniture extends Model {
            static {
                Model.RegisterProperty(Furniture, 'height', 1, MetaData.None);
            }
        }
        class Desk extends Furniture {}
        const HeightKey = Model.RegisterProperty(Furniture, 'height', 1, MetaData.None);

        // Override to add validate_value on Desk.
        Model.OverrideMetadata(Desk, HeightKey, { validate_value: positiveInt });

        const desk = new Desk();
        desk._set_property_value_by_name('height', 3);
        assert.equal(desk.get_property_value(resolveKey(desk, undefined, 'height')), 3);

        assert.throws(
            () => desk._set_property_value_by_name('height', -2),
            /rejected by validate_value/,
        );
    });
});

// Pins backlog 4.4: MetaData.IsNotDataBindable rejects Binding installs
// at the call site; MetaData.IsAnimationProhibited rejects animation
// writes. Both are author-intent contracts encoded in the DP metadata
// — the LSP can surface them and the runtime fails clearly instead of
// allowing structural / nonsensical operations.
describe('IsNotDataBindable / IsAnimationProhibited gates', () => {
    test('Predicates read the flag bits', () => {
        assert.equal(isNotDataBindable(MetaData.IsNotDataBindable), true);
        assert.equal(isNotDataBindable(MetaData.None), false);
        assert.equal(isAnimationProhibited(MetaData.IsAnimationProhibited), true);
        assert.equal(isAnimationProhibited(MetaData.None), false);
        // Flags compose with other bits via |.
        assert.equal(
            isNotDataBindable(MetaData.Measure | MetaData.IsNotDataBindable),
            true,
        );
    });

    test('IsNotDataBindable rejects Binding installs; direct writes succeed', () => {
        class Source extends Model {
            static { Model.RegisterProperty(Source, 'val', 0, MetaData.None); }
        }
        class Target extends Model {
            static {
                Model.RegisterProperty(Target, 'kind', 'A', MetaData.IsNotDataBindable);
            }
        }
        const src = new Source();
        const target = new Target();

        // Direct write — fine.
        target._set_property_value_by_name('kind', 'B');
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'kind')), 'B');

        // Binding install — throws.
        assert.throws(
            () => target._set_property_value_by_name('kind', new Binding(src, 'val')),
            /IsNotDataBindable/,
        );
        // State unchanged after the rejected install.
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'kind')), 'B');
    });

    test('IsAnimationProhibited rejects SetAnimatedValue; direct + binding writes succeed', () => {
        class Target extends Model {
            static {
                Model.RegisterProperty(Target, 'collection', undefined, MetaData.IsAnimationProhibited);
            }
        }
        const target = new Target();
        const list = [1, 2, 3];

        // Direct write — fine.
        target._set_property_value_by_name('collection', list);
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'collection')), list);

        // Animation write — throws.
        assert.throws(
            () => target.SetAnimatedValue(resolveKey(target, undefined, 'collection'), [4, 5, 6]),
            /IsAnimationProhibited/,
        );
        // State unchanged.
        assert.equal(target.get_property_value(resolveKey(target, undefined, 'collection')), list);
    });

    test('Element.DataContext is IsAnimationProhibited by default', () => {
        const v = new Element();
        const vm = { name: 'whatever' };
        v.DataContext = vm;
        assert.equal(v.DataContext, vm);

        assert.throws(
            () => v.SetAnimatedValue(resolveKey(v, undefined, 'DataContext'), { name: 'animated' }),
            /IsAnimationProhibited/,
        );
        // DataContext is still bindable, just not animatable.
        assert.equal(v.DataContext, vm);
    });

    test('OverrideMetadata can install IsNotDataBindable on a subclass', () => {
        class Base extends Model {
            static { Model.RegisterProperty(Base, 'kind', 'A', MetaData.None); }
        }
        class Sub extends Base {}
        const KindKey = Model.RegisterProperty(Base, 'kind', 'A', MetaData.None);
        Model.OverrideMetadata(Sub, KindKey, { meta_data: MetaData.IsNotDataBindable });

        const sub = new Sub();
        class Src extends Model {
            static { Model.RegisterProperty(Src, 'v', 'X', MetaData.None); }
        }
        const src = new Src();
        assert.throws(
            () => sub._set_property_value_by_name('kind', new Binding(src, 'v')),
            /IsNotDataBindable/,
        );

        // Base instance still accepts Bindings — override is per-class.
        const base = new Base();
        base._set_property_value_by_name('kind', new Binding(src, 'v'));
        assert.equal(base.get_property_value(resolveKey(base, undefined, 'kind')), 'X');
    });
});
