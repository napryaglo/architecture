import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { ModifierKeys, PointerButton, WheelDeltaMode, type WheelEventArgs, type PointerEventArgs } from '../../../runtime/index.js';
import { Diagram } from '../diagram.js';
import { attachZoomPan } from '../behaviors/zoom-pan-behavior.js';

// Minimal wheel arg matching the fields the handler reads.
function wheel(hostX: number, hostY: number, deltaY: number, ctrl: boolean): WheelEventArgs {
    return {
        HostX: hostX, HostY: hostY, DeltaX: 0, DeltaY: deltaY, DeltaMode: WheelDeltaMode.Pixel,
        Modifiers: ctrl ? ModifierKeys.Control : ModifierKeys.None, Handled: false,
    } as unknown as WheelEventArgs;
}
function pointer(hostX: number, hostY: number, button: PointerButton): PointerEventArgs {
    return { HostX: hostX, HostY: hostY, Button: button, Modifiers: ModifierKeys.None, Handled: false } as unknown as PointerEventArgs;
}

describe('ZoomPanBehavior', () => {
    beforeEach(() => { initTestApp(); });

    test('ctrl+wheel-up zooms in about the cursor; plain wheel pans without zooming', () => {
        const d = new Diagram();
        const detach = attachZoomPan(d);
        d.SetCamera({ zoom: 1, panX: 0, panY: 0 });

        d._dispatchWheel(wheel(100, 100, -100, true));   // ctrl + wheel-up (zoom in)
        assert.ok(d.Zoom > 1);

        const z = d.Zoom;
        d._dispatchWheel(wheel(0, 0, 120, false));       // plain wheel (pan)
        assert.equal(d.Zoom, z);                          // no zoom change
        assert.ok(Math.abs(d.PanY) > 0);                  // panned vertically
        detach();
    });

    test('detach stops the behavior reacting', () => {
        const d = new Diagram();
        const detach = attachZoomPan(d);
        detach();
        d.SetCamera({ zoom: 1, panX: 0, panY: 0 });
        d._dispatchWheel(wheel(50, 50, -100, true));
        assert.equal(d.Zoom, 1);
    });

    test('middle-drag grab-pans; other buttons do not', () => {
        const d = new Diagram();
        attachZoomPan(d);
        d.SetCamera({ zoom: 1, panX: 0, panY: 0 });
        // Non-middle press then move: no pan.
        (d as unknown as { OnPreviewPointerDown(a: PointerEventArgs): void }).OnPreviewPointerDown(pointer(10, 10, PointerButton.Primary));
        (d as unknown as { OnPreviewPointerMove(a: PointerEventArgs): void }).OnPreviewPointerMove(pointer(40, 30, PointerButton.Primary));
        assert.equal(d.PanX, 0);
        // Middle press then move by (30,20): pan by that delta.
        (d as unknown as { OnPreviewPointerDown(a: PointerEventArgs): void }).OnPreviewPointerDown(pointer(10, 10, PointerButton.Middle));
        (d as unknown as { OnPreviewPointerMove(a: PointerEventArgs): void }).OnPreviewPointerMove(pointer(40, 30, PointerButton.Middle));
        assert.equal(d.PanX, 30);
        assert.equal(d.PanY, 20);
    });

    test('CameraEnabled gates attaching the behavior', () => {
        const d = new Diagram();
        d.SetCamera({ zoom: 1, panX: 0, panY: 0 });
        // Not enabled → no handler installed → wheel does nothing.
        d._dispatchWheel(wheel(0, 0, -100, true));
        assert.equal(d.Zoom, 1);
        // Enable → attaches → wheel now zooms.
        d.CameraEnabled = true;
        d._dispatchWheel(wheel(0, 0, -100, true));
        assert.ok(d.Zoom > 1);
        // Disable → detaches → wheel inert again.
        const z = d.Zoom;
        d.CameraEnabled = false;
        d._dispatchWheel(wheel(0, 0, -100, true));
        assert.equal(d.Zoom, z);
    });
});
