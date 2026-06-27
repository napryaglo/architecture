// Lightweight in-memory registry the platform shell reads at startup.
//
// Each demo module imports `register` and calls it once at module
// top level — importing the module is enough to enroll the demo. The
// platform HTML eagerly imports every demo module so the side effect
// fires before the navigation tree is built.
//
// Demo definition shape:
//   id        — unique string, kebab-case by convention.
//   group     — section label in the navigation tree.
//   title     — shown both in the tree row and as PageView.Title.
//   subtitle  — optional, shown as PageView.Subtitle (omitted when blank).
//   factory   — `() => Visual` returning the root of the demo's tree.
//               Called the first time the demo is activated; cached for
//               subsequent activations (so state persists during the
//               session — counter values, drawer open state, etc).
const _all = [];
const _cache = new Map(); // id → instantiated root Visual
const _listeners = new Set();
// Subscribe to demo registrations. Returns an unsubscribe thunk. Listeners
// fire only for demos registered AFTER subscribing — pair with allDemos()
// for the already-registered snapshot.
export function onDemoRegistered(listener) {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
}
export function register(def) {
    if (def === null || typeof def !== 'object') {
        throw new Error('register(def): expected a definition object');
    }
    const { id, group, title, factory } = def;
    if (typeof id !== 'string' || id.length === 0)
        throw new Error('demo def: id required');
    if (typeof group !== 'string' || group.length === 0)
        throw new Error('demo def: group required');
    if (typeof title !== 'string' || title.length === 0)
        throw new Error('demo def: title required');
    if (typeof factory !== 'function')
        throw new Error('demo def: factory required');
    if (_all.some(d => d.id === id)) {
        throw new Error(`demo def: '${id}' already registered`);
    }
    _all.push(def);
    for (const l of _listeners)
        l(def);
}
// Sorted view: group first, then title — matches how the tree renders
// them.
export function allDemos() {
    return _all.slice().sort((a, b) => {
        const g = a.group.localeCompare(b.group);
        return g !== 0 ? g : a.title.localeCompare(b.title);
    });
}
export function findDemo(id) {
    return _all.find(d => d.id === id);
}
// Materialise a demo's root Visual, caching across invocations so a
// nav-back-then-forward returns to the same state. The cache is keyed
// on definition id, not factory identity, so demos can hot-reload
// without leaking the previous tree if the factory closure ever
// changes.
export function instantiateDemo(id) {
    if (_cache.has(id))
        return _cache.get(id);
    const def = findDemo(id);
    if (def === undefined)
        return undefined;
    const root = def.factory();
    _cache.set(id, root);
    return root;
}
// Test / debugging helper: drop the cached instance so the next
// instantiateDemo call rebuilds from scratch.
export function clearDemoCache(id) {
    if (id === undefined)
        _cache.clear();
    else
        _cache.delete(id);
}
