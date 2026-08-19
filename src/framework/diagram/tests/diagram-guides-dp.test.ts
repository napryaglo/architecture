import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, AlignmentAxis } from '../../../runtime/index.js';
import { Diagram } from '../diagram.js';
import type { PersistentGuide } from '../../../runtime/index.js';

describe('Diagram guide DPs', () => {
    test('Guides defaults to empty and round-trips a set', () => {
        Application.current = null; new Application();
        const d = new Diagram();
        assert.deepEqual(d.Guides, []);
        const g: PersistentGuide[] = [{ axis: AlignmentAxis.X, position: 120, glued: [] }];
        let fired = 0;
        d.AddPropertyChangedListener(Diagram.GuidesKey, () => { fired++; });
        d.Guides = g;
        assert.equal(d.Guides.length, 1);
        assert.equal(fired, 1);
    });
    test('RulersVisible defaults false and toggles', () => {
        Application.current = null; new Application();
        const d = new Diagram();
        assert.equal(d.RulersVisible, false);
        d.RulersVisible = true;
        assert.equal(d.RulersVisible, true);
    });
});
