import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Observable, MetaData } from '../index.js';

class Loc extends Observable {
    static LabelKey = Observable.RegisterProperty<string>(Loc, 'label', '', MetaData.None);
    get label() { return this.get_property_value(Loc.LabelKey); }
    set label(v: string) { this.set_property_value(Loc.LabelKey, v); }
}

test('Observable stores + notifies without the EVD system', () => {
    const l = new Loc();
    assert.equal(l.label, '');                         // default before set
    const seen: string[] = [];
    l.AddPropertyChangedListener(Loc.LabelKey, (_o, _d, _old, nv) => seen.push(nv as string));
    l.label = 'Azure';
    assert.equal(l.label, 'Azure');
    assert.deepEqual(seen, ['Azure']);
});

test('an unbound Observable allocates no per-property EVD map', () => {
    const l = new Loc();
    // No value written, no listener attached: the light stores stay unallocated.
    assert.equal((l as unknown as { _values?: unknown })._values, undefined);
    assert.equal((l as unknown as { _listeners?: unknown })._listeners, undefined);
});
