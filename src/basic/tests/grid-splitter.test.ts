import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';

import { Application, HorizontalAlignment, NoModifiers, PointerButton, Rect, Size, VerticalAlignment, type PointerEventInit } from '../../runtime/index.js';
import { InputManager } from '../../framework/index.js';;
import {
    ColumnDefinition,
    Grid,
    GridLength,
    RowDefinition,
} from '../panels/grid.js';
import { GridSplitter } from '../grid-splitter.js';

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

// Build a 3-column Grid (Star, Pixel(8) splitter, Star) at the given
// total width. Returns the Grid and the splitter at column 1.
function gridWith3Cols(totalWidth: number,
                       colA: GridLength = new GridLength(1, 'star'),
                       colB: GridLength = new GridLength(1, 'star')): { grid: Grid; splitter: GridSplitter; defA: ColumnDefinition; defB: ColumnDefinition }
{
    const grid = new Grid();
    const defA = new ColumnDefinition(); defA.Width = colA;
    const defM = new ColumnDefinition(); defM.Width = new GridLength(8, 'pixel');
    const defB = new ColumnDefinition(); defB.Width = colB;
    grid.ColumnDefinitions.Add(defA);
    grid.ColumnDefinitions.Add(defM);
    grid.ColumnDefinitions.Add(defB);
    const splitter = new GridSplitter();
    Grid.SetColumn(splitter, 1);
    grid.AddChild(splitter);
    grid.Measure(new Size(totalWidth, 100));
    grid.Arrange(new Rect(0, 0, totalWidth, 100));
    return { grid, splitter, defA, defB };
}

function gridWith3Rows(totalHeight: number): { grid: Grid; splitter: GridSplitter; defA: RowDefinition; defB: RowDefinition }
{
    const grid = new Grid();
    const defA = new RowDefinition(); defA.Height = new GridLength(1, 'star');
    const defM = new RowDefinition(); defM.Height = new GridLength(8, 'pixel');
    const defB = new RowDefinition(); defB.Height = new GridLength(1, 'star');
    grid.RowDefinitions.Add(defA);
    grid.RowDefinitions.Add(defM);
    grid.RowDefinitions.Add(defB);
    const splitter = new GridSplitter();
    splitter.ResizeDirection = 'Rows';
    Grid.SetRow(splitter, 1);
    grid.AddChild(splitter);
    grid.Measure(new Size(100, totalHeight));
    grid.Arrange(new Rect(0, 0, 100, totalHeight));
    return { grid, splitter, defA, defB };
}

describe('GridSplitter — defaults', () => {
    beforeEach(() => { initTestApp(); });

    test('default DPs', () => {
        const s = new GridSplitter();
        assert.equal(s.ResizeDirection, 'Auto');
        assert.equal(s.ResizeBehavior,  'BasedOnAlignment');
        assert.equal(s.ShowsPreview,    false);
        assert.equal(s.DragIncrement,   1);
        assert.equal(s.KeyboardIncrement, 10);
    });

    test('ResizeDirection=Columns sets ew-resize cursor', () => {
        const s = new GridSplitter();
        s.ResizeDirection = 'Columns';
        assert.equal(s.Cursor, 'ew-resize');
    });

    test('ResizeDirection=Rows sets ns-resize cursor', () => {
        const s = new GridSplitter();
        s.ResizeDirection = 'Rows';
        assert.equal(s.Cursor, 'ns-resize');
    });
});

describe('GridSplitter — track resolution', () => {
    beforeEach(() => { initTestApp(); });

    test('column splitter with default HorizontalAlignment=Stretch resolves to PreviousAndNext', () => {
        const { grid, splitter, defA, defB } = gridWith3Cols(208);
        // Total = 208, splitter cell = 8 → columns A and B share 200, each = 100.
        assert.equal(grid.GetColumnWidth(0), 100);
        assert.equal(grid.GetColumnWidth(2), 100);

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 104, HostY: 50 }));
        // Drag right by 20 → A=120, B=80 (sum preserved, both still Star).
        im.InjectPointerMove(splitter, pointer({ HostX: 124, HostY: 50 }));
        im.InjectPointerUp(splitter,   pointer({ HostX: 124, HostY: 50 }));

        grid.Measure(new Size(208, 100));
        grid.Arrange(new Rect(0, 0, 208, 100));
        assert.equal(grid.GetColumnWidth(0), 120, 'A widened by 20');
        assert.equal(grid.GetColumnWidth(2), 80,  'B shrunk by 20');
        // Both ended up Star (sum preserved).
        assert.equal(defA.Width.UnitType, 'star');
        assert.equal(defB.Width.UnitType, 'star');
        assert.ok(Math.abs((defA.Width.Value + defB.Width.Value) - 2) < 1e-9,
            'total star sum preserved');
    });

    test('column splitter with HorizontalAlignment=Left resolves to PreviousAndCurrent', () => {
        const { grid, splitter, defA } = gridWith3Cols(208);
        splitter.HorizontalAlignment = HorizontalAlignment.Left;
        // Left alignment → splitter resizes its own cell (the 8px one)
        // against the previous (col 0). Drag right grows the previous,
        // shrinks the splitter's own track.
        const startSplitterWidth = grid.GetColumnWidth(1);
        const startA = grid.GetColumnWidth(0);

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 100, HostY: 50 }));
        im.InjectPointerMove(splitter, pointer({ HostX: 105, HostY: 50 }));
        im.InjectPointerUp(splitter,   pointer({ HostX: 105, HostY: 50 }));

        grid.Measure(new Size(208, 100));
        grid.Arrange(new Rect(0, 0, 208, 100));
        // A is Star, splitter's own cell is Pixel → mixed → both become Pixel.
        // A widens by 5, splitter cell shrinks by 5.
        assert.equal(defA.Width.UnitType, 'pixel');
        assert.equal(defA.Width.Value, startA + 5);
        const newSplitterWidth = grid.GetColumnWidth(1);
        assert.equal(newSplitterWidth, startSplitterWidth - 5);
    });
});

describe('GridSplitter — track-length policy', () => {
    beforeEach(() => { initTestApp(); });

    test('Pixel + Pixel → write pixel values', () => {
        const { grid, splitter, defA, defB } = gridWith3Cols(208,
            new GridLength(100, 'pixel'),
            new GridLength(100, 'pixel'));

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 104, HostY: 50 }));
        im.InjectPointerMove(splitter, pointer({ HostX: 124, HostY: 50 }));
        im.InjectPointerUp(splitter,   pointer({ HostX: 124, HostY: 50 }));

        assert.equal(defA.Width.UnitType, 'pixel');
        assert.equal(defA.Width.Value, 120);
        assert.equal(defB.Width.UnitType, 'pixel');
        assert.equal(defB.Width.Value, 80);
    });

    test('Star + Pixel → convert to Pixel (mixed policy)', () => {
        const { grid, splitter, defA, defB } = gridWith3Cols(208,
            new GridLength(1, 'star'),
            new GridLength(100, 'pixel'));

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 104, HostY: 50 }));
        im.InjectPointerMove(splitter, pointer({ HostX: 114, HostY: 50 }));
        im.InjectPointerUp(splitter,   pointer({ HostX: 114, HostY: 50 }));

        assert.equal(defA.Width.UnitType, 'pixel');
        assert.equal(defB.Width.UnitType, 'pixel');
    });
});

describe('GridSplitter — Min/Max clamping', () => {
    beforeEach(() => { initTestApp(); });

    test('drag that would shrink B below MinWidth clamps the delta', () => {
        const { grid, splitter, defA, defB } = gridWith3Cols(208,
            new GridLength(1, 'star'),
            new GridLength(1, 'star'));
        defB.MinWidth = 70;     // B starts at 100; allow shrink to 70 (delta cap = 30).

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 104, HostY: 50 }));
        // Try to drag right by 60 — should clamp to 30.
        im.InjectPointerMove(splitter, pointer({ HostX: 164, HostY: 50 }));
        im.InjectPointerUp(splitter,   pointer({ HostX: 164, HostY: 50 }));

        grid.Measure(new Size(208, 100));
        grid.Arrange(new Rect(0, 0, 208, 100));
        assert.equal(grid.GetColumnWidth(2), 70, 'B clamped at MinWidth');
        assert.equal(grid.GetColumnWidth(0), 130, 'A capped to keep total fixed');
    });
});

describe('GridSplitter — row mode (Auto direction picks up "Rows")', () => {
    beforeEach(() => { initTestApp(); });

    test('row splitter resizes adjacent row tracks on vertical drag', () => {
        const { grid, splitter, defA, defB } = gridWith3Rows(208);
        assert.equal(grid.GetRowHeight(0), 100);
        assert.equal(grid.GetRowHeight(2), 100);

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 50, HostY: 104 }));
        im.InjectPointerMove(splitter, pointer({ HostX: 50, HostY: 124 }));
        im.InjectPointerUp(splitter,   pointer({ HostX: 50, HostY: 124 }));

        grid.Measure(new Size(100, 208));
        grid.Arrange(new Rect(0, 0, 100, 208));
        assert.equal(grid.GetRowHeight(0), 120);
        assert.equal(grid.GetRowHeight(2), 80);
        void defA; void defB;
    });
});

describe('GridSplitter — ShowsPreview defers commit', () => {
    beforeEach(() => { initTestApp(); });

    test('ShowsPreview=true does NOT mutate column widths during the drag', () => {
        const { grid, splitter, defA, defB } = gridWith3Cols(208);
        splitter.ShowsPreview = true;

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 104, HostY: 50 }));
        im.InjectPointerMove(splitter, pointer({ HostX: 124, HostY: 50 }));
        // Mid-drag: GridLengths must NOT have changed yet (still Star/Star with original values).
        assert.equal(defA.Width.UnitType, 'star');
        assert.equal(defA.Width.Value, 1);
        assert.equal(defB.Width.UnitType, 'star');
        assert.equal(defB.Width.Value, 1);

        im.InjectPointerUp(splitter, pointer({ HostX: 124, HostY: 50 }));
        grid.Measure(new Size(208, 100));
        grid.Arrange(new Rect(0, 0, 208, 100));
        // After release: widths updated.
        assert.equal(grid.GetColumnWidth(0), 120);
        assert.equal(grid.GetColumnWidth(2), 80);
    });

    test('Escape during a ShowsPreview drag rolls back — no widths change', () => {
        const { grid, splitter, defA, defB } = gridWith3Cols(208);
        splitter.ShowsPreview = true;

        const im = new InputManager();
        im.InjectPointerDown(splitter, pointer({ HostX: 104, HostY: 50 }));
        im.InjectPointerMove(splitter, pointer({ HostX: 124, HostY: 50 }));
        im.SetFocus(splitter);
        im.InjectKeyDown({ Key: 'Escape', Code: 'Escape', Modifiers: NoModifiers, IsRepeat: false });

        grid.Measure(new Size(208, 100));
        grid.Arrange(new Rect(0, 0, 208, 100));
        // Original widths preserved.
        assert.equal(grid.GetColumnWidth(0), 100);
        assert.equal(grid.GetColumnWidth(2), 100);
        assert.equal(defA.Width.Value, 1);
        assert.equal(defB.Width.Value, 1);
    });
});

describe('GridSplitter — keyboard nudges', () => {
    beforeEach(() => { initTestApp(); });

    test('ArrowRight on a column splitter nudges by KeyboardIncrement', () => {
        const { grid, splitter } = gridWith3Cols(208);
        splitter.KeyboardIncrement = 5;

        const im = new InputManager();
        im.SetFocus(splitter);
        im.InjectKeyDown({ Key: 'ArrowRight', Code: 'ArrowRight', Modifiers: NoModifiers, IsRepeat: false });

        grid.Measure(new Size(208, 100));
        grid.Arrange(new Rect(0, 0, 208, 100));
        assert.equal(grid.GetColumnWidth(0), 105);
        assert.equal(grid.GetColumnWidth(2), 95);
    });

    test('ArrowUp on a column splitter is a no-op (wrong-axis arrow)', () => {
        const { grid, splitter } = gridWith3Cols(208);

        const im = new InputManager();
        im.SetFocus(splitter);
        im.InjectKeyDown({ Key: 'ArrowUp', Code: 'ArrowUp', Modifiers: NoModifiers, IsRepeat: false });

        // Vertical arrow on a horizontal-resize splitter doesn't change anything.
        assert.equal(grid.GetColumnWidth(0), 100);
        assert.equal(grid.GetColumnWidth(2), 100);
    });
});

void VerticalAlignment;
