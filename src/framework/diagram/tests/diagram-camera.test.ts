import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Diagram } from '../diagram.js';

describe('Diagram camera', () => {
    beforeEach(() => { initTestApp(); });

    test('exposes an identity camera by default', () => {
        const d = new Diagram();
        assert.equal(d.Zoom, 1);
        assert.equal(d.PanX, 0);
        assert.equal(d.PanY, 0);
    });

    test('SetCamera clamps zoom to the interactive range and updates DPs', () => {
        const d = new Diagram();
        d.SetCamera({ zoom: 99, panX: 12, panY: 34 });
        assert.equal(d.Zoom, 4);      // CAMERA_MAX
        assert.equal(d.PanX, 12);
        assert.equal(d.PanY, 34);
    });

    test('camera DPs drive PART_Camera.RenderTransform matrix', () => {
        const d = new Diagram();
        d.SetCamera({ zoom: 2, panX: 30, panY: 50 });
        const host = d.GetTemplateChild('PART_Camera');
        const m = host?.RenderTransform?.Matrix;
        assert.ok(m !== undefined, 'PART_Camera has a RenderTransform');
        assert.equal(m!.M11, 2);        // scale x
        assert.equal(m!.OffsetX, 30);   // pan x
        assert.equal(m!.OffsetY, 50);
    });
});
