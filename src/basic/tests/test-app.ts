import { Application, ThemeManager } from '../../runtime/index.js';
import { Material, MaterialLight } from '../../resources/material/material.js';

// Test fixture — spins up an Application with Material activated.
//
// Use this in tests that construct controls. Controls read their
// default templates from the active theme's dictionaries, so a test
// that doesn't activate Material gets
// `Application.ResolveDefaultResource(MyClass) === undefined` and
// `defaultTemplate(MyClass)` throws.
//
// SHARED Application semantics. The fixture reuses a SINGLE process-
// wide Application across every test that calls it, rather than
// creating a fresh instance per test. Why: ThemeManager.activate
// adds/removes its dictionaries from the *previous* active
// Application's Resources during re-activation. If test 1 holds
// references to Visuals constructed against app1 and test 2
// re-activates against app2, the removal cascade hits the still-live
// app1 Visuals via Resource Subscribe listeners and breaks template
// state — a real test-isolation hazard. Sharing one Application
// across tests sidesteps the cascade entirely; ambient state that
// would leak between tests (resource `Set`s, x:root markers, …) is
// rare in practice and easy to clean up per-test when needed.
//
// Helper file (not a .test.ts) so it isn't picked up by node's test
// runner. Lives under src/basic/tests/ to share its location with the
// suites that need it; framework / list / menu / tool-bar tests
// import via relative path.
let _sharedApp: Application | undefined;

export function initTestApp(): Application
{
    if (_sharedApp === undefined)
    {
        // Idempotent re-registration in case some prior test reset
        // ThemeManager via `_resetForTesting()`.
        if (ThemeManager.GetTheme(Material.instance.name) === undefined)
        {
            ThemeManager.RegisterTheme(Material.instance);
        }
        Application.RegisterDefaultTheme(Material);
        _sharedApp = new Application();
        _sharedApp.initialize({ theme: Material, scheme: MaterialLight });
    }
    Application.current = _sharedApp;
    return _sharedApp;
}
