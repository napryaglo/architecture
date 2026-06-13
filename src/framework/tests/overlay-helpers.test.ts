import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import {
    NoModifiers,
    PointerButton,
    type PointerEventInit,
} from '../../runtime/index.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { Border } from '../../basic/border.js';
import { TextBlock } from '../../basic/text-block.js';
import { InputManager } from '../input-manager.js';
import { Tooltip } from '../tooltip.js';
import { Snackbar } from '../snackbar.js';
import { Dialog } from '../dialog.js';
import {
    attachTooltip,
    showSnackbar,
    showDialog,
} from '../overlay-helpers.js';

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

describe('attachTooltip', () => {

    test('mounts the tooltip onto the OverlayLayer after the hover delay', async () => {
        initTestApp();
        const host = new Border();
        host.Width = 50; host.Height = 50;
        const target = new HeadlessTarget(200, 200);
        target.Content = host;
        target.Flush();

        const tooltip = new Tooltip();
        tooltip.Text = 'hi';

        const detach = attachTooltip(host, tooltip, 10);
        try {
            const im = new InputManager();
            im.InjectPointerMove(host, pointer({ HostX: 25, HostY: 25 }));
            assert.equal(target.OverlayRoot, undefined,
                'before the delay elapses the tooltip stays off the overlay');
            await new Promise<void>(r => setTimeout(r, 30));
            const overlay = target.OverlayRoot as Border | undefined;
            assert.ok(overlay !== undefined, 'overlay layer mounted');
            // OverlayLayer is a Panel — the tooltip should appear among
            // its children.
            const overlayChildren = (overlay as unknown as { Children: { Get(i: number): unknown; Count: number } }).Children;
            assert.equal(overlayChildren.Count, 1, 'one tooltip attached');
            assert.equal(overlayChildren.Get(0), tooltip, 'mounted child IS the tooltip');
        } finally {
            detach();
        }
    });

    test('pointer leave cancels a pending mount', async () => {
        initTestApp();
        const host = new Border();
        host.Width = 50; host.Height = 50;
        const target = new HeadlessTarget(200, 200);
        target.Content = host;
        target.Flush();

        const tooltip = new Tooltip();
        const detach = attachTooltip(host, tooltip, 50);
        try {
            const im = new InputManager();
            im.InjectPointerMove(host, pointer({ HostX: 25, HostY: 25 }));
            // Leave before the delay fires.
            im.InjectPointerMove(null, pointer({ HostX: 200, HostY: 200 }));
            await new Promise<void>(r => setTimeout(r, 80));
            assert.equal(target.OverlayRoot, undefined,
                'leave cancels the pending mount → overlay never created');
        } finally {
            detach();
        }
    });
});

describe('showSnackbar', () => {

    test('auto-dismisses after the duration', async () => {
        initTestApp();
        const anchor = new Border();
        const target = new HeadlessTarget(200, 200);
        target.Content = anchor;
        target.Flush();

        const snackbar = new Snackbar();
        snackbar.Content = new TextBlock('Saved');

        const { dismissed } = showSnackbar(anchor, snackbar, 20);
        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined, 'snackbar mounted immediately');

        await dismissed;
        const after = (target.OverlayRoot as unknown as { Children?: { Count: number } } | undefined);
        assert.equal(after?.Children?.Count ?? 0, 0, 'snackbar detached after duration');
    });

    test('manual dismiss closes early and resolves the promise', async () => {
        initTestApp();
        const anchor = new Border();
        const target = new HeadlessTarget(200, 200);
        target.Content = anchor;
        target.Flush();

        const snackbar = new Snackbar();
        const { dismissed, dismiss } = showSnackbar(anchor, snackbar, 5000);
        dismiss();
        await dismissed;
        const after = (target.OverlayRoot as unknown as { Children?: { Count: number } } | undefined);
        assert.equal(after?.Children?.Count ?? 0, 0,
            'manual dismiss tears the snackbar down before the 5000ms timer');
    });
});

describe('showDialog', () => {

    test('mounts the dialog + scrim on the overlay and resolves the promise on close', async () => {
        initTestApp();
        const anchor = new Border();
        const target = new HeadlessTarget(200, 200);
        target.Content = anchor;
        target.Flush();

        const dialog = new Dialog();
        dialog.Title = 'Confirm';
        const scrim = new Border();

        const { closed, close } = showDialog<string>(anchor, dialog, scrim);
        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined, 'overlay layer created');
        const overlayChildren = (overlay as unknown as { Children: { Get(i: number): unknown; Count: number } }).Children;
        assert.equal(overlayChildren.Count, 2, 'scrim + dialog both attached');

        close('OK');
        const result = await closed;
        assert.equal(result, 'OK');
        const afterChildren = (target.OverlayRoot as unknown as { Children?: { Count: number } } | undefined)?.Children;
        assert.equal(afterChildren?.Count ?? 0, 0, 'dialog + scrim both detached');
    });
});
