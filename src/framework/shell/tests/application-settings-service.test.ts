import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { ShellModule } from '../module.js';
import { SettingDefinition, SettingKind } from '../settings/setting-definition.js';
import { Setting } from '../settings/setting.js';
import {
    ApplicationSettings,
    SettingsStoreKey,
    type ISettingsStore,
} from '../services/application-settings-service.js';

function definition(key: string, kind: SettingKind, def: unknown): SettingDefinition
{
    const d = new SettingDefinition();
    d.Key = key;
    d.Kind = kind;
    d.Default = def;
    return d;
}

function moduleWith(...defs: SettingDefinition[]): ShellModule
{
    const mod = new ShellModule();
    for (const d of defs) mod.Settings.Add(d);
    return mod;
}

function appWith(...modules: ShellModule[]): Application
{
    const app = new Application();
    for (const m of modules) app.Modules.Add(m);
    app.Services.register(ApplicationSettings.Key, p => new ApplicationSettings(p));
    return app;
}

describe('ApplicationSettings.PopulateFromModules', () => {
    test('builds a live Setting per definition across every module', () => {
        const app = appWith(
            moduleWith(definition('a.bool', SettingKind.Boolean, true),
                       definition('a.num', SettingKind.Number, 8)),
            moduleWith(definition('b.str', SettingKind.String, 'hi')),
        );
        const settings = app.Services.getRequired(ApplicationSettings.Key);

        const keys = [...settings.Settings].map(s => (s as Setting).Key);
        assert.deepEqual(keys, ['a.bool', 'a.num', 'b.str']);
    });

    test('each setting initialises to its definition default', () => {
        const app = appWith(moduleWith(
            definition('a.bool', SettingKind.Boolean, true),
            definition('a.num', SettingKind.Number, 8),
        ));
        const settings = app.Services.getRequired(ApplicationSettings.Key);

        assert.equal(settings.Get('a.bool'), true);
        assert.equal(settings.Get('a.num'), 8);
        assert.equal(settings.Get('missing'), undefined);
    });

    test('a duplicate key across modules is registered once (first wins)', () => {
        const app = appWith(
            moduleWith(definition('dup', SettingKind.Number, 1)),
            moduleWith(definition('dup', SettingKind.Number, 2)),
        );
        const settings = app.Services.getRequired(ApplicationSettings.Key);
        assert.equal(settings.Settings.Count, 1);
        assert.equal(settings.Get('dup'), 1);
    });
});

describe('ApplicationSettings Get/Set/Reset', () => {
    test('Set modifies the value; Reset restores the default', () => {
        const app = appWith(moduleWith(definition('a.num', SettingKind.Number, 8)));
        const settings = app.Services.getRequired(ApplicationSettings.Key);

        settings.Set('a.num', 42);
        assert.equal(settings.Get('a.num'), 42);
        settings.Reset('a.num');
        assert.equal(settings.Get('a.num'), 8);
    });

    test('Set on an unknown key is a no-op', () => {
        const app = appWith(moduleWith(definition('a.num', SettingKind.Number, 8)));
        const settings = app.Services.getRequired(ApplicationSettings.Key);
        settings.Set('nope', 1);                       // must not throw
        assert.equal(settings.Get('nope'), undefined);
    });

    test('GetSetting exposes the live Setting for direct Value binding', () => {
        const app = appWith(moduleWith(definition('a.bool', SettingKind.Boolean, false)));
        const settings = app.Services.getRequired(ApplicationSettings.Key);
        const live = settings.GetSetting('a.bool');
        assert.equal(live instanceof Setting, true);
        live!.Value = true;                            // a view TwoWay-writes the DP
        assert.equal(settings.Get('a.bool'), true);
    });
});

describe('ApplicationSettings persistence (ISettingsStore)', () => {
    test('overlays stored values onto the definition defaults at load', () => {
        const store: ISettingsStore = {
            Load: () => ({ 'a.bool': false }),         // persisted override
            Save: () => { /* unused here */ },
        };
        const app = new Application();
        app.Modules.Add(moduleWith(
            definition('a.bool', SettingKind.Boolean, true),   // default true …
            definition('a.num', SettingKind.Number, 8),
        ));
        app.Services.registerInstance(SettingsStoreKey, store);
        app.Services.register(ApplicationSettings.Key, p => new ApplicationSettings(p));
        const settings = app.Services.getRequired(ApplicationSettings.Key);

        assert.equal(settings.Get('a.bool'), false);   // … overridden by the store
        assert.equal(settings.Get('a.num'), 8);         // no override → default
    });

    test('a modification write-throughs the full value set to the store', () => {
        const saved: Record<string, unknown>[] = [];
        const store: ISettingsStore = {
            Load: () => ({}),
            Save: (values) => { saved.push(values); },
        };
        const app = new Application();
        app.Modules.Add(moduleWith(
            definition('a.bool', SettingKind.Boolean, true),
            definition('a.num', SettingKind.Number, 8),
        ));
        app.Services.registerInstance(SettingsStoreKey, store);
        app.Services.register(ApplicationSettings.Key, p => new ApplicationSettings(p));
        const settings = app.Services.getRequired(ApplicationSettings.Key);

        settings.Set('a.num', 16);
        assert.equal(saved.length, 1);
        assert.deepEqual(saved[0], { 'a.bool': true, 'a.num': 16 });
    });

    test('no store registered → in-memory (Set works, nothing persisted)', () => {
        const app = appWith(moduleWith(definition('a.num', SettingKind.Number, 8)));
        const settings = app.Services.getRequired(ApplicationSettings.Key);
        settings.Set('a.num', 99);                     // must not throw without a store
        assert.equal(settings.Get('a.num'), 99);
    });
});
