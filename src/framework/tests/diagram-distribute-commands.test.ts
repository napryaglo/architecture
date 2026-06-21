import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    MetaData,
    Model,
    ObservableCollection,
    RelayCommand,
    SetterFactory,
    Setter,
    Size,
    Style,
    Visual,
    DataContextBinding,
    type MountableTarget,
} from '../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate } from '../../basic/index.js';
import { Diagram } from '../diagram/diagram.js';
import { Figure } from '../diagram/figure.js';
import { SelectionMode } from '../list/list-box.js';
import {
    distributeHorizontal,
    distributeVertical,
    type DistributeTarget,
} from '../diagram/commands/distribute.js';

// ── Pure-math tests ─────────────────────────────────────────────────

function mkTarget(x: number, y: number, w: number, h: number): DistributeTarget {
    return { X: x, Y: y, Width: w, Height: h };
}

describe('commands/distribute.ts — pure helpers', () => {

    test('distributeHorizontal — 3 same-width shapes get equal gaps', () => {
        // Bbox: leftmost X=0 width=10, rightmost X=80 width=10 → totalSpan=90,
        // widthSum=30, gap = (90 - 30) / 2 = 30.
        // Middle shape lands at 0+10+30=40.
        const a = mkTarget( 0, 0, 10, 10);
        const b = mkTarget(20, 0, 10, 10);  // any starting X — gets repositioned
        const c = mkTarget(80, 0, 10, 10);
        distributeHorizontal([a, b, c]);
        assert.equal(a.X,  0);
        assert.equal(b.X, 40);
        assert.equal(c.X, 80);
    });

    test('distributeHorizontal — variable widths produce equal edge-gaps', () => {
        // a: 10 wide, c: 20 wide. Bbox: X=0..100. totalSpan=100. widthSum =
        // 10 + b.Width + 20. With b.Width=20: widthSum=50, gap=(100-50)/2 = 25.
        // Middle (b) lands at 0+10+25=35.
        const a = mkTarget(  0, 0, 10, 10);
        const b = mkTarget( 50, 0, 20, 10);
        const c = mkTarget( 80, 0, 20, 10);
        distributeHorizontal([a, b, c]);
        assert.equal(a.X,  0);
        assert.equal(b.X, 35);
        assert.equal(c.X, 80);
    });

    test('distributeHorizontal — input order does not affect result', () => {
        // Same 3 shapes, scrambled. Sort-by-X internally → identical result.
        const a = mkTarget( 0, 0, 10, 10);
        const b = mkTarget(80, 0, 10, 10);
        const c = mkTarget(20, 0, 10, 10);
        distributeHorizontal([b, c, a]);   // scrambled order
        assert.equal(a.X,  0);
        assert.equal(c.X, 40);   // c is the middle by sort (X=20→40)
        assert.equal(b.X, 80);
    });

    test('distributeVertical — 3 same-height shapes get equal gaps', () => {
        const a = mkTarget(0,  0, 10, 10);
        const b = mkTarget(0, 30, 10, 10);
        const c = mkTarget(0, 80, 10, 10);
        distributeVertical([a, b, c]);
        assert.equal(a.Y,  0);
        assert.equal(b.Y, 40);
        assert.equal(c.Y, 80);
    });

    test('distribute helpers no-op on < 3 items', () => {
        const a = mkTarget(0, 0, 10, 10);
        const b = mkTarget(50, 0, 10, 10);
        const snapshotA = { ...a };
        const snapshotB = { ...b };
        distributeHorizontal([a, b]);
        assert.deepEqual(a, snapshotA);
        assert.deepEqual(b, snapshotB);
        distributeHorizontal([a]);  // 1-item: no throw
        distributeHorizontal([]);   // 0-item: no throw
    });
});

// ── Diagram integration ─────────────────────────────────────────────

class FigureVM extends Model {
    public static readonly XKey      = Model.RegisterProperty<number>(FigureVM, 'X',      0,  MetaData.None);
    public static readonly YKey      = Model.RegisterProperty<number>(FigureVM, 'Y',      0,  MetaData.None);
    public static readonly WidthKey  = Model.RegisterProperty<number>(FigureVM, 'Width',  10, MetaData.None);
    public static readonly HeightKey = Model.RegisterProperty<number>(FigureVM, 'Height', 10, MetaData.None);
    constructor(x: number, y: number, w: number = 10, h: number = 10) {
        super();
        this.set_property_value(FigureVM.XKey,      x);
        this.set_property_value(FigureVM.YKey,      y);
        this.set_property_value(FigureVM.WidthKey,  w);
        this.set_property_value(FigureVM.HeightKey, h);
    }
    public get X():      number  { return this.get_property_value(FigureVM.XKey); }
    public set X(v: number)      { this.set_property_value(FigureVM.XKey, v); }
    public get Y():      number  { return this.get_property_value(FigureVM.YKey); }
    public set Y(v: number)      { this.set_property_value(FigureVM.YKey, v); }
    public get Width():  number  { return this.get_property_value(FigureVM.WidthKey); }
    public get Height(): number  { return this.get_property_value(FigureVM.HeightKey); }
}

class FakeTarget implements MountableTarget {
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void { /* noop */ }
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

function setup(items: FigureVM[]): { diagram: Diagram } {
    Application.current = null;
    new Application();
    const coll = new ObservableCollection<FigureVM>();
    for (const i of items) coll.Add(i);
    const diagram = new Diagram();
    diagram.SelectionMode = SelectionMode.Extended;
    diagram.ItemsPanel    = new ItemsPanelTemplate(() => new Canvas());
    const style = new Style(Figure, [
        new Setter(Figure, 'X', new SetterFactory((t: Visual) => DataContextBinding(t, 'X'))),
        new Setter(Figure, 'Y', new SetterFactory((t: Visual) => DataContextBinding(t, 'Y'))),
    ], undefined, [], []);
    diagram.ItemContainerStyle = style;
    diagram.ItemsSource = coll;
    const surface = new Border();
    (surface as unknown as { Child: Visual }).Child = diagram;
    const target = new FakeTarget();
    target.Content = surface;
    (surface as Visual).Measure(new Size(800, 600));
    (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
    return { diagram };
}

function cont(diagram: Diagram, item: unknown): Figure {
    const gen = (diagram as unknown as { _generator: { ContainerFromItem(item: unknown): Visual | undefined } })._generator;
    const c = gen.ContainerFromItem(item);
    assert.ok(c instanceof Figure, 'container should be Figure');
    return c;
}

function selectMany(diagram: Diagram, items: unknown[]): void {
    for (let i = 0; i < items.length; i++) {
        const c = cont(diagram, items[i]);
        const mods = i === 0
            ? { Control: false, Shift: false, Alt: false, Meta: false }
            : { Control: true,  Shift: false, Alt: false, Meta: false };
        diagram.HandleContainerClick(c, mods);
    }
}

describe('Diagram — DiagramCommands.DistributeXxx', () => {

    test('default commands installed at construction', () => {
        const { diagram } = setup([]);
        assert.ok(diagram.DistributeHorizontalCommand instanceof RelayCommand);
        assert.ok(diagram.DistributeVerticalCommand   instanceof RelayCommand);
    });

    test('CanExecute is false with < 3 selected', () => {
        const a = new FigureVM(0, 0);
        const b = new FigureVM(50, 0);
        const { diagram } = setup([a, b]);
        selectMany(diagram, [a, b]);
        assert.equal(diagram.DistributeHorizontalCommand?.CanExecute(), false);
    });

    test('CanExecute flips true at 3 selected', () => {
        const a = new FigureVM( 0, 0);
        const b = new FigureVM(50, 0);
        const c = new FigureVM(80, 0);
        const { diagram } = setup([a, b, c]);
        selectMany(diagram, [a, b, c]);
        assert.equal(diagram.DistributeHorizontalCommand?.CanExecute(), true);
        assert.equal(diagram.DistributeVerticalCommand?.CanExecute(),   true);
    });

    test('Execute spaces inner shapes horizontally', () => {
        const a = new FigureVM( 0, 0);
        const b = new FigureVM(50, 0);
        const c = new FigureVM(80, 0);
        const { diagram } = setup([a, b, c]);
        selectMany(diagram, [a, b, c]);
        diagram.DistributeHorizontalCommand?.Execute();
        // gap = (90 - 30) / 2 = 30 → b lands at 0+10+30 = 40
        assert.equal(a.X,  0);
        assert.equal(b.X, 40);
        assert.equal(c.X, 80);
    });
});
