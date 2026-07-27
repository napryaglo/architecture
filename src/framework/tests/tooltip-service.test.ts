import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import {
    NoModifiers,
    PointerButton,
    type PointerEventInit,
} from '../../runtime/index.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { Rect, Size } from '../../visual-engine/primitives.js';
import { Border } from '../../basic/border.js';
import { Canvas } from '../../basic/panels/canvas.js';
import { TextBlock } from '../../basic/text-block.js';
import { InputManager } from '../input-manager.js';
import { Tooltip } from '../tooltips/tooltip.js';
import {
    PlacementMode,
    ToolTipService,
    TooltipPopupHost,
} from '../tooltips/tooltip-service.js';

function pointer(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX: 0, HostY: 0,
        Button: PointerButton.Left,
        Buttons: 1,
        Modifiers: NoModifiers,
        PointerId: 0,
        Pressure: 0,
        PointerType: 'mouse',
        ...overrides,
    };
}

// Suite teardown — the service is a process-wide singleton, so clear
// its current state between tests so a hover from the prior test doesn't
// leak into the next one's assertions.
function resetService(): void
{
    ToolTipService.dismiss();
}

describe('ToolTipService — declarative anchoring', () => {

    test('SetToolTip with undefined → defined attaches hover listeners and shows after delay', async () => {
        initTestApp();
        resetService();
        const host = new Border();
        host.Width = 60; host.Height = 40;
        const target = new HeadlessTarget(300, 200);
        target.Content = host;
        target.Flush();

        ToolTipService.SetInitialShowDelay(host, 10);
        ToolTipService.SetToolTip(host, 'Save');

        const im = new InputManager();
        im.InjectPointerMove(host, pointer({ HostX: 30, HostY: 20 }));
        assert.equal(target.OverlayRoot, undefined,
            'before the delay elapses, no overlay mounted');

        await new Promise<void>(r => setTimeout(r, 30));

        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined, 'overlay materialised after delay');
        const children = (overlay as unknown as { Children: { Get(i: number): unknown; Count: number } }).Children;
        assert.equal(children.Count, 1);
        assert.ok(children.Get(0) instanceof TooltipPopupHost,
            'overlay child is the positioner host');

        resetService();
        ToolTipService.SetToolTip(host, undefined);
    });

    test('clearing the ToolTip DP detaches listeners — subsequent hover is a no-op', async () => {
        initTestApp();
        resetService();
        const host = new Border();
        host.Width = 60; host.Height = 40;
        const target = new HeadlessTarget(300, 200);
        target.Content = host;
        target.Flush();

        ToolTipService.SetInitialShowDelay(host, 10);
        ToolTipService.SetToolTip(host, 'Save');
        // Clear before the hover fires — the service should detach
        // listeners; the later hover should never reach show().
        ToolTipService.SetToolTip(host, undefined);

        const im = new InputManager();
        im.InjectPointerMove(host, pointer({ HostX: 30, HostY: 20 }));
        await new Promise<void>(r => setTimeout(r, 30));
        assert.equal(target.OverlayRoot, undefined,
            'no listener wired → no show after clear');
    });

    test('PointerLeave cancels a pending show', async () => {
        initTestApp();
        resetService();
        const host = new Border();
        host.Width = 60; host.Height = 40;
        const target = new HeadlessTarget(300, 200);
        target.Content = host;
        target.Flush();

        ToolTipService.SetInitialShowDelay(host, 50);
        ToolTipService.SetToolTip(host, 'Save');

        const im = new InputManager();
        im.InjectPointerMove(host, pointer({ HostX: 30, HostY: 20 }));
        im.InjectPointerMove(null, pointer({ HostX: 300, HostY: 300 }));

        await new Promise<void>(r => setTimeout(r, 80));
        assert.equal(target.OverlayRoot, undefined,
            'leave before delay → no overlay materialised');
    });

    test('changing the ToolTip value while showing updates the live Content', async () => {
        initTestApp();
        resetService();
        const host = new Border();
        host.Width = 60; host.Height = 40;
        const target = new HeadlessTarget(300, 200);
        target.Content = host;
        target.Flush();

        ToolTipService.SetInitialShowDelay(host, 10);
        ToolTipService.SetToolTip(host, 'Original');

        const im = new InputManager();
        im.InjectPointerMove(host, pointer({ HostX: 30, HostY: 20 }));
        await new Promise<void>(r => setTimeout(r, 30));

        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined);
        const popupHost = (overlay as unknown as { Children: { Get(i: number): unknown } }).Children.Get(0) as TooltipPopupHost;
        const tooltip   = (popupHost as unknown as { Children: { Get(i: number): unknown } }).Children.Get(0) as Tooltip;
        assert.equal(tooltip.Content, 'Original');

        // Live update through the attached DP.
        ToolTipService.SetToolTip(host, 'Updated');
        assert.equal(tooltip.Content, 'Updated',
            'pushing a new ToolTip value mid-show flows to the pooled Tooltip\'s Content');

        resetService();
        ToolTipService.SetToolTip(host, undefined);
    });

    test('placement default = Bottom; explicit Right honored', async () => {
        initTestApp();
        resetService();
        const host = new Border();
        host.Width = 60; host.Height = 40;
        const target = new HeadlessTarget(300, 200);
        target.Content = host;
        target.Flush();

        assert.equal(ToolTipService.GetToolTipPlacement(host), PlacementMode.Bottom,
            'unset placement returns Bottom (default)');
        ToolTipService.SetToolTipPlacement(host, PlacementMode.Right);
        assert.equal(ToolTipService.GetToolTipPlacement(host), PlacementMode.Right);
    });

    test('PointerDown dismisses the active tooltip', async () => {
        initTestApp();
        resetService();
        const host = new Border();
        host.Width = 60; host.Height = 40;
        const target = new HeadlessTarget(300, 200);
        target.Content = host;
        target.Flush();

        ToolTipService.SetInitialShowDelay(host, 5);
        ToolTipService.SetToolTip(host, 'Save');

        const im = new InputManager();
        im.InjectPointerMove(host, pointer({ HostX: 30, HostY: 20 }));
        await new Promise<void>(r => setTimeout(r, 20));
        assert.ok(target.OverlayRoot !== undefined, 'tooltip up');

        // Press inside the anchor — fires PointerDown → dismiss.
        im.InjectPointerDown(host, pointer({ HostX: 30, HostY: 20 }));
        const after = target.OverlayRoot as Border | undefined;
        const count = after !== undefined
            ? (after as unknown as { Children: { Count: number } }).Children.Count
            : 0;
        assert.equal(count, 0, 'press on anchor dismisses the tooltip');
    });
});

describe('TooltipPopupHost — placement geometry', () => {

    // A wide tooltip on a small anchor at the window's top-left. Bottom
    // placement centers horizontally (x = ax + (aW - w)/2), which goes
    // NEGATIVE because the tooltip is far wider than the anchor. A horizontal
    // spill must NOT flip the vertical axis (Bottom→Top) — that used to send y
    // negative too, and the final clamp then pinned the tooltip to (0,0).
    // Regression: the flip is axis-aware; a Bottom tooltip stays below the
    // anchor and only its x is clamped on-screen.
    test('a wide tooltip on a top-left anchor sits below it, not pinned to (0,0)', () => {
        initTestApp();
        resetService();
        const target = new HeadlessTarget(300, 200);
        const canvas = new Canvas();
        const anchor = new Border();
        anchor.Width = 36; anchor.Height = 30;
        Canvas.SetLeft(anchor, 0);
        Canvas.SetTop(anchor, 0);
        canvas.AddChild(anchor);
        target.Content = canvas;
        target.Flush();

        // The host positions its single child against the anchor's frame.
        const host = new TooltipPopupHost();
        const wide = new Border();
        wide.Width = 250; wide.Height = 24;   // wider than the 36px anchor
        host.AddChild(wide);
        host.anchor    = anchor;
        host.placement = PlacementMode.Bottom;

        host.Measure(new Size(300, 200));
        host.Arrange(new Rect(0, 0, 300, 200));

        const rect = wide.ArrangedRect;
        // Bottom placement: y = anchorY(0) + anchorH(30) + ANCHOR_GAP(8) = 38.
        assert.equal(rect.Y, 38, 'stays below the anchor (no spurious vertical flip)');
        // x centered = (36 - 250)/2 = -107 → clamped onto the surface at 0.
        assert.equal(rect.X, 0, 'horizontal spill is clamped on-screen, not flipped');
    });
});

describe('ToolTipService — content shapes', () => {

    test('Content is a string → ContentPresenter wraps in TextBlock', async () => {
        initTestApp();
        resetService();
        const host = new Border();
        host.Width = 60; host.Height = 40;
        const target = new HeadlessTarget(300, 200);
        target.Content = host;
        target.Flush();

        ToolTipService.SetInitialShowDelay(host, 5);
        ToolTipService.SetToolTip(host, 'Save');

        const im = new InputManager();
        im.InjectPointerMove(host, pointer({ HostX: 30, HostY: 20 }));
        await new Promise<void>(r => setTimeout(r, 20));
        target.Flush();

        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined);
        const popupHost = (overlay as unknown as { Children: { Get(i: number): unknown } }).Children.Get(0) as TooltipPopupHost;
        const tooltip   = (popupHost as unknown as { Children: { Get(i: number): unknown } }).Children.Get(0) as Tooltip;
        assert.equal(tooltip.Content, 'Save',
            'string flows through SetToolTip → onToolTipChanged → tooltip.Content');

        resetService();
        ToolTipService.SetToolTip(host, undefined);
    });

    test('Content is a Visual → slotted directly through ContentPresenter', async () => {
        initTestApp();
        resetService();
        const host = new Border();
        host.Width = 60; host.Height = 40;
        const target = new HeadlessTarget(300, 200);
        target.Content = host;
        target.Flush();

        const richContent = new TextBlock('Rich');
        ToolTipService.SetInitialShowDelay(host, 5);
        ToolTipService.SetToolTip(host, richContent);

        const im = new InputManager();
        im.InjectPointerMove(host, pointer({ HostX: 30, HostY: 20 }));
        await new Promise<void>(r => setTimeout(r, 20));

        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined);
        const popupHost = (overlay as unknown as { Children: { Get(i: number): unknown } }).Children.Get(0) as TooltipPopupHost;
        const tooltip   = (popupHost as unknown as { Children: { Get(i: number): unknown } }).Children.Get(0) as Tooltip;
        assert.equal(tooltip.Content, richContent,
            'Visual lands on Content; ContentPresenter slots it directly');

        resetService();
        ToolTipService.SetToolTip(host, undefined);
    });
});
