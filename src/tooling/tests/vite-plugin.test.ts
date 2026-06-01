import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { vitePluginMural } from '../vite-plugin.js';

const TINY_APP = `
    Application{ resources: {
        Border x:root[Padding=(8)]{}
    } }
`;

describe('vitePluginMural — file routing', () => {
    test('plugin transforms .mu files', () => {
        const plugin = vitePluginMural();
        const out = plugin.transform(TINY_APP, '/path/to/dashboard.mu');
        assert.notEqual(out, null);
        if (out !== null)
        {
            assert.match(out.code, /export const app = /);
            assert.equal(out.map, null);
        }
    });

    test('plugin passes through non-.mu files unchanged (returns null)', () => {
        const plugin = vitePluginMural();
        assert.equal(plugin.transform('console.log(1)', '/path/to/script.js'), null);
        assert.equal(plugin.transform('<svg/>',         '/path/to/asset.svg'), null);
    });

    test('plugin strips Vite query strings before extension matching', () => {
        const plugin = vitePluginMural();
        const out = plugin.transform(TINY_APP, '/x/dashboard.mu?import');
        assert.notEqual(out, null);
    });

    test('custom extensions override the default', () => {
        const plugin = vitePluginMural({ extensions: ['.mural', '.view'] });
        assert.notEqual(plugin.transform(TINY_APP, '/x/a.mural'), null);
        assert.notEqual(plugin.transform(TINY_APP, '/x/a.view'),  null);
        // Default `.mu` no longer matches once overridden.
        assert.equal(plugin.transform(TINY_APP, '/x/a.mu'), null);
    });

    test('plugin name and enforce are stable for Vite plugin ordering', () => {
        const plugin = vitePluginMural();
        assert.equal(plugin.name,    'vite-plugin-mural');
        assert.equal(plugin.enforce, 'pre');
    });
});

describe('vitePluginMural — onCompile hook', () => {
    test('hook receives the source id and a populated CompileResult', () => {
        const calls: Array<{ id: string; sym: string[] }> = [];
        const plugin = vitePluginMural({
            onCompile: (id, result) =>
            {
                const syms: string[] = [];
                for (const set of result.imports.values()) for (const s of set) syms.push(s);
                calls.push({ id, sym: syms.sort() });
            },
        });
        plugin.transform(TINY_APP, '/x/y.mu');
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.id, '/x/y.mu');
        assert.ok(calls[0]!.sym.includes('Application'));
        assert.ok(calls[0]!.sym.includes('Border'));
        assert.ok(calls[0]!.sym.includes('Thickness'));
    });
});
