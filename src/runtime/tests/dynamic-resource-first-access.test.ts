import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    Color,
    DynamicResource,
} from '../index.js';
import { Border } from '../../basic/border.js';
import { SolidColorBrush, HeadlessTarget } from '../../visual-engine/index.js';

// § 12.1 — DynamicResource re-wiring on first-access mid-life.
//
// A descendant's DynamicResource is built BEFORE any ancestor's
// `Resources` field is touched (lazy allocation). The descendant cached
// the empty ancestor chain. If the ancestor later accesses `Resources`
// for the first time AND sets a value, descendants must pick it up.

describe('§ 12.1 — DynamicResource picks up an ancestor\'s freshly-allocated Resources', () => {

    beforeEach(() => { Application.current = null; });

    test('Set into a never-before-touched Resources fires existing descendant DynamicResource', () => {
        new Application();

        const ancestor = new Border();
        const child    = new Border();
        ancestor.SetChild(child);

        // Pre-bind the child to '@FreshKey' BEFORE the ancestor's
        // Resources dict has been allocated (ancestor._resources is
        // undefined here — no one's touched ancestor.Resources yet).
        // The binding walks the ancestor chain at construction; with
        // _resources undefined, ancestor contributes nothing to the
        // subscription chain.
        child.set_property_value(Border.BackgroundKey,
            DynamicResource(child, 'FreshKey'));

        // Mount the tree so dynamic-resources cascade has a target.
        new HeadlessTarget(200, 200).Content = ancestor;

        // The bound DP shouldn't have resolved to anything yet — no
        // dictionary in the chain has the key. Binding's fallback is
        // undefined.
        assert.equal(child.Background, undefined,
            'no resource in the chain → Background unbound');

        // Now first-access ancestor.Resources and Set the key. Without
        // the cascade fix (§ 12.1), Set would notify a dictionary that
        // nobody subscribed to → child stays at undefined. With the
        // fix, the lazy-allocation cascade reaches the child binding,
        // which re-walks its chain, finds the (now-defined) ancestor
        // dict, and subscribes to it before the Set fires.
        const target = new SolidColorBrush(Color.FromHex('#bada55'));
        ancestor.Resources.Set('FreshKey', target);

        assert.equal(child.Background, target,
            'descendant DynamicResource resolves through ancestor\'s freshly-allocated Resources');
    });

    test('Multiple descendants all re-resolve on first-access lazy allocation', () => {
        new Application();

        const ancestor = new Border();
        const childA   = new Border();
        const childB   = new Border();
        const inner    = new Border();
        // Layered tree so the cascade covers depth too.
        ancestor.SetChild(childA);
        childA.SetChild(childB);
        childB.SetChild(inner);

        childA.set_property_value(Border.BackgroundKey,
            DynamicResource(childA, 'SharedToken'));
        inner.set_property_value(Border.BackgroundKey,
            DynamicResource(inner, 'SharedToken'));

        new HeadlessTarget(200, 200).Content = ancestor;

        assert.equal(childA.Background, undefined);
        assert.equal(inner.Background,  undefined);

        const target = new SolidColorBrush(Color.FromHex('#1e88e5'));
        ancestor.Resources.Set('SharedToken', target);

        assert.equal(childA.Background, target);
        assert.equal(inner.Background,  target);
    });

    test('Re-access after first allocation skips the cascade (no double-fire)', () => {
        new Application();

        const ancestor = new Border();
        const child    = new Border();
        ancestor.SetChild(child);

        // Touch ancestor.Resources FIRST — this triggers the cascade
        // once (descendant has no bindings yet so it's a no-op cost-wise,
        // but we're verifying the contract that subsequent accesses
        // don't re-cascade).
        ancestor.Resources;

        child.set_property_value(Border.BackgroundKey,
            DynamicResource(child, 'LateKey'));
        new HeadlessTarget(200, 200).Content = ancestor;

        // Subsequent reads + writes should not re-trigger cascades.
        // Mostly we're verifying nothing throws / loops.
        ancestor.Resources;
        ancestor.Resources.Set('LateKey',
            new SolidColorBrush(Color.FromHex('#ff8800')));

        // And the normal Set path still propagates correctly.
        assert.notEqual(child.Background, undefined,
            'normal subscription path still works after the cascade-once contract');
    });
});
