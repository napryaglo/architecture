import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Observable, MuralBase, MetaData } from '../index.js';

// A plain Observable subclass: real typed field + getter/setter + notify.
class Loc extends Observable {
  private _label = '';
  get label(): string { return this._label; }
  set label(v: string) {
    const old = this._label;
    if (old === v) return;
    this._label = v;
    this.notify('label', old, v);
  }
}

test('Observable notifies by name on setter change', () => {
  const l = new Loc();
  assert.equal(l.label, '');
  const seen: Array<[string, unknown]> = [];
  l.AddPropertyChangedListener('label', (_o, name, _old, nv) => seen.push([name, nv]));
  l.label = 'Azure';
  assert.equal(l.label, 'Azure');
  assert.deepEqual(seen, [['label', 'Azure']]);
});

test('setting an equal value fires nothing', () => {
  const l = new Loc();
  let fired = 0;
  l.AddPropertyChangedListener('label', () => { fired++; });
  l.label = '';            // equal to default; setter guards
  assert.equal(fired, 0);
});

test('an unsubscribed Observable allocates no listener map', () => {
  const l = new Loc();
  assert.equal((l as unknown as { _listeners?: unknown })._listeners, undefined);
});

test('RemovePropertyChangedListener stops delivery', () => {
  const l = new Loc();
  let fired = 0;
  const cb = (): void => { fired++; };
  l.AddPropertyChangedListener('label', cb);
  l.RemovePropertyChangedListener('label', cb);
  l.label = 'x';
  assert.equal(fired, 0);
});

// ---------------------------------------------------------------------------
// Correctness edges
// ---------------------------------------------------------------------------

// A two-field Observable subclass for edge tests.
class Point extends Observable {
  private _x = 0;
  private _y = 0;

  get x(): number { return this._x; }
  set x(v: number) {
    const old = this._x;
    if (old === v) return;
    this._x = v;
    this.notify('x', old, v);
  }

  get y(): number { return this._y; }
  set y(v: number) {
    const old = this._y;
    if (old === v) return;
    this._y = v;
    this.notify('y', old, v);
  }
}

test('unwritten field reads its declared initializer', () => {
  const p = new Point();
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
});

test('setter receiving an equal value fires no notification', () => {
  const p = new Point();
  let fired = 0;
  p.AddPropertyChangedListener('x', () => { fired++; });
  p.x = 0; // equal to initializer; guard fires nothing
  assert.equal(fired, 0);
  p.x = 5;
  p.x = 5; // same value again; no notification
  assert.equal(fired, 1); // only the first real change
});

test('notify fires exactly once per real change with (owner, name, old, new) arity', () => {
  const p = new Point();
  type Evt = [owner: unknown, name: string, oldv: unknown, newv: unknown];
  const events: Evt[] = [];
  p.AddPropertyChangedListener('x', (owner, name, oldv, newv) => {
    events.push([owner, name, oldv, newv]);
  });
  p.x = 7;
  assert.equal(events.length, 1);
  const [owner, name, oldv, newv] = events[0];
  assert.equal(owner, p, 'owner must be the instance');
  assert.equal(name, 'x');
  assert.equal(oldv, 0);
  assert.equal(newv, 7);
});

test('two independent names notify independently', () => {
  const p = new Point();
  const xEvents: string[] = [];
  const yEvents: string[] = [];
  p.AddPropertyChangedListener('x', (_o, name) => xEvents.push(name));
  p.AddPropertyChangedListener('y', (_o, name) => yEvents.push(name));
  p.x = 3;
  p.y = 4;
  p.y = 8;
  assert.deepEqual(xEvents, ['x']);
  assert.deepEqual(yEvents, ['y', 'y']);
});

test('subscribing the same callback twice delivers twice (array semantics, no dedup)', () => {
  const p = new Point();
  let count = 0;
  const cb = (): void => { count++; };
  p.AddPropertyChangedListener('x', cb);
  p.AddPropertyChangedListener('x', cb);
  p.x = 1;
  assert.equal(count, 2);
});

// ---------------------------------------------------------------------------
// Cost / structural test
// ---------------------------------------------------------------------------

// A two-field MuralBase subclass for the cost comparison.
class CostMB extends MuralBase {
  static readonly LabelKey = MuralBase.RegisterProperty(CostMB, 'label', '', MetaData.None);
  static readonly CountKey = MuralBase.RegisterProperty(CostMB, 'count', 0, MetaData.None);
}

test('Observable instances carry no property_values EVD map (structural win over MuralBase)', () => {
  const N = 10_000;

  // Build N Observable instances; write one field on each.
  const obs: Point[] = [];
  for (let i = 0; i < N; i++) {
    const p = new Point();
    p.x = i;       // writes backing field; no subscribe → _listeners stays undefined
    obs.push(p);
  }

  // Every Observable instance must lack the property_values EVD map.
  for (const p of obs) {
    assert.equal(
      (p as unknown as { property_values?: unknown }).property_values,
      undefined,
      'Observable instances must not have a property_values map',
    );
  }

  // An Observable written-to but never subscribed must have _listeners === undefined.
  for (const p of obs) {
    assert.equal(
      (p as unknown as { _listeners?: unknown })._listeners,
      undefined,
      'unsubscribed Observable must not allocate _listeners',
    );
  }

  // Build N MuralBase instances; set one DP on each to make property_values non-empty.
  const mbs: CostMB[] = [];
  for (let i = 0; i < N; i++) {
    const m = new CostMB();
    m.set_property_value(CostMB.LabelKey, `item-${i}`);
    mbs.push(m);
  }

  // Every MuralBase instance that had a DP set DOES have property_values (the
  // contrast that proves the Observable win).
  for (const m of mbs) {
    assert.notEqual(
      (m as unknown as { property_values?: unknown }).property_values,
      undefined,
      'MuralBase instance with a set DP must have property_values',
    );
  }
});
