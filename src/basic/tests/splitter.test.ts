import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';

import { Application, NoModifiers, PointerButton, Rect, Size, Visual, type DrawingContext, type PointerEventInit } from '../../runtime/index.js';
import { InputManager } from '../../framework/index.js';;
import { Border } from '../border.js';
import { DockPanel } from '../panels/dock-panel.js';
import { Splitter } from '../splitter.js';
import { Orientation, StackPanel } from '../panels/stack-panel.js';

function pointer(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX:       0,
        HostY:       0,
        Button:      PointerButton.Primary,
        Buttons:     1,
        Modifiers:   NoModifiers,
        PointerId:   0,
        Pressure:    0,
        PointerType: 'mouse',
        ...overrides,
    };
}

class FixedSize extends Visual
{
    constructor(w: number, h: number)
    {
        super();
        this.Width  = w;
        this.Height = h;
    }
    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }
    protected override RenderOverride(_dc: DrawingContext): void {}
}

describe('Splitter — defaults', () => {
    beforeEach(() => { initTestApp(); });

    test('default DPs', () => {
        const s = new Splitter();
        assert.equal(s.Orientation,     Orientation.Vertical);
        assert.equal(s.Cursor,          'ew-resize');
        assert.equal(s.ShowsPreview,    false);
        assert.equal(s.DragIncrement,   1);
        assert.equal(s.KeyboardIncrement, 10);
    });

    test('Orientation=Horizontal sets ns-resize cursor', () => {
        const s = new Splitter();
        s.Orientation = Orientation.Horizontal;
        assert.equal(s.Cursor, 'ns-resize');
    });
});

describe('Splitter — horizontal StackPanel resize', () => {
    beforeEach(() => { initTestApp(); });

    test('vertical splitter writes new Width to the previous sibling', () => {
        // Horizontal StackPanel: [PrevBorder(W=100), Splitter(W=8), NextBorder]
        const sp = new StackPanel();
        sp.Orientation = Orientation.Horizontal;
        const prev = new Border();
        prev.Width  = 100;
        prev.Height = 50;
        sp.AddChild(prev);
        const splitter = new Splitter();
        splitter.Width  = 8;
        splitter.Height = 50;
        sp.AddChild(splitter);
        const next = new FixedSize(80, 50);
        sp.AddChild(next);
        sp.Measure(new Size(400, 50));
        sp.Arrange(new Rect(0, 0, 400, 50));

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 104, HostY: 25 }));
        im.InjectPointerMove(splitter, pointer({ HostX: 124, HostY: 25 }));
        im.InjectPointerUp(splitter,   pointer({ HostX: 124, HostY: 25 }));

        assert.equal(prev.Width, 120, 'previous Border widened by 20');
    });

    test('drag respects DragIncrement snap', () => {
        const sp = new StackPanel();
        sp.Orientation = Orientation.Horizontal;
        const prev = new Border();
        prev.Width = 100; prev.Height = 50;
        sp.AddChild(prev);
        const splitter = new Splitter();
        splitter.Width = 8; splitter.Height = 50;
        splitter.DragIncrement = 10;
        sp.AddChild(splitter);
        sp.AddChild(new FixedSize(80, 50));
        sp.Measure(new Size(400, 50));
        sp.Arrange(new Rect(0, 0, 400, 50));

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 104, HostY: 25 }));
        // Move 17 → snaps to 20 (nearest multiple of 10).
        im.InjectPointerMove(splitter, pointer({ HostX: 121, HostY: 25 }));
        im.InjectPointerUp(splitter,   pointer({ HostX: 121, HostY: 25 }));

        assert.equal(prev.Width, 120, 'DragIncrement snapped 17 → 20');
    });

    test('No previous sibling → drag is a silent no-op', () => {
        // Splitter as the FIRST child has nothing to resize.
        const sp = new StackPanel();
        sp.Orientation = Orientation.Horizontal;
        const splitter = new Splitter();
        splitter.Width = 8; splitter.Height = 50;
        sp.AddChild(splitter);
        sp.AddChild(new FixedSize(100, 50));
        sp.Measure(new Size(400, 50));
        sp.Arrange(new Rect(0, 0, 400, 50));

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 4, HostY: 25 }));
        im.InjectPointerMove(splitter, pointer({ HostX: 24, HostY: 25 }));
        im.InjectPointerUp(splitter,   pointer({ HostX: 24, HostY: 25 }));

        // Nothing crashed. No previous sibling to widen — just verify
        // the splitter's IsDragging cleared (drag completed cleanly).
        assert.equal(splitter.IsDragging, false);
    });
});

describe('Splitter — vertical DockPanel resize', () => {
    beforeEach(() => { initTestApp(); });

    test('horizontal splitter writes new Height to the previous sibling', () => {
        const dp = new DockPanel();
        const prev = new Border();
        prev.Height = 100;
        DockPanel.SetDock(prev, 'Top');
        dp.AddChild(prev);
        const splitter = new Splitter();
        splitter.Orientation = Orientation.Horizontal;
        splitter.Height = 8;
        DockPanel.SetDock(splitter, 'Top');
        dp.AddChild(splitter);
        const filler = new FixedSize(400, 50);
        dp.AddChild(filler);
        dp.Measure(new Size(400, 400));
        dp.Arrange(new Rect(0, 0, 400, 400));

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 200, HostY: 104 }));
        im.InjectPointerMove(splitter, pointer({ HostX: 200, HostY: 130 }));
        im.InjectPointerUp(splitter,   pointer({ HostX: 200, HostY: 130 }));

        assert.equal(prev.Height, 126, 'previous Border tallened by 26');
    });
});

describe('Splitter — keyboard nudges', () => {
    beforeEach(() => { initTestApp(); });

    test('ArrowRight on a vertical splitter grows the previous sibling by KeyboardIncrement', () => {
        const sp = new StackPanel();
        sp.Orientation = Orientation.Horizontal;
        const prev = new Border();
        prev.Width = 100; prev.Height = 50;
        sp.AddChild(prev);
        const splitter = new Splitter();
        splitter.Width = 8; splitter.Height = 50;
        splitter.KeyboardIncrement = 5;
        sp.AddChild(splitter);
        sp.AddChild(new FixedSize(80, 50));
        sp.Measure(new Size(400, 50));
        sp.Arrange(new Rect(0, 0, 400, 50));

        const im = new InputManager();
        im.SetFocus(splitter);
        im.InjectKeyDown({ Key: 'ArrowRight', Code: 'ArrowRight', Modifiers: NoModifiers, IsRepeat: false });

        assert.equal(prev.Width, 105);
    });

    test('ArrowUp on a vertical splitter is a no-op (wrong-axis arrow)', () => {
        const sp = new StackPanel();
        sp.Orientation = Orientation.Horizontal;
        const prev = new Border();
        prev.Width = 100; prev.Height = 50;
        sp.AddChild(prev);
        const splitter = new Splitter();
        splitter.Width = 8; splitter.Height = 50;
        sp.AddChild(splitter);
        sp.AddChild(new FixedSize(80, 50));
        sp.Measure(new Size(400, 50));
        sp.Arrange(new Rect(0, 0, 400, 50));

        const im = new InputManager();
        im.SetFocus(splitter);
        im.InjectKeyDown({ Key: 'ArrowUp', Code: 'ArrowUp', Modifiers: NoModifiers, IsRepeat: false });

        assert.equal(prev.Width, 100, 'wrong-axis arrow ignored');
    });
});
