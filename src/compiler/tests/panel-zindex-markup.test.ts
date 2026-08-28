import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';

describe('compile — Panel.ZIndex attached property', () => {
    test('Panel.ZIndex = N on a child emits set_property_value(Panel.ZIndexKey, N)', () => {
        const js = compile(`
            Application{ resources: {
                Canvas x:root {
                    Border [ Panel.ZIndex = 5 ]
                }
            } }
        `).js;
        // Attached-property setter resolves generically through emitSetDP.
        assert.match(js, /set_property_value\(Panel\.ZIndexKey, 5\)/);
        // Panel is imported so the emitted key reference resolves.
        assert.match(js, /\bPanel\b/);
    });
});
