import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { RelayCommand } from '../../runtime/index.js';
import { Border } from '../../basic/border.js';
import { TextBlock } from '../../basic/text-block.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { SplitButton } from '../split-button.js';

describe('SplitButton defaults', () => {

    test('Content / Command / MenuContent default to undefined; IsOpen=false', () => {
        initTestApp();
        const sb = new SplitButton();
        assert.equal(sb.Content,     undefined);
        assert.equal(sb.Command,     undefined);
        assert.equal(sb.MenuContent, undefined);
        assert.equal(sb.IsOpen,      false);
    });
});

describe('SplitButton popup mount/unmount', () => {

    test('IsOpen → true mounts MenuContent on the OverlayLayer', () => {
        initTestApp();
        const sb = new SplitButton();
        sb.Content     = new TextBlock('Send');
        sb.MenuContent = new Border();
        const target = new HeadlessTarget(400, 200);
        target.Content = sb;
        target.Flush();

        assert.equal(target.OverlayRoot, undefined,
            'overlay starts unmounted while IsOpen=false');

        sb.IsOpen = true;
        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined, 'overlay mounts on IsOpen=true');
        const children = (overlay as unknown as { Children: { Count: number } }).Children;
        // Two visuals: the scrim + the popup host.
        assert.equal(children.Count, 2);
    });

    test('IsOpen → false detaches both popup host and scrim', () => {
        initTestApp();
        const sb = new SplitButton();
        sb.Content     = new TextBlock('Send');
        sb.MenuContent = new Border();
        const target = new HeadlessTarget(400, 200);
        target.Content = sb;
        target.Flush();

        sb.IsOpen = true;
        sb.IsOpen = false;
        const overlay = target.OverlayRoot as Border | undefined;
        const childrenCount = (overlay as unknown as { Children?: { Count: number } } | undefined)
            ?.Children?.Count ?? 0;
        assert.equal(childrenCount, 0, 'popup + scrim both detached');
    });

    test('IsOpen=true with no MenuContent skips the mount (no-op safe)', () => {
        initTestApp();
        const sb = new SplitButton();
        sb.Content = new TextBlock('Send');
        const target = new HeadlessTarget(400, 200);
        target.Content = sb;
        target.Flush();

        sb.IsOpen = true;
        // No MenuContent → mountPopup returns early. OverlayRoot
        // remains undefined.
        assert.equal(target.OverlayRoot, undefined);
    });
});

describe('SplitButton Command wiring', () => {

    test('Command + CommandParameter round-trip through the DPs', () => {
        initTestApp();
        const sb = new SplitButton();
        let invokedWith: unknown = undefined;
        sb.Command = new RelayCommand((p) => { invokedWith = p; });
        sb.CommandParameter = 'foo';

        // Fire the command directly through the public API since the
        // primary Button click depends on the template being applied
        // (which a Headless test against a constructor-only instance
        // doesn't materialise without a target). The DP wiring is the
        // novel surface; the listener that calls cmd.Execute is one
        // line and covered by the demo.
        const cmd = sb.Command!;
        if (cmd.CanExecute(sb.CommandParameter))
        {
            cmd.Execute(sb.CommandParameter);
        }
        assert.equal(invokedWith, 'foo');
    });
});
