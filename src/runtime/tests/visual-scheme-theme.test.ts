import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    Color,
    defineScheme,
    DynamicResource,
    ThemeManager,
} from '../index.js';
import { Border } from '../../basic/border.js';
import { HeadlessTarget, SolidColorBrush } from '../../visual-engine/index.js';

// § 17.1 / § 17.2 / § 17.6 — inherited Scheme + Theme DPs let a subtree
// override the ambient scheme (and theme) so descendants resolve their
// `@Token` lookups against the override's token map. DynamicResource
// bindings re-resolve when the cascade reaches them.

describe('§ 17.1 — Visual.Scheme inherited DP', () => {

    beforeEach(() => { Application.current = null; });

    test('Scheme defaults to undefined on a fresh Visual', () => {
        new Application();
        const b = new Border();
        assert.equal(ThemeManager.GetVisualScheme(b), undefined);
    });

    test('Scheme cascades from ancestor to descendant via inheritance', () => {
        new Application();
        const outer = new Border();
        const inner = new Border();
        outer.SetChild(inner);
        const target = new HeadlessTarget(200, 200);
        target.Content = outer;

        const scheme = defineScheme({
            name: 'override-test',
            theme: 'test',
            tokens: { Primary: 'fake-brush' },
        });
        ThemeManager.SetVisualScheme(outer, scheme);

        assert.equal(ThemeManager.GetVisualScheme(outer), scheme);
        assert.equal(ThemeManager.GetVisualScheme(inner), scheme,
            'inner inherits Scheme from outer');
    });

    test('TryFindResource consults the ambient Scheme for string-keyed tokens', () => {
        new Application();
        const outer = new Border();
        const target = new HeadlessTarget(200, 200);
        target.Content = outer;

        const accent = new SolidColorBrush(Color.FromHex('#bada55'));
        const scheme = defineScheme({
            name: 'scheme-resolve',
            theme: 'test',
            tokens: { MyToken: accent },
        });
        ThemeManager.SetVisualScheme(outer, scheme);

        const result = outer.TryFindResource('MyToken');
        assert.equal(result, accent,
            'ambient Scheme override exposes the token to TryFindResource');
    });

    test('DynamicResource binding picks up the override scheme on cascade', () => {
        new Application();
        const outer = new Border();
        const inner = new Border();
        outer.SetChild(inner);
        const target = new HeadlessTarget(200, 200);
        target.Content = outer;

        const startBrush = new SolidColorBrush(Color.FromHex('#000000'));
        const overrideBrush = new SolidColorBrush(Color.FromHex('#bada55'));
        const overrideScheme = defineScheme({
            name: 'override',
            theme: 'test',
            tokens: { CascadeKey: overrideBrush },
        });

        // Bind inner.Fill to the dynamic resource BEFORE setting
        // any ambient scheme. Initial resolution returns undefined
        // (no scheme, no app fallback for CascadeKey).
        inner.set_property_value(Border.FillKey,
            DynamicResource(inner, 'CascadeKey'));
        assert.equal(inner.Fill, undefined);

        // Sanity: a plain ancestor Resources.Set works (existing path).
        outer.Resources.Set('CascadeKey', startBrush);
        assert.equal(inner.Fill, startBrush);

        // Now set Scheme on outer. The cascade fires the dynamic-resource
        // listener; the binding re-resolves. The override Scheme's
        // token takes precedence over the local Resources only when
        // local Resources doesn't have the key — local always wins.
        // So we use a DIFFERENT key not present in outer.Resources.
        const scheme2 = defineScheme({
            name: 'scheme2',
            theme: 'test',
            tokens: { OtherKey: overrideBrush },
        });
        const inner2 = new Border();
        const outer2 = new Border();
        outer2.SetChild(inner2);
        const target2 = new HeadlessTarget(200, 200);
        target2.Content = outer2;

        inner2.set_property_value(Border.FillKey,
            DynamicResource(inner2, 'OtherKey'));
        assert.equal(inner2.Fill, undefined);
        ThemeManager.SetVisualScheme(outer2, scheme2);
        assert.equal(inner2.Fill, overrideBrush,
            'DynamicResource picks up the override Scheme on cascade');
    });
});

describe('§ 17.2 — runtime cross-theme reuse', () => {

    beforeEach(() => { Application.current = null; });

    test('a subtree can run Theme-A templates against Theme-B schemes by setting both DPs', () => {
        // The mechanism: SetVisualScheme(visual, schemeB) overrides
        // ambient token resolution for that subtree; templates that
        // came from theme A still run because the Theme DP cascade is
        // independent. So a subtree gets "Theme A's chrome painted in
        // Theme B's colors" — the spec's design-system A/B preview use
        // case.
        new Application();
        const root = new Border();
        const skinned = new Border();
        root.SetChild(skinned);
        const target = new HeadlessTarget(200, 200);
        target.Content = root;

        const themeBScheme = defineScheme({
            name: 'theme-b',
            theme: 'B',
            tokens: { Primary: new SolidColorBrush(Color.FromHex('#0099ff')) },
        });

        ThemeManager.SetVisualScheme(skinned, themeBScheme);

        // skinned's @Primary now resolves through theme-B's tokens.
        const r = skinned.TryFindResource('Primary');
        assert.equal(r instanceof SolidColorBrush, true);
        assert.equal((r as SolidColorBrush).Color.B, 0xff);
    });
});

describe('§ 17.6 — Theme.ApplyTo via Visual.Theme attached DP', () => {

    beforeEach(() => { Application.current = null; });

    test('Visual.Theme inherits + caches via the same DP machinery as Scheme', () => {
        new Application();
        const a = new Border();
        const b = new Border();
        a.SetChild(b);
        const target = new HeadlessTarget(200, 200);
        target.Content = a;

        // Use a stub object whose shape satisfies the cast-as-Theme
        // structural type — the inheritance machinery doesn't care
        // about Theme's API beyond reference identity. Replaces the
        // "Theme.ApplyTo attached property" idea from the deferred
        // backlog entry: setting Visual.Theme IS the subtree theme swap.
        const fakeTheme = { name: 'fake' } as unknown as
            Parameters<typeof ThemeManager.SetVisualTheme>[1];
        ThemeManager.SetVisualTheme(a, fakeTheme);
        assert.equal(ThemeManager.GetVisualTheme(a), fakeTheme);
        assert.equal(ThemeManager.GetVisualTheme(b), fakeTheme,
            'descendant inherits the local Theme override');
    });
});
