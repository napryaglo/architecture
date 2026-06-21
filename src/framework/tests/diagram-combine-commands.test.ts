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
    GeometryCombineMode,
    isGeometricItem,
    type CombineRequestedArgs,
} from '../diagram/commands/combine.js';

// IFigure-shaped FigureVM with a Geometry property. Geometry's value
// is opaque to the framework (combine() is called consumer-side); a
// non-undefined value is enough for isGeometricItem to return true.
class FigureWithGeometryVM extends Model {
    public static readonly XKey         = Model.RegisterProperty<number>(FigureWithGeometryVM, 'X',        0,  MetaData.None);
    public static readonly YKey         = Model.RegisterProperty<number>(FigureWithGeometryVM, 'Y',        0,  MetaData.None);
    public static readonly WidthKey     = Model.RegisterProperty<number>(FigureWithGeometryVM, 'Width',   10, MetaData.None);
    public static readonly HeightKey    = Model.RegisterProperty<number>(FigureWithGeometryVM, 'Height',  10, MetaData.None);
    // Use a non-DP plain field for Geometry — the duck-type check looks
    // at the property, not the descriptor table. Real consumers can
    // use a DP if they want notifications; not required by the contract.
    public Geometry: unknown;
    constructor(x: number, y: number, geometry: unknown) {
        super();
        this.set_property_value(FigureWithGeometryVM.XKey, x);
        this.set_property_value(FigureWithGeometryVM.YKey, y);
        this.Geometry = geometry;
    }
}

class FigureWithoutGeometryVM extends Model {
    public static readonly XKey      = Model.RegisterProperty<number>(FigureWithoutGeometryVM, 'X',      0,  MetaData.None);
    public static readonly YKey      = Model.RegisterProperty<number>(FigureWithoutGeometryVM, 'Y',      0,  MetaData.None);
    public static readonly WidthKey  = Model.RegisterProperty<number>(FigureWithoutGeometryVM, 'Width',  10, MetaData.None);
    public static readonly HeightKey = Model.RegisterProperty<number>(FigureWithoutGeometryVM, 'Height', 10, MetaData.None);
}

class FakeTarget implements MountableTarget {
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void { /* noop */ }
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

function setup(items: Model[]): { diagram: Diagram } {
    Application.current = null;
    new Application();
    const coll = new ObservableCollection<Model>();
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

describe('commands/combine.ts — isGeometricItem', () => {

    test('returns true for Model with non-undefined Geometry', () => {
        const v = new FigureWithGeometryVM(0, 0, { /* opaque geometry */ });
        assert.equal(isGeometricItem(v), true);
    });

    test('returns false for Model without Geometry', () => {
        const v = new FigureWithoutGeometryVM();
        assert.equal(isGeometricItem(v), false);
    });

    test('returns false for non-Model values', () => {
        assert.equal(isGeometricItem(undefined), false);
        assert.equal(isGeometricItem(null),      false);
        assert.equal(isGeometricItem('string'),  false);
        assert.equal(isGeometricItem({ Geometry: {} }), false, 'plain object is not a Model');
    });
});

describe('Diagram — DiagramCommands.CombineXxx', () => {

    test('all 4 combine commands installed at construction', () => {
        const { diagram } = setup([]);
        assert.ok(diagram.CombineUnionCommand     instanceof RelayCommand);
        assert.ok(diagram.CombineIntersectCommand instanceof RelayCommand);
        assert.ok(diagram.CombineSubtractCommand  instanceof RelayCommand);
        assert.ok(diagram.CombineExcludeCommand   instanceof RelayCommand);
    });

    test('CanExecute requires ≥ 2 geometric items selected', () => {
        const g1 = new FigureWithGeometryVM(0,  0, {});
        const g2 = new FigureWithGeometryVM(50, 0, {});
        const nonGeo = new FigureWithoutGeometryVM();
        const { diagram } = setup([g1, g2, nonGeo]);

        selectMany(diagram, [g1]);
        assert.equal(diagram.CombineUnionCommand?.CanExecute(), false, 'one geometric item');
        selectMany(diagram, [g1, nonGeo]);
        assert.equal(diagram.CombineUnionCommand?.CanExecute(), false, 'geometric + non-geometric');
        selectMany(diagram, [g1, g2]);
        assert.equal(diagram.CombineUnionCommand?.CanExecute(), true,  'two geometric items');
    });

    test('Execute fires CombineRequested with correct mode and items', () => {
        const g1 = new FigureWithGeometryVM(0,  0, { tag: 'shape1' });
        const g2 = new FigureWithGeometryVM(50, 0, { tag: 'shape2' });
        const { diagram } = setup([g1, g2]);

        const requests: CombineRequestedArgs[] = [];
        diagram.AddCombineRequestedListener(args => requests.push(args));

        selectMany(diagram, [g1, g2]);

        diagram.CombineUnionCommand?.Execute();
        diagram.CombineIntersectCommand?.Execute();
        diagram.CombineSubtractCommand?.Execute();
        diagram.CombineExcludeCommand?.Execute();

        assert.equal(requests.length, 4);
        assert.equal(requests[0].Mode, GeometryCombineMode.Union);
        assert.equal(requests[1].Mode, GeometryCombineMode.Intersect);
        // CombineSubtract → Exclude (= path difference), CombineExclude → Xor.
        // The names are inherited from the existing demo convention; the
        // important thing is each command maps to a distinct mode.
        assert.equal(requests[2].Mode, GeometryCombineMode.Exclude);
        assert.equal(requests[3].Mode, GeometryCombineMode.Xor);

        // Every request carries both selected items (filtered to geometric).
        for (const r of requests) {
            assert.equal(r.Items.length, 2);
            assert.ok(r.Items.includes(g1));
            assert.ok(r.Items.includes(g2));
        }
    });

    test('Non-geometric items in the selection are filtered out of Items', () => {
        const g1 = new FigureWithGeometryVM(0,  0, {});
        const g2 = new FigureWithGeometryVM(50, 0, {});
        const nonGeo = new FigureWithoutGeometryVM();
        const { diagram } = setup([g1, g2, nonGeo]);

        const requests: CombineRequestedArgs[] = [];
        diagram.AddCombineRequestedListener(args => requests.push(args));

        selectMany(diagram, [g1, g2, nonGeo]);
        diagram.CombineUnionCommand?.Execute();

        assert.equal(requests.length, 1);
        assert.equal(requests[0].Items.length, 2, 'non-geometric VM excluded from Items');
        assert.ok(!requests[0].Items.includes(nonGeo as never));
    });
});
