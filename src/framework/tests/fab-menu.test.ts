import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { AnimationManager, ManualClock, ObservableCollection, type Visual } from '../../runtime/index.js';
import { Border } from '../../basic/border.js';
import { Canvas } from '../../basic/panels/canvas.js';
import { ClickAwayScrim } from '../../basic/click-away-scrim.js';
import { TextBlock } from '../../basic/text-block.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { FabMenu } from '../buttons/fab-menu.js';

// Advance the process-global animation clock (a ManualClock by default in
// tests) so a Storyboard reaches completion deterministically — the §18.4
// replacement for waiting on wall-clock setTimeout.
function advanceAnimations(ms: number): void
{
    (AnimationManager.Instance.Clock as ManualClock).Tick(ms);
}
// Flush the microtask that Storyboard.AwaitCompleted().then(detach) queues
// on completion. setImmediate runs after all pending microtasks, so the
// detach has executed by the time this resolves.
function flushMicrotasks(): Promise<void>
{
    return new Promise<void>(resolve => setImmediate(resolve));
}

// Reach the single positioning host the FAB attaches to the OverlayLayer,
// then its [scrim, menu] children.
interface ChildHost { Children: { Count: number; Get(i: number): Visual }; }
function overlayHost(target: HeadlessTarget): ChildHost
{
    const overlay = target.OverlayRoot as unknown as ChildHost;
    return overlay.Children.Get(0) as unknown as ChildHost;
}

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

    test('IsOpen → true mounts a single positioning host (scrim + items) on the OverlayLayer', () => {
        initTestApp();
        const fm = new FabMenu();
        const items = new ObservableCollection<unknown>();
        items.Add(new Border());
        items.Add(new Border());
        fm.Items = items as unknown as ObservableCollection<Visual>;
        const target = new HeadlessTarget(400, 400);
        target.Content = fm;
        target.Flush();

        assert.equal(target.OverlayRoot, undefined);
        fm.IsOpen = true;
        const overlay = target.OverlayRoot as unknown as { Children: { Count: number } } | undefined;
        assert.ok(overlay !== undefined, 'overlay layer mounted');
        // ONE overlay child — the positioning host. Bare scrim + stack
        // attached directly would each be arranged at the full surface
        // slot and stack the items from (0,0).
        assert.equal(overlay!.Children.Count, 1);
        const host = overlayHost(target);
        // The host owns [scrim, menu].
        assert.equal(host.Children.Count, 2);
        assert.ok(host.Children.Get(0) instanceof ClickAwayScrim, 'child 0 is the dismissal scrim');
    });

    test('menu stack is positioned above the FAB, not pinned to the surface origin', () => {
        initTestApp();
        const fm = new FabMenu();
        const a = new Border(); a.Width = 56; a.Height = 56;
        const b = new Border(); b.Width = 56; b.Height = 56;
        const items = new ObservableCollection<unknown>();
        items.Add(a);
        items.Add(b);
        fm.Items = items as unknown as ObservableCollection<Visual>;

        // Place the FAB well away from the origin so the old (0,0) bug is
        // visible: a menu pinned to the top-left would be far from here.
        const canvas = new Canvas();
        Canvas.SetLeft(fm as unknown as Visual, 120);
        Canvas.SetTop(fm as unknown as Visual, 240);
        canvas.AddChild(fm as unknown as Visual);
        const target = new HeadlessTarget(400, 400);
        target.Content = canvas;
        target.Flush();

        fm.IsOpen = true;
        target.Flush();   // run layout so the overlay host arranges

        const host = overlayHost(target);
        const menu = host.Children.Get(1);
        const ar  = menu.ArrangedRect;
        const fab = (fm as unknown as Visual).ArrangedRect;   // (120, 240, w, h)
        assert.equal(fab.X, 120);
        assert.equal(fab.Y, 240);

        // Menu bottom sits exactly `Gap` (12) above the FAB top — above,
        // not at the surface origin.
        assert.ok(Math.abs((ar.Y + ar.Height) - (fab.Y - 12)) < 1,
            `menu bottom should be gap above the FAB top; got Y=${ar.Y} H=${ar.Height}`);
        // Horizontally centred on the FAB, NOT pinned to x=0.
        assert.ok(ar.X > 0, 'menu is not pinned to the left edge (the (0,0) bug)');
        assert.ok(Math.abs((ar.X + ar.Width / 2) - (fab.X + fab.Width / 2)) < 1,
            'menu is horizontally centred on the FAB');
    });

    test('reopen after close works — items are released from the old stack on teardown', async () => {
        initTestApp();
        const fm = new FabMenu();
        fm.StaggerMs  = 10;
        fm.DurationMs = 100;
        const a = new Border();
        const items = new ObservableCollection<unknown>();
        items.Add(a);
        fm.Items = items as unknown as ObservableCollection<Visual>;
        const target = new HeadlessTarget(400, 400);
        target.Content = fm;
        target.Flush();

        // open → close → advance the clock past the close storyboard →
        // teardown runs → open again must NOT throw (AttachVisual rejects
        // a still-parented child). Close totals 100ms (1 item, no stagger
        // tail); tick well past it.
        fm.IsOpen = true;
        fm.IsOpen = false;
        advanceAnimations(500);
        await flushMicrotasks();
        assert.doesNotThrow(() => { fm.IsOpen = true; });
        const host = overlayHost(target);
        assert.equal(host.Children.Count, 2, 'menu re-mounted on reopen');
    });

    test('clicking the scrim (outside the menu) dismisses', () => {
        initTestApp();
        const fm = new FabMenu();
        const items = new ObservableCollection<unknown>();
        items.Add(new Border());
        fm.Items = items as unknown as ObservableCollection<Visual>;
        const target = new HeadlessTarget(400, 400);
        target.Content = fm;
        target.Flush();

        fm.IsOpen = true;
        const scrim = overlayHost(target).Children.Get(0) as unknown as ClickAwayScrim;
        assert.ok(scrim instanceof ClickAwayScrim);
        scrim.onClick?.();
        assert.equal(fm.IsOpen, false, 'an outside click clears IsOpen');
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
        fm.IsOpen = false;
        // Overlay is still mounted until the close storyboard completes.
        const midChildren = (target.OverlayRoot as unknown as { Children?: { Count: number } } | undefined)
            ?.Children?.Count ?? 0;
        assert.equal(midChildren, 1, 'chrome persists while the close tween runs');

        advanceAnimations(500);       // past the 100ms close storyboard
        await flushMicrotasks();      // let the AwaitCompleted→detach chain run
        const afterChildren = (target.OverlayRoot as unknown as { Children?: { Count: number } } | undefined)
            ?.Children?.Count ?? 0;
        assert.equal(afterChildren, 0, 'scrim + menu host both detached on completion');
    });
});

describe('FabMenu icon rotation', () => {

    test('owned icon TextBlock carries a RotateTransform pivoted at the center', () => {
        initTestApp();
        const fm = new FabMenu();
        const items = new ObservableCollection<unknown>();
        items.Add(new Border());
        fm.Items = items as unknown as ObservableCollection<import('../../runtime/index.js').Visual>;
        const target = new HeadlessTarget(400, 400);
        target.Content = fm;
        target.Flush();
        // First IsOpen flip mounts the owned icon TextBlock.
        fm.IsOpen = true;
        const icon = fm.Content as TextBlock | undefined;
        assert.ok(icon instanceof TextBlock);
        // ClosedIcon is the persistent glyph — the open-state visual
        // comes from the 45° rotation, not a text swap.
        assert.equal(icon!.Text, '+');
        const transform = icon!.RenderTransform;
        assert.ok(transform !== undefined, 'icon should have a RenderTransform');
        const origin = icon!.RenderTransformOrigin;
        assert.equal(origin.X, 0.5);
        assert.equal(origin.Y, 0.5);
    });

    test('IsOpen=true rotates the icon toward 45°; IsOpen=false rotates back to 0°', async () => {
        initTestApp();
        const fm = new FabMenu();
        fm.RotationDurationMs = 0;   // instant — skip the tween for a deterministic assertion.
        const items = new ObservableCollection<unknown>();
        items.Add(new Border());
        fm.Items = items as unknown as ObservableCollection<import('../../runtime/index.js').Visual>;
        const target = new HeadlessTarget(400, 400);
        target.Content = fm;
        target.Flush();
        fm.IsOpen = true;
        const icon = fm.Content as TextBlock | undefined;
        const rotate = icon!.RenderTransform as { Angle: number };
        assert.equal(rotate.Angle, 45);
        fm.IsOpen = false;
        assert.equal(rotate.Angle, 0);
    });
});
