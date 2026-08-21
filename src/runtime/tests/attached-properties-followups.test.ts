import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    MetaData,
    MuralBase,
    PropertyValueSource,
    validateTargetTypes,
} from '../index.js';

// § 15.1 — validate_target predicate on RegisterAttachedProperty.
// Rejects writes targeting Models the predicate refuses.
describe('§ 15.1 — RegisterAttachedProperty.validate_target', () => {

    test('predicate-accepted targets allow the write', () => {
        class HostA extends MuralBase {}
        class HostB extends MuralBase {}
        class OwnerA {}

        const key = MuralBase.RegisterAttachedProperty<number>(
            OwnerA, 'TestProp151Accept', 0, MetaData.None,
            undefined,
            undefined,
            validateTargetTypes(HostA),
        );
        const h = new HostA();
        h.set_property_value(key, 7);
        assert.equal(h.get_property_value(key), 7);
        void HostB;
    });

    test('predicate-rejected targets throw on set', () => {
        class HostA extends MuralBase {}
        class HostB extends MuralBase {}
        class OwnerB {}

        const key = MuralBase.RegisterAttachedProperty<number>(
            OwnerB, 'TestProp151Reject', 0, MetaData.None,
            undefined,
            undefined,
            validateTargetTypes(HostA),
        );
        const wrongHost = new HostB();
        assert.throws(() => wrongHost.set_property_value(key, 5),
            /not valid on target of type 'HostB'/);
    });

    test('attached properties without validate_target accept any MuralBase (legacy behavior)', () => {
        class HostX extends MuralBase {}
        class OwnerC {}

        const key = MuralBase.RegisterAttachedProperty<number>(
            OwnerC, 'TestProp151NoValidate', 0, MetaData.None,
        );
        const h = new HostX();
        h.set_property_value(key, 42);
        assert.equal(h.get_property_value(key), 42);
    });

    test('validateTargetTypes accepts any one of several classes', () => {
        class HostA extends MuralBase {}
        class HostB extends MuralBase {}
        class HostC extends MuralBase {}
        class OwnerD {}

        const key = MuralBase.RegisterAttachedProperty<number>(
            OwnerD, 'TestProp151Multi', 0, MetaData.None,
            undefined, undefined,
            validateTargetTypes(HostA, HostB),
        );
        new HostA().set_property_value(key, 1);
        new HostB().set_property_value(key, 2);
        assert.throws(() => new HostC().set_property_value(key, 3));
    });

    test('subclass instances are accepted when a parent class is allowed', () => {
        class Parent extends MuralBase {}
        class Child  extends Parent {}
        class OwnerE {}

        const key = MuralBase.RegisterAttachedProperty<number>(
            OwnerE, 'TestProp151Subclass', 0, MetaData.None,
            undefined, undefined,
            validateTargetTypes(Parent),
        );
        const c = new Child();
        c.set_property_value(key, 9);
        assert.equal(c.get_property_value(key), 9);
    });
});

// § 15.2 — A cross-class inheritable attached property registered on
// some owner class is enumerated for every Visual (even ones whose
// prototype chain doesn't reach the owner). Verified at the runtime
// API level — the registry returns the descriptor.
describe('§ 15.2 — global inheritable-descriptor registry', () => {

    test('an inheritable attached property is added to the global registry on registration', () => {
        class OwnerInherits1 {}
        const before = MuralBase._getInheritableDescriptors().size;

        MuralBase.RegisterAttachedProperty<string>(
            OwnerInherits1, 'TestProp152Inherits', 'default', MetaData.Inherits);

        const after = MuralBase._getInheritableDescriptors().size;
        assert.equal(after, before + 1);
    });

    test('a non-inheritable property is NOT added to the registry', () => {
        class OwnerNoInherit {}
        const before = MuralBase._getInheritableDescriptors().size;

        MuralBase.RegisterAttachedProperty<string>(
            OwnerNoInherit, 'TestProp152NoInherit', 'default', MetaData.None);

        const after = MuralBase._getInheritableDescriptors().size;
        assert.equal(after, before, 'non-Inherits properties skip the registry');
    });

    test('descriptor stays unique — re-registration of same (owner, property) is idempotent', () => {
        class OwnerIdem {}
        MuralBase.RegisterAttachedProperty<string>(
            OwnerIdem, 'TestProp152Idem', 'x', MetaData.Inherits);
        const sizeAfter1 = MuralBase._getInheritableDescriptors().size;

        // Re-registering the same descriptor (idempotent path in RegisterProperty
        // when the (owner, property) pair already exists). The registry should
        // NOT grow.
        MuralBase.RegisterAttachedProperty<string>(
            OwnerIdem, 'TestProp152Idem', 'x', MetaData.Inherits);
        const sizeAfter2 = MuralBase._getInheritableDescriptors().size;
        assert.equal(sizeAfter1, sizeAfter2);
    });
});

// § 15.3 — RemoveValue drops the EVD slot entirely.
describe('§ 15.3 — MuralBase.RemoveValue', () => {

    test('returns true and frees the slot on first call; false on subsequent calls', () => {
        class Host153A extends MuralBase {}
        const key = MuralBase.RegisterProperty<number>(Host153A, 'P153A', 0, MetaData.None);
        const m = new Host153A();
        m.set_property_value(key, 7);
        assert.equal(m.RemoveValue(key), true, 'first call removes the slot');
        assert.equal(m.RemoveValue(key), false, 'second call has nothing to remove');
    });

    test('after RemoveValue the property reads as default', () => {
        class Host153B extends MuralBase {}
        const key = MuralBase.RegisterProperty<number>(Host153B, 'P153B', 99, MetaData.None);
        const m = new Host153B();
        m.set_property_value(key, 7);
        assert.equal(m.get_property_value(key), 7);
        m.RemoveValue(key);
        assert.equal(m.get_property_value(key), 99,
            'reads fall back to the registered default');
    });

    test('GetValueSource returns Default after RemoveValue', () => {
        class Host153C extends MuralBase {}
        const key = MuralBase.RegisterProperty<number>(Host153C, 'P153C', 0, MetaData.None);
        const m = new Host153C();
        m.set_property_value(key, 1);
        assert.equal(m.GetValueSource(key), PropertyValueSource.LocalValue);
        m.RemoveValue(key);
        assert.equal(m.GetValueSource(key), PropertyValueSource.Default);
    });

    test('a fresh write after RemoveValue creates a brand-new EVD slot', () => {
        class Host153D extends MuralBase {}
        const key = MuralBase.RegisterProperty<number>(Host153D, 'P153D', 0, MetaData.None);
        const m = new Host153D();
        m.set_property_value(key, 1);
        m.RemoveValue(key);
        m.set_property_value(key, 42);
        assert.equal(m.get_property_value(key), 42);
    });

    test('RemoveValue on a read-only property requires the privileged path', () => {
        class Host153E extends MuralBase {}
        const key = MuralBase.RegisterReadOnlyProperty<number>(Host153E, 'P153E', 0, MetaData.None);
        const m = new Host153E();
        // The ordinary RemoveValue rejects the read-only descriptor —
        // parallel to ClearValue's read-only gate.
        assert.throws(() => m.RemoveValue(key), /read-only/);
        // Privileged path lets the key-holder drop the slot. Use the
        // key-bearing setter to seed a value first.
        m.set_property_value_with_key(key, 5);
        assert.equal(m.RemoveValueWithKey(key), true);
        assert.equal(m.GetValueSource(key), PropertyValueSource.Default);
    });
});
