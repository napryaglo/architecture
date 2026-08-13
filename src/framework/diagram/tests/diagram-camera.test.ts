import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Rect } from '../../../visual-engine/primitives.js';
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

    test('ZoomIn/ZoomOut about the viewport center round-trip; ResetZoom → identity', () => {
        const d = new Diagram();
        d._testViewport(500, 300);
        d.SetCamera({ zoom: 1, panX: 0, panY: 0 });
        d.ZoomIn();
        assert.ok(d.Zoom > 1);
        d.ZoomOut();
        assert.ok(Math.abs(d.Zoom - 1) < 1e-9);
        assert.ok(Math.abs(d.PanX) < 1e-9);
        assert.ok(Math.abs(d.PanY) < 1e-9);
        d.SetCamera({ zoom: 2, panX: 10, panY: 20 });
        d.ResetZoom();
        assert.equal(d.Zoom, 1);
        assert.equal(d.PanX, 0);
        assert.equal(d.PanY, 0);
    });

    test('Fit frames the content bounds into the viewport', () => {
        const d = new Diagram();
        d._testViewport(500, 300);
        d._testContent(new Rect(0, 0, 100, 100));   // 100x100 content
        d.Fit();
        // limiting axis is height: (300-48)/100 = 2.52
        assert.ok(Math.abs(d.Zoom - Math.min((500 - 48) / 100, (300 - 48) / 100)) < 1e-9);
    });

    test('zoom commands are present for the overlay + host keyboard to bind', () => {
        const d = new Diagram();
        assert.ok(d.ZoomInCommand !== undefined);
        assert.ok(d.ZoomOutCommand !== undefined);
        assert.ok(d.ResetZoomCommand !== undefined);
        assert.ok(d.FitCommand !== undefined);
        assert.ok(d.FitToSelectionCommand !== undefined);
    });
});
