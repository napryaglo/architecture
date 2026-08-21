import type { PropertyChangeCallback } from './binding/effective-value.js';

// Minimal INotifyPropertyChanged analog. Change notification keyed by
// property NAME, driven by subclass getters/setters that call
// `RaisePropertyChanged`. No PropertyKey, no descriptor registry, no
// effective-value machinery — those all live on MuralBase (model.ts),
// which extends this class.
export class Observable {
  // Lazily allocated on first subscribe: name → callbacks. An Observable
  // that is never subscribed to allocates nothing beyond its own fields.
  private _listeners?: Map<string, PropertyChangeCallback[]>;

  // Virtual: MuralBase overrides this (widened to string | PropertyKey)
  // to route through its EVD listeners instead.
  public AddPropertyChangedListener(name: string, callback: PropertyChangeCallback): void {
    const listeners = (this._listeners ??= new Map());
    let arr = listeners.get(name);
    if (arr === undefined) { arr = []; listeners.set(name, arr); }
    arr.push(callback);
  }

  public RemovePropertyChangedListener(name: string, callback: PropertyChangeCallback): void {
    const arr = this._listeners?.get(name);
    if (arr === undefined) return;
    const i = arr.indexOf(callback);
    if (i >= 0) arr.splice(i, 1);
  }

  // Subclass setters call this AFTER writing the backing field, only on a
  // real change. Fires (owner, name, old, new) — the same public callback
  // arity the binding engine consumes for MuralBase. Named distinctly (not
  // `notify`) so it does not collide with a subclass's own domain method of
  // that common name.
  protected RaisePropertyChanged(name: string, oldValue: unknown, newValue: unknown): void {
    const cbs = this._listeners?.get(name);
    // `PropertyChangeCallback`'s first parameter is typed `MuralBase` (the
    // DP-bearing subclass), but a bare Observable has no MuralBase identity.
    // Cast through the callback's own parameter type: the callback only ever
    // reads `owner` as the notifying instance, so passing `this` is correct.
    if (cbs) {
      const owner = this as unknown as Parameters<PropertyChangeCallback>[0];
      for (const cb of [...cbs]) cb(owner, name, oldValue, newValue);
    }
  }
}
