import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    Application,
    MetaData,
    Model,
    Panel,
    ResourceDictionary,
    Scheme,
    Size,
    Theme,
    ThemeManager,
    Visual,
    type DrawingContext,
    type MountableTarget,
} from '../index.js';

// Tiny Visual used as a stand-in for the application's root and as a
// resource-walk leaf. Plain Visual is abstract; this satisfies it
// minimally.
class TestLeaf extends Visual
{
    static {
        Model.RegisterProperty(TestLeaf, 'Brush', undefined, MetaData.None);
    }
    public get Brush(): unknown { return this._get_property_value_by_name('Brush'); }
    public set Brush(v: unknown) { this._set_property_value_by_name('Brush', v); }
    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

// Minimal MountableTarget — the consumer's PresentationTarget would
// satisfy this structurally; for tests a plain object is enough.
function makeFakeTarget(): MountableTarget
{
    return { Content: undefined };
}

describe('Application — construction and ambient singleton', () => {
    // Tests intentionally clear the ambient singleton before each run
    // so cross-test pollution doesn't mask bugs in the fallback path.
    beforeEach(() => { Application.current = null; });

    test('constructor sets Application.current to the new instance', () => {
        assert.equal(Application.current, null);
        const app = new Application();
        assert.equal(Application.current, app);
    });

    test('last-constructed wins for the ambient singleton', () => {
        const a = new Application();
        const b = new Application();
        assert.equal(Application.current, b);
        // The earlier instance still exists; nothing destroys it.
        assert.notEqual(a, b);
    });

    test('Resources is a fresh ResourceDictionary per instance', () => {
        const a = new Application();
        const b = new Application();
        assert.notEqual(a.Resources, b.Resources);
        a.Resources.Set('K', 'a-value');
        assert.equal(b.Resources.CanResolve('K'), false);
    });
});

describe('Application — Root delegation', () => {
    beforeEach(() => { Application.current = null; });

    test('Root is undefined until Resources.Root is set', () => {
        const app = new Application();
        assert.equal(app.Root, undefined);
    });

    test('Application.Root delegates to Resources.Root', () => {
        const app = new Application();
        const root = new TestLeaf();
        app.Resources.Root = root;
        assert.equal(app.Root, root);
    });
});

describe('Application — Mount', () => {
    beforeEach(() => { Application.current = null; });

    test('Mount throws when no x:root has been registered', () => {
        const app = new Application();
        const target = makeFakeTarget();
        assert.throws(
            () => app.Mount(target),
            /no x:root marker in Resources/,
        );
        // Target unchanged on failure.
        assert.equal(target.Content, undefined);
    });

    test('Mount assigns Root to target.Content and returns the target', () => {
        const app = new Application();
        const root = new TestLeaf();
        app.Resources.Root = root;
        const target = makeFakeTarget();
        const result = app.Mount(target);
        assert.equal(target.Content, root);
        assert.equal(result, target);
    });
});

describe('Application — resource-walk fallback', () => {
    beforeEach(() => { Application.current = null; });

    test('Visual.TryFindResource falls back to Application.current.Resources after tree exhaustion', () => {
        // A leaf with no Resources, no parents — the tree walk
        // exhausts immediately. The Application fallback should pick
        // up the key from the app's root dict.
        const app = new Application();
        app.Resources.Set('Theme', 'dark');

        const leaf = new TestLeaf();
        assert.equal(leaf.TryFindResource('Theme'), 'dark');
    });

    test('falls back to undefined when no Application.current is set', () => {
        // No `new Application()` — the beforeEach hook nulled the singleton.
        const leaf = new TestLeaf();
        assert.equal(leaf.TryFindResource('Theme'), undefined);
    });

    test('ancestor Resources shadow Application.Resources for the same key', () => {
        const app = new Application();
        app.Resources.Set('Brush', 'app-level');

        class TestPanel extends Panel { }
        const root = new TestPanel();
        root.Resources.Set('Brush', 'ancestor-level');

        const leaf = new TestLeaf();
        root.AddChild(leaf);

        // The tree walk hits root.Resources first and short-circuits.
        assert.equal(leaf.TryFindResource('Brush'), 'ancestor-level');
    });

    test('Application.Resources answers when no ancestor has the key', () => {
        const app = new Application();
        app.Resources.Set('OnlyAtApp', 42);

        class TestPanel extends Panel { }
        const root = new TestPanel();
        root.Resources.Set('Other', 'something-else');

        const leaf = new TestLeaf();
        root.AddChild(leaf);

        assert.equal(leaf.TryFindResource('OnlyAtApp'), 42);
        assert.equal(leaf.TryFindResource('Other'),    'something-else');
        assert.equal(leaf.TryFindResource('Missing'),  undefined);
    });
});

describe('Application.initialize', () => {
    // Fresh manager + app per test — initialize is stateful (flips
    // IsInitialized to true) and ThemeManager activates merge into
    // Application.Resources. Cross-test leak would mask real bugs.
    beforeEach(() => {
        ThemeManager._resetForTesting();
        Application._resetDefaultThemeForTesting();
        Application.current = null;
    });

    // Tiny test theme — emulates a compiler-emitted theme class
    // shape so the test exercises the same code path Material does
    // without pulling in the visual-engine cycle.
    class TinyLight extends Scheme
    {
        public static readonly instance: TinyLight = new TinyLight();
        private constructor()
        {
            super({ name: 'TinyLight', theme: 'Tiny', tokens: { Token: 'L' } });
        }
    }
    class TinyDark extends Scheme
    {
        public static readonly instance: TinyDark = new TinyDark();
        private constructor()
        {
            super({ name: 'TinyDark', theme: 'Tiny', tokens: { Token: 'D' } });
        }
    }
    class Tiny extends Theme
    {
        public static readonly instance: Tiny = new Tiny();
        private constructor()
        {
            super({
                name:           'Tiny',
                dictionaries:   [new ResourceDictionary()],
                catalog:        new Map([['Token', { type: 'string' }]]),
                schemes:        [TinyLight.instance, TinyDark.instance],
                defaultScheme:  'TinyLight',
            });
        }
        public static override Activate(scheme?: typeof Scheme): void
        {
            const target = scheme ?? TinyLight;
            ThemeManager.Current.ActivateTheme(Tiny.instance.name, { scheme: target.name });
        }
    }

    function registerTiny(): void
    {
        if (ThemeManager.Current.GetTheme('Tiny') === undefined)
        {
            ThemeManager.Current.RegisterTheme(Tiny.instance);
        }
    }

    test('fresh Application is not yet initialized', () => {
        const app = new Application();
        assert.equal(app.IsInitialized, false);
    });

    test('initialize() with no options flips IsInitialized to true and activates the registered default theme', () => {
        registerTiny();
        Application.RegisterDefaultTheme(Tiny);
        const app = new Application();
        app.initialize();
        assert.equal(app.IsInitialized, true);
        assert.equal(ThemeManager.Current.ActiveTheme?.name, 'Tiny',
            'default theme is activated implicitly');
    });

    test('initialize() with no options and no registered default is a quiet no-op', () => {
        const app = new Application();
        app.initialize();
        assert.equal(app.IsInitialized, true);
        assert.equal(ThemeManager.Current.ActiveTheme, undefined);
    });

    test('initialize({ theme }) activates the theme via its static Activate', () => {
        registerTiny();
        const app = new Application();
        app.initialize({ theme: Tiny });
        assert.equal(app.IsInitialized, true);
        assert.equal(ThemeManager.Current.ActiveTheme?.name, 'Tiny');
        assert.equal(ThemeManager.Current.ActiveScheme?.name, 'TinyLight',
            'omitted scheme falls back to the theme DefaultScheme');
        assert.equal(app.Resources.Resolve('Token'), 'L',
            'theme tokens are merged into the application resource chain');
    });

    test('initialize({ theme, scheme }) activates the named scheme', () => {
        registerTiny();
        const app = new Application();
        app.initialize({ theme: Tiny, scheme: TinyDark });
        assert.equal(ThemeManager.Current.ActiveScheme?.name, 'TinyDark');
        assert.equal(app.Resources.Resolve('Token'), 'D');
    });

    test('initialize is idempotent — repeat calls are no-ops', () => {
        registerTiny();
        const app = new Application();
        app.initialize({ theme: Tiny, scheme: TinyDark });
        app.initialize({ theme: Tiny, scheme: TinyLight });
        assert.equal(ThemeManager.Current.ActiveScheme?.name, 'TinyDark',
            'second initialize did not re-activate');
    });

    test('RegisterDefaultTheme is first-wins', () => {
        registerTiny();
        Application.RegisterDefaultTheme(Tiny);
        // Build a second theme; registering it should NOT replace Tiny
        // as the default. The Theme ctor's scheme/theme cross-check
        // requires this theme's scheme to target itself, so build a
        // standalone scheme.
        class OtherLight extends Scheme {
            public static readonly instance: OtherLight = new OtherLight();
            private constructor() {
                super({ name: 'OtherLight', theme: 'Other', tokens: { Token: '_' } });
            }
        }
        class Other extends Theme {
            public static readonly instance: Other = new Other();
            private constructor() {
                super({
                    name: 'Other',
                    dictionaries: [],
                    catalog: new Map([['Token', { type: 'string' }]]),
                    schemes: [OtherLight.instance],
                    defaultScheme: 'OtherLight',
                });
            }
            public static override Activate(): void { /* unused */ }
        }
        Application.RegisterDefaultTheme(Other);
        assert.equal(Application.DefaultTheme, Tiny,
            'first registered theme remains the default');
    });
});
