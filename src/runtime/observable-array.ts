// Reactive-array helpers used by PropertyPath to push notifications
// when a plain JS array along a binding path is mutated. WPF's
// ObservableCollection<T> (see observable-collection.ts) is the
// canonical reactive collection — explicit, with a clean Subscribe /
// CollectionChange API. This file covers the OTHER case: a binding
// path lands on a raw `Array<T>` and we still want change notifications
// to flow so consumers like `Binding(dept, 'managers[2].label')` keep
// working when the array shifts.
//
// Approach: on first encounter, wrap the array in a Proxy whose `set`
// and `deleteProperty` traps fire a per-array notify callback after
// the underlying mutation completes. The Proxy is cached per raw
// array via a WeakMap so repeated wraps return the same instance
// (keeping identity stable across re-traverses).
//
// Caveats:
//   * Mutations to the ORIGINAL raw array (not the wrapped proxy)
//     do not notify — Proxy can only observe operations routed
//     through the proxy. Prefer mutating through the value the
//     binding hands back, or use `ObservableCollection<T>` for
//     guaranteed reactivity regardless of how the array is held.
//   * `arr[i] = x` writes that don't change the value still fire
//     (the trap can't cheaply tell). Listener-side dedup is on the
//     consumer.

interface ObservableArrayEntry
{
    readonly proxy: readonly unknown[];
    readonly subscribers: Set<() => void>;
}

// Marker symbol so a Proxy can identify itself. Reading
// `proxy[OBSERVE_MARKER]` returns true; the raw array returns undefined.
const OBSERVE_MARKER = Symbol('observed-array');

// Single registry keyed by BOTH the raw array AND its proxy. Two-way
// lookup lets `observe_array(x)` return the same proxy whether `x` is
// the raw array (first-time wrap) or the proxy itself (re-encounter).
// WeakMap so both arrays drop when no live reference holds them.
const PROXY_REGISTRY = new WeakMap<object, ObservableArrayEntry>();

// Returns true when `value` is a Proxy minted by `observe_array`.
// Plain arrays and ObservableCollection instances return false.
export function is_observed_array(value: unknown): boolean
{
    return Array.isArray(value) && (value as unknown as Record<symbol, unknown>)[OBSERVE_MARKER] === true;
}

// Idempotent — calling on the proxy or on the raw array returns the
// same proxy. Non-array inputs are returned unchanged.
export function observe_array<T>(value: T[]): T[]
{
    if (!Array.isArray(value)) return value;
    const existing = PROXY_REGISTRY.get(value);
    if (existing !== undefined) return existing.proxy as T[];

    const subscribers = new Set<() => void>();
    const notify = (): void =>
    {
        // Snapshot so an unsubscribe-during-notify doesn't disrupt
        // iteration. Same pattern as ObservableCollection.notify.
        for (const s of [...subscribers]) s();
    };

    const proxy = new Proxy(value, {
        get(target, prop, receiver): unknown
        {
            if (prop === OBSERVE_MARKER) return true;
            return Reflect.get(target, prop, receiver);
        },
        set(target, prop, newValue, receiver): boolean
        {
            const result = Reflect.set(target, prop, newValue, receiver);
            // Numeric indices and `length` writes are the mutating
            // operations callers care about. Mutating Array methods
            // (push / pop / shift / unshift / splice / sort / reverse
            // / fill / copyWithin) route through `length` + numeric
            // [[Set]] calls internally, so this trap catches them all.
            if (typeof prop === 'string' && (prop === 'length' || prop !== '' && !Number.isNaN(Number(prop))))
            {
                notify();
            }
            return result;
        },
        deleteProperty(target, prop): boolean
        {
            const result = Reflect.deleteProperty(target, prop);
            if (typeof prop === 'string' && prop !== '' && !Number.isNaN(Number(prop)))
            {
                notify();
            }
            return result;
        },
    });

    const entry: ObservableArrayEntry = { proxy, subscribers };
    PROXY_REGISTRY.set(value, entry);
    PROXY_REGISTRY.set(proxy, entry);
    return proxy as T[];
}

// Subscribe to mutations on the array (raw or proxy). If `value` has
// not been wrapped yet, it is wrapped silently as a side effect — the
// returned unsubscribe thunk closes over the same notification list
// the proxy uses. Listeners fire synchronously after every mutation
// routed through the proxy. Returns `() => void` if `value` is not
// an array (no-op unsubscribe).
export function subscribe_array(value: readonly unknown[], listener: () => void): () => void
{
    if (!Array.isArray(value)) return () => {};
    let entry = PROXY_REGISTRY.get(value);
    if (entry === undefined)
    {
        observe_array(value as unknown[]);
        entry = PROXY_REGISTRY.get(value)!;
    }
    entry.subscribers.add(listener);
    return () => { entry!.subscribers.delete(listener); };
}
