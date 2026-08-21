import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import * as runtime from '../../runtime/index.js';
import * as engine from '../../visual-engine/index.js';
import * as basic from '../../basic/index.js';
import { instantiate } from '../compile.js';
import { DEFAULT_SYMBOLS } from '../symbol-table.js';
import { DataTemplate } from '../../basic/templates/data-template.js';

class Entity extends runtime.MuralBase {}

describe('instantiate — resources dictionary', () => {
    test('builds a resources {} doc and resolves a keyed template', () => {
        initTestApp();
        const source = [
            'resources P {',
            '    DataTemplate x:key="mm:foo" [ DataType = Entity ] {',
            '        TextBlock [ Text = "Foo" ]',
            '    }',
            '}',
        ].join('\n');
        const ctx: Record<string, unknown> = { ...runtime, ...engine, ...basic, Entity };
        const symbols = new Map([...DEFAULT_SYMBOLS, ['Entity', '@app/entity']]);

        const dict = instantiate(source, ctx, { symbols }) as
            { CanResolve(k: string): boolean; Resolve(k: string): unknown };

        assert.equal(dict.CanResolve('mm:foo'), true);
        assert.ok(dict.Resolve('mm:foo') instanceof DataTemplate);
    });
});
