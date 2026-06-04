import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
    Application,
    DataObject,
    DragDrop,
    DragDropEffects,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { Border, TextBlock } from '../../Controls/index.js';
import { HtmlTarget } from '../index.js';
import { SolidColorBrush } from '../index.js';
import { Color } from '../../runtime/index.js';

// Install JSDOM globals needed by HtmlTarget. The target reads
// `window.devicePixelRatio`, calls `document.createElementNS`, and
// constructs a ResizeObserver. JSDOM doesn't ship ResizeObserver, so
// we stub it.
function makeDom(): { dom: JSDOM; host: HTMLElement; document: Document }
{
    const dom = new JSDOM(
        '<!doctype html><html><body><div id="host" style="width:400px;height:300px"></div></body></html>',
        { pretendToBeVisual: true },
    );
    const win = dom.window as unknown as Window & typeof globalThis;
    (globalThis as unknown as { window: Window }).window     = win;
    (globalThis as unknown as { document: Document }).document = win.document;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        observe():    void {}
        disconnect(): void {}
        unobserve():  void {}
    };
    // Stub clientWidth/Height so the HtmlTarget constructor can size
    // the surface — JSDOM returns 0 because it has no layout engine.
    const host = win.document.getElementById('host') as HTMLElement;
    Object.defineProperty(host, 'clientWidth',  { value: 400, configurable: true });
    Object.defineProperty(host, 'clientHeight', { value: 300, configurable: true });
    return { dom, host, document: win.document };
}

// Concrete leaf Visual that paints a small filled rect. Used as the
// drag source — gives the renderer something to stamp with
// VISUAL_BACKREF so the ghost-clone path has a real outer <g> to
// snapshot. Sized 20x20 so it shows up at any layout pass.
class TestSquare extends Visual
{
    protected override MeasureOverride(_a: Size): Size { return new Size(20, 20); }
    protected override RenderOverride(dc: DrawingContext): void
    {
        dc.DrawRectangle(
            new SolidColorBrush(Color.Red),
            undefined,
            { X: 0, Y: 0, Width: 20, Height: 20 } as never,
        );
    }
}

function resetPendingDrag(): void
{
    DragDrop._pendingSession = null;
    DragDrop._pendingOptions = {};
}

describe('HtmlTarget — drag ghost overlay (mode A)', () => {
    beforeEach(() => {
        Application.current = null;
        resetPendingDrag();
    });

    test('starting a session with preview=undefined appends a clone to the drag overlay', () => {
        const { host, document: doc } = makeDom();
        const target = new HtmlTarget(host);
        const root = new Border();
        target.Content = root;
        // Need a painted Visual so the renderer stamps VISUAL_BACKREF
        // on its outer <g> for the ghost-clone to snapshot.
        const source = new TestSquare();
        root.SetChild(source);
        target.Flush();

        DragDrop.DoDragDrop(source, new DataObject().Set('mural/node-kind', 'rect'),
            DragDropEffects.Copy);          // opts.preview undefined → mode A
        target.InputManager.PickUpPendingDragSession();
        target.OnDragSessionStarted();

        const overlay = doc.querySelector('g.mural-drag-overlay');
        assert.ok(overlay !== null, 'overlay <g> should be present');
        const ghost = overlay!.querySelector('g.mural-drag-ghost');
        assert.ok(ghost !== null, 'ghost should be appended to overlay');
        assert.equal(ghost!.getAttribute('opacity'), '0.6');
    });

    test('overlay has pointer-events=none so it does not block receiver hit-testing', () => {
        const { host, document: doc } = makeDom();
        const target = new HtmlTarget(host);
        const root = new Border();
        target.Content = root;
        const source = new TestSquare();
        root.SetChild(source);
        target.Flush();

        DragDrop.DoDragDrop(source, new DataObject(), DragDropEffects.Copy);
        target.InputManager.PickUpPendingDragSession();
        target.OnDragSessionStarted();

        const overlay = doc.querySelector('g.mural-drag-overlay')!;
        assert.equal(overlay.getAttribute('pointer-events'), 'none');
    });

    test('SetDragGhostPosition translates the ghost', () => {
        const { host, document: doc } = makeDom();
        const target = new HtmlTarget(host);
        const root = new Border();
        target.Content = root;
        const source = new TestSquare();
        root.SetChild(source);
        target.Flush();

        DragDrop.DoDragDrop(source, new DataObject(), DragDropEffects.Copy);
        target.InputManager.PickUpPendingDragSession();
        target.OnDragSessionStarted();
        target.SetDragGhostPosition(120, 80);

        const ghost = doc.querySelector('g.mural-drag-ghost') as SVGGElement;
        assert.match(ghost.getAttribute('transform') ?? '', /translate\(120,?\s*80\)/);
    });

    test('ending the session removes the ghost from the DOM', () => {
        const { host, document: doc } = makeDom();
        const target = new HtmlTarget(host);
        const root = new Border();
        target.Content = root;
        const source = new TestSquare();
        root.SetChild(source);
        target.Flush();

        DragDrop.DoDragDrop(source, new DataObject(), DragDropEffects.Copy);
        target.InputManager.PickUpPendingDragSession();
        target.OnDragSessionStarted();
        assert.ok(doc.querySelector('g.mural-drag-ghost'));

        target.OnDragSessionEnded();
        assert.equal(doc.querySelector('g.mural-drag-ghost'), null);
        assert.equal(doc.querySelector('g.mural-drag-overlay'), null);
    });

    test('mode B (preview=null) creates an overlay shell but no ghost', () => {
        const { host, document: doc } = makeDom();
        const target = new HtmlTarget(host);
        const root = new Border();
        target.Content = root;
        const source = new TestSquare();
        root.SetChild(source);
        target.Flush();

        DragDrop.DoDragDrop(source, new DataObject(), DragDropEffects.Copy,
            { preview: null });
        target.InputManager.PickUpPendingDragSession();
        target.OnDragSessionStarted();

        assert.ok(doc.querySelector('g.mural-drag-overlay'),  'overlay shell exists');
        assert.equal(doc.querySelector('g.mural-drag-ghost'), null, 'no ghost in mode B');
    });
});

describe('HtmlTarget — drag preview mode C (DataTemplate)', () => {
    beforeEach(() => {
        Application.current = null;
        resetPendingDrag();
    });

    test('opts.preview = DataTemplate instantiates the template and adds the produced Visual to the overlay', () => {
        const { host, document: doc } = makeDom();
        const target = new HtmlTarget(host);
        const root = new Border();
        target.Content = root;
        const source = new TestSquare();
        root.SetChild(source);
        target.Flush();

        // Minimal duck-typed preview matching the spec — Apply(data)
        // returns a Visual. We use TestSquare so the renderer paints a
        // <rect>; the test checks the rect makes it into the overlay
        // subtree.
        const template = { Apply: (_data: unknown): Visual => new TestSquare() };
        const data = new DataObject().Set('mural/node-kind', 'rect');

        DragDrop.DoDragDrop(source, data, DragDropEffects.Copy, { preview: template });
        target.InputManager.PickUpPendingDragSession();
        target.OnDragSessionStarted();

        const overlay = doc.querySelector('g.mural-drag-overlay');
        assert.ok(overlay !== null);
        const ghost = overlay!.querySelector('g.mural-drag-ghost');
        assert.ok(ghost !== null, 'mode C ghost wraps the preview Visual');
        const rectInOverlay = overlay!.querySelector('rect');
        assert.ok(rectInOverlay !== null, 'rendered preview content is in the overlay');
    });

    test('ending a mode-C session detaches the preview Visual from the OverlayLayer', () => {
        const { host, document: doc } = makeDom();
        const target = new HtmlTarget(host);
        const root = new Border();
        target.Content = root;
        const source = new TestSquare();
        root.SetChild(source);
        target.Flush();

        const template = { Apply: (_data: unknown): Visual => new TestSquare() };
        DragDrop.DoDragDrop(source, new DataObject(), DragDropEffects.Copy,
            { preview: template });
        target.InputManager.PickUpPendingDragSession();
        target.OnDragSessionStarted();
        assert.ok(doc.querySelector('g.mural-drag-ghost'));

        target.OnDragSessionEnded();
        assert.equal(doc.querySelector('g.mural-drag-overlay'), null);
        assert.equal(target.OverlayRoot?.visualChildren.length ?? 0, 0,
            'preview Visual detached from OverlayLayer');
    });
});

describe('HtmlTarget — cursor styling', () => {
    beforeEach(() => {
        Application.current = null;
        resetPendingDrag();
    });

    test('OnDragSessionStarted captures cursor and sets not-allowed initially', () => {
        const { host } = makeDom();
        const target = new HtmlTarget(host);
        const root = new Border();
        target.Content = root;
        const source = new TestSquare();
        root.SetChild(source);
        target.Flush();

        DragDrop.DoDragDrop(source, new DataObject(), DragDropEffects.All);
        target.InputManager.PickUpPendingDragSession();
        target.OnDragSessionStarted();
        assert.equal((host as HTMLElement).style.cursor, 'not-allowed');
    });

    test('UpdateCursorForEffect translates each Effect flag to the right CSS cursor', () => {
        const { host } = makeDom();
        const target = new HtmlTarget(host);
        const root = new Border();
        target.Content = root;
        const source = new TestSquare();
        root.SetChild(source);
        target.Flush();

        DragDrop.DoDragDrop(source, new DataObject(), DragDropEffects.All);
        target.InputManager.PickUpPendingDragSession();
        target.OnDragSessionStarted();

        target.UpdateCursorForEffect(DragDropEffects.Copy);
        assert.equal((host as HTMLElement).style.cursor, 'copy');
        target.UpdateCursorForEffect(DragDropEffects.Move);
        assert.equal((host as HTMLElement).style.cursor, 'move');
        target.UpdateCursorForEffect(DragDropEffects.Link);
        assert.equal((host as HTMLElement).style.cursor, 'alias');
        target.UpdateCursorForEffect(DragDropEffects.None);
        assert.equal((host as HTMLElement).style.cursor, 'not-allowed');
        // Combined flags — Copy wins priority.
        target.UpdateCursorForEffect(DragDropEffects.Copy | DragDropEffects.Move);
        assert.equal((host as HTMLElement).style.cursor, 'copy');
    });

    test('OnDragSessionEnded restores the captured original cursor', () => {
        const { host } = makeDom();
        const target = new HtmlTarget(host);
        const root = new Border();
        target.Content = root;
        const source = new TestSquare();
        root.SetChild(source);
        target.Flush();
        (host as HTMLElement).style.cursor = 'default';

        DragDrop.DoDragDrop(source, new DataObject(), DragDropEffects.Copy);
        target.InputManager.PickUpPendingDragSession();
        target.OnDragSessionStarted();
        target.UpdateCursorForEffect(DragDropEffects.Copy);
        assert.equal((host as HTMLElement).style.cursor, 'copy');

        target.OnDragSessionEnded();
        assert.equal((host as HTMLElement).style.cursor, 'default');
    });
});
