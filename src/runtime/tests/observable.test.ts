import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../index.js';

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
