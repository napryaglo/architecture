import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { ObservableCollection } from '../../runtime/index.js';
import { Border } from '../../basic/border.js';
import { TextBlock } from '../../basic/text-block.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { FabMenu } from '../fab-menu.js';

describe('FabMenu defaults', () => {

    test('IsOpen=false; StaggerMs=50; DurationMs=200; ClosedIcon="+"; OpenIcon="×"', () => {
        initTestApp();
        const fm = new FabMenu();
        assert.equal(fm.IsOpen,      false);
        assert.equal(fm.StaggerMs,   50);
        assert.equal(fm.DurationMs,  200);
        assert.equal(fm.HiddenOffset, 12);
        assert.equal(fm.ClosedIcon,  '+');
        assert.equal(fm.OpenIcon,    '×');
    });
});

describe('FabMenu open/close lifecycle', () => {

    test('IsOpen → true mounts a scrim + items host on the OverlayLayer', () => {
        initTestApp();
        const fm = new FabMenu();
        const items = new ObservableCollection<unknown>();
        items.Add(new Border());
        items.Add(new Border());
        fm.Items = items as unknown as ObservableCollection<import('../../runtime/index.js').Visual>;
        const target = new HeadlessTarget(400, 400);
        target.Content = fm;
        target.Flush();

        assert.equal(target.OverlayRoot, undefined);
        fm.IsOpen = true;
        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined, 'overlay layer mounted');
        // Scrim + menu host = 2 children on the OverlayLayer.
        const overlayChildren = (overlay as unknown as { Children: { Count: number } }).Children;
        assert.equal(overlayChildren.Count, 2);
    });

    test('Items start with Opacity=0 + slide-down Margin on open (storyboard reveals from there)', () => {
        initTestApp();
        const fm = new FabMenu();
        const a = new Border();
        const items = new ObservableCollection<unknown>();
        items.Add(a);
        fm.Items = items as unknown as ObservableCollection<import('../../runtime/index.js').Visual>;
        const target = new HeadlessTarget(400, 400);
        target.Content = fm;
        target.Flush();

        // Pre-open: item is at its default Opacity (1).
        assert.equal(a.Opacity, 1);

        fm.IsOpen = true;
        // Open synchronously pins each item to Opacity=0 + HiddenOffset
        // margin. The storyboard tween toward Opacity=1 runs on the
        // animation clock; the synchronous side-effect is what the
        // template animates from.
        assert.equal(a.Opacity, 0, 'open pins item Opacity to 0 pre-tween');
        assert.equal(a.Margin.Top, fm.HiddenOffset, 'open pins item to slide-down Margin');
    });

    test('IsOpen → false detaches overlay after the close storyboard completes', async () => {
        initTestApp();
        const fm = new FabMenu();
        fm.StaggerMs  = 10;
        fm.DurationMs = 100;
        const items = new ObservableCollection<unknown>();
        items.Add(new Border());
        fm.Items = items as unknown as ObservableCollection<import('../../runtime/index.js').Visual>;
        const target = new HeadlessTarget(400, 400);
        target.Content = fm;
        target.Flush();

        fm.IsOpen = true;
        await new Promise<void>(r => setTimeout(r, 300));
        fm.IsOpen = false;
        await new Promise<void>(r => setTimeout(r, 300));
        const afterChildren = (target.OverlayRoot as unknown as { Children?: { Count: number } } | undefined)
            ?.Children?.Count ?? 0;
        assert.equal(afterChildren, 0, 'scrim + menu host both detached');
    });
});

describe('FabMenu icon swap', () => {

    test('Content swaps between ClosedIcon and OpenIcon based on IsOpen', () => {
        initTestApp();
        const fm = new FabMenu();
        // Trigger an initial swap so the FabMenu owns its Content TextBlock.
        const items = new ObservableCollection<unknown>();
        items.Add(new Border());
        fm.Items = items as unknown as ObservableCollection<import('../../runtime/index.js').Visual>;
        const target = new HeadlessTarget(400, 400);
        target.Content = fm;
        target.Flush();
        // No Content set yet → first open writes the open icon and tags
        // the TextBlock as class-owned.
        fm.IsOpen = true;
        const openContent = fm.Content as TextBlock | undefined;
        assert.ok(openContent instanceof TextBlock);
        assert.equal(openContent!.Text, '×');
        fm.IsOpen = false;
        const closedContent = fm.Content as TextBlock | undefined;
        assert.equal(closedContent!.Text, '+');
    });
});
