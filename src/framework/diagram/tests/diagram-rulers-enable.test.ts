import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Diagram } from '../diagram.js';

describe('Diagram rulers enablement', () => {
    test('enabling RulersVisible installs a composing PositionSnap; disabling restores it', () => {
        Application.current = null; new Application();
        const d = new Diagram();
        const base = d.PositionSnap;
        d.RulersVisible = true;
        assert.notEqual(d.PositionSnap, base, 'behavior composed a snap');
        d.RulersVisible = false;
        assert.equal(d.PositionSnap, base, 'snap restored on disable');
    });
});
