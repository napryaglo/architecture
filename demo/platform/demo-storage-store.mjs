// demo-storage-store.mjs — the demo platform's persistence backend.
//
// A browser-localStorage adapter for the framework's DiagramStorageKey. The
// Diagrammer and Commands demos resolve it through DI
// (`Application.current.Services.get(DiagramStorageKey)`) to save/load their
// scene; demos with no backend registered just run without persistence.
//
// Registered in platform.mu's `.services:` block (bound to DiagramStorageKey),
// so the app's persistence composition lives in markup — backlog § 27:
// resource AND service composition belongs in `.mu`, not the JS bootstrap. This
// replaces the old imperative `app.Services.registerInstance(DiagramStorageKey,
// { GetItem, SetItem })` block that used to sit in platform.html.
export class DemoStorageStore {
    GetItem(key)        { return window.localStorage.getItem(key); }
    SetItem(key, value) { window.localStorage.setItem(key, value); }
}
