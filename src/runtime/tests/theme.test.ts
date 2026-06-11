import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Application,
    ResourceDictionary,
    Scheme,
    Theme,
    ThemeManager,
    defineScheme,
    defineTheme,
    type TokenCatalog,
} from '../index.js';

// Minimal Application + cleanup between tests. The runtime test fixture
// builds an Application by constructing one directly — there's no
// global teardown, so each test that mutates ThemeManager state resets
// the manager singleton at the end.
function freshApp(): Application
{
    const app = new Application();
    Application.current = app;
    return app;
}

function reset(): void
{
    ThemeManager._resetForTesting();
    Application.current = undefined;
}

function tinyCatalog(): TokenCatalog
{
    return new Map([
        ['Primary',   { type: 'Brush',         description: 'Primary brand' }],
        ['Surface',   { type: 'Brush',         description: 'Default surface' }],
        ['ShapeFull', { type: 'CornerRadius',  description: 'Pill' }],
    ]);
}

describe('Theme — value class', () => {
    test('defineTheme exposes name, dictionaries, catalog, schemes, defaultScheme', () => {
        const scheme = defineScheme({
            name:   'light',
            theme:  'tiny',
            tokens: { Primary: 'p', Surface: 's', ShapeFull: 999 },
        });
        const theme = defineTheme({
            name:           'tiny',
            dictionaries:   [new ResourceDictionary()],
            catalog:        tinyCatalog(),
            schemes:        [scheme],
            defaultScheme:  'light',
        });
        assert.equal(theme.name, 'tiny');
        assert.equal(theme.dictionaries.length, 1);
        assert.equal(theme.catalog.get('Primary')?.type, 'Brush');
        assert.equal(theme.schemes.get('light'), scheme);
        assert.equal(theme.defaultScheme, 'light');
    });

    test('Theme rejects a Scheme that targets a different theme', () => {
        const scheme = defineScheme({
            name:   'light',
            theme:  'other',
            tokens: { Primary: 'p', Surface: 's', ShapeFull: 999 },
        });
        assert.throws(
            () => defineTheme({
                name:          'tiny',
                dictionaries:  [],
                catalog:       tinyCatalog(),
                schemes:       [scheme],
                defaultScheme: 'light',
            }),
            /targets theme 'other'/);
    });

    test('Theme rejects duplicate scheme names', () => {
        const a = defineScheme({ name: 'light', theme: 'tiny', tokens: {} });
        const b = defineScheme({ name: 'light', theme: 'tiny', tokens: {} });
        assert.throws(
            () => defineTheme({
                name:          'tiny',
                dictionaries:  [],
                catalog:       tinyCatalog(),
                schemes:       [a, b],
                defaultScheme: 'light',
            }),
            /duplicate scheme 'light'/);
    });

    test('Theme rejects a defaultScheme that does not exist', () => {
        const scheme = defineScheme({ name: 'light', theme: 'tiny', tokens: {} });
        assert.throws(
            () => defineTheme({
                name:          'tiny',
                dictionaries:  [],
                catalog:       tinyCatalog(),
                schemes:       [scheme],
                defaultScheme: 'dark',   // does not exist
            }),
            /defaultScheme 'dark' is not one of/);
    });
});

describe('Scheme — value class', () => {
    test('defineScheme tokens accepts both Map and plain Object', () => {
        const m = defineScheme({
            name: 'a', theme: 't',
            tokens: new Map([['k', 1]]),
        });
        assert.equal(m.tokens.get('k'), 1);

        const o = defineScheme({
            name: 'b', theme: 't',
            tokens: { k: 2 },
        });
        assert.equal(o.tokens.get('k'), 2);
    });

    test('FullName is "<theme>.<scheme>"', () => {
        const s = defineScheme({ name: 'light', theme: 'material', tokens: {} });
        assert.equal(s.FullName, 'material.light');
    });
});

describe('ThemeManager — registration', () => {
    test('RegisterTheme stores the theme and validates schemes', () => {
        reset();
        const light = defineScheme({
            name: 'light', theme: 'tiny',
            tokens: { Primary: 'p', Surface: 's', ShapeFull: 999 },
        });
        const theme = defineTheme({
            name: 'tiny', dictionaries: [],
            catalog: tinyCatalog(), schemes: [light], defaultScheme: 'light',
        });
        ThemeManager.Current.RegisterTheme(theme);
        assert.equal(ThemeManager.Current.GetTheme('tiny'), theme);
        reset();
    });

    test('RegisterTheme rejects re-registration of the same theme', () => {
        reset();
        const scheme = defineScheme({
            name: 'light', theme: 'tiny',
            tokens: { Primary: 'p', Surface: 's', ShapeFull: 999 },
        });
        const theme = defineTheme({
            name: 'tiny', dictionaries: [],
            catalog: tinyCatalog(), schemes: [scheme], defaultScheme: 'light',
        });
        ThemeManager.Current.RegisterTheme(theme);
        assert.throws(
            () => ThemeManager.Current.RegisterTheme(theme),
            /already registered/);
        reset();
    });

    test('RegisterTheme rejects a Scheme missing tokens from the catalog', () => {
        reset();
        const incomplete = defineScheme({
            name: 'light', theme: 'tiny',
            tokens: { Primary: 'p' /* Surface, ShapeFull missing */ },
        });
        const theme = defineTheme({
            name: 'tiny', dictionaries: [],
            catalog: tinyCatalog(), schemes: [incomplete], defaultScheme: 'light',
        });
        assert.throws(
            () => ThemeManager.Current.RegisterTheme(theme),
            /missing tokens.*Surface.*ShapeFull/);
        reset();
    });
});

describe('ThemeManager — basedOn scheme borrowing', () => {
    test('basedOn merges parent tokens under the child (child wins)', () => {
        reset();
        const parent = defineScheme({
            name: 'light', theme: 'tiny',
            tokens: { Primary: 'parent-p', Surface: 'parent-s', ShapeFull: 100 },
        });
        const parentTheme = defineTheme({
            name: 'tiny', dictionaries: [],
            catalog: tinyCatalog(), schemes: [parent], defaultScheme: 'light',
        });
        ThemeManager.Current.RegisterTheme(parentTheme);

        const child = defineScheme({
            name:    'light',
            theme:   'tiny2',
            basedOn: 'tiny.light',
            tokens:  { Primary: 'child-p' },   // override Primary only
        });
        const childTheme = defineTheme({
            name: 'tiny2', dictionaries: [],
            catalog: tinyCatalog(),    // same shape
            schemes: [child], defaultScheme: 'light',
        });
        ThemeManager.Current.RegisterTheme(childTheme);

        // Activation pulls the merged dict into Application.Resources;
        // the merged dict is what gets validated, so successful
        // registration above is the assertion. Spot-check via activation:
        const app = freshApp();
        ThemeManager.Current.ActivateTheme('tiny2');
        assert.equal(app.Resources.Resolve('Primary'),   'child-p');     // child wins
        assert.equal(app.Resources.Resolve('Surface'),   'parent-s');   // borrowed
        assert.equal(app.Resources.Resolve('ShapeFull'), 100);          // borrowed
        reset();
    });

    test('basedOn referencing an unknown scheme throws', () => {
        reset();
        const child = defineScheme({
            name:    'x',
            theme:   'tiny',
            basedOn: 'missing.scheme',
            tokens:  { Primary: 'p', Surface: 's', ShapeFull: 999 },
        });
        const theme = defineTheme({
            name: 'tiny', dictionaries: [],
            catalog: tinyCatalog(), schemes: [child], defaultScheme: 'x',
        });
        assert.throws(
            () => ThemeManager.Current.RegisterTheme(theme),
            /basedOn references unknown scheme 'missing\.scheme'/);
        reset();
    });
});

describe('ThemeManager — activation', () => {
    test('ActivateTheme merges templates and tokens into Application.Resources', () => {
        reset();
        const app = freshApp();

        const templates = new ResourceDictionary();
        templates.Set('DefaultButton', 'button-template-marker');

        const light = defineScheme({
            name: 'light', theme: 'tiny',
            tokens: { Primary: 'p-light', Surface: 's-light', ShapeFull: 999 },
        });
        const theme = defineTheme({
            name: 'tiny', dictionaries: [templates],
            catalog: tinyCatalog(), schemes: [light], defaultScheme: 'light',
        });
        ThemeManager.Current.RegisterTheme(theme);
        ThemeManager.Current.ActivateTheme('tiny');

        assert.equal(app.Resources.Resolve('Primary'),       'p-light');
        assert.equal(app.Resources.Resolve('DefaultButton'), 'button-template-marker');
        assert.equal(ThemeManager.Current.ActiveTheme,       theme);
        assert.equal(ThemeManager.Current.ActiveScheme,      light);
        reset();
    });

    test('ActivateScheme swaps token dicts on the active theme', () => {
        reset();
        const app = freshApp();

        const light = defineScheme({
            name: 'light', theme: 'tiny',
            tokens: { Primary: 'p-light', Surface: 's-light', ShapeFull: 999 },
        });
        const dark = defineScheme({
            name: 'dark', theme: 'tiny',
            tokens: { Primary: 'p-dark', Surface: 's-dark', ShapeFull: 888 },
        });
        const theme = defineTheme({
            name: 'tiny', dictionaries: [],
            catalog: tinyCatalog(),
            schemes: [light, dark], defaultScheme: 'light',
        });
        ThemeManager.Current.RegisterTheme(theme);
        ThemeManager.Current.ActivateTheme('tiny');
        assert.equal(app.Resources.Resolve('Primary'), 'p-light');

        ThemeManager.Current.ActivateScheme('dark');
        assert.equal(app.Resources.Resolve('Primary'), 'p-dark');
        assert.equal(ThemeManager.Current.ActiveScheme, dark);
        reset();
    });

    test('Idempotent — re-activating the same (theme, scheme) is a no-op', () => {
        reset();
        const app = freshApp();
        const scheme = defineScheme({
            name: 'light', theme: 'tiny',
            tokens: { Primary: 'p', Surface: 's', ShapeFull: 999 },
        });
        const theme = defineTheme({
            name: 'tiny', dictionaries: [],
            catalog: tinyCatalog(), schemes: [scheme], defaultScheme: 'light',
        });
        ThemeManager.Current.RegisterTheme(theme);
        ThemeManager.Current.ActivateTheme('tiny');
        const merged1 = app.Resources.MergedDictionaries.length;
        ThemeManager.Current.ActivateTheme('tiny');
        const merged2 = app.Resources.MergedDictionaries.length;
        assert.equal(merged1, merged2);
        reset();
    });

    test('ActivateTheme without an Application throws', () => {
        reset();
        const scheme = defineScheme({
            name: 'light', theme: 'tiny',
            tokens: { Primary: 'p', Surface: 's', ShapeFull: 999 },
        });
        const theme = defineTheme({
            name: 'tiny', dictionaries: [],
            catalog: tinyCatalog(), schemes: [scheme], defaultScheme: 'light',
        });
        ThemeManager.Current.RegisterTheme(theme);
        assert.throws(
            () => ThemeManager.Current.ActivateTheme('tiny'),
            /no Application\.current/);
        reset();
    });

    test('ActivateScheme without an active theme throws', () => {
        reset();
        freshApp();
        assert.throws(
            () => ThemeManager.Current.ActivateScheme('dark'),
            /no active theme/);
        reset();
    });

    test('ActivateScheme rejects an unknown scheme name', () => {
        reset();
        freshApp();
        const scheme = defineScheme({
            name: 'light', theme: 'tiny',
            tokens: { Primary: 'p', Surface: 's', ShapeFull: 999 },
        });
        const theme = defineTheme({
            name: 'tiny', dictionaries: [],
            catalog: tinyCatalog(), schemes: [scheme], defaultScheme: 'light',
        });
        ThemeManager.Current.RegisterTheme(theme);
        ThemeManager.Current.ActivateTheme('tiny');
        assert.throws(
            () => ThemeManager.Current.ActivateScheme('high-contrast'),
            /has no scheme 'high-contrast'/);
        reset();
    });
});

describe('ThemeManager — SchemeTransition surface', () => {
    test('SchemeTransition is undefined by default', () => {
        reset();
        assert.equal(ThemeManager.Current.SchemeTransition, undefined);
        assert.equal(ThemeManager.Current.EffectiveSchemeTransition, undefined);
        reset();
    });

    test('Setter stores the config; getter returns it unchanged', () => {
        reset();
        const cfg = { duration: 200, tokens: 'brushes-only' as const };
        ThemeManager.Current.SchemeTransition = cfg;
        assert.equal(ThemeManager.Current.SchemeTransition, cfg);
        reset();
    });

    test('EffectiveSchemeTransition returns the configured transition normally', () => {
        reset();
        freshApp();
        ThemeManager.Current.SchemeTransition = { duration: 200 };
        // No PrefersReducedMotion DP on a fresh root → effective = configured.
        assert.deepEqual(ThemeManager.Current.EffectiveSchemeTransition,
                         { duration: 200 });
        reset();
    });
});
