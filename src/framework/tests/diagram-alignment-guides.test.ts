import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    MetaData,
    Model,
    ObservableCollection,
    Rect,
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

class FigureVM extends Model {
    public static readonly LeftKey   = Model.RegisterProperty<number>(FigureVM, 'Left',   0,  MetaData.None);
    public static readonly TopKey    = Model.RegisterProperty<number>(FigureVM, 'Top',    0,  MetaData.None);
    public static readonly WidthKey  = Model.RegisterProperty<number>(FigureVM, 'Width',  10, MetaData.None);
    public static readonly HeightKey = Model.RegisterProperty<number>(FigureVM, 'Height', 10, MetaData.None);
    constructor(left: number, top: number, w: number = 10, h: number = 10) {
        super();
        this.set_property_value(FigureVM.LeftKey,   left);
        this.set_property_value(FigureVM.TopKey,    top);
        this.set_property_value(FigureVM.WidthKey,  w);
        this.set_property_value(FigureVM.HeightKey, h);
    }
    public get Left():   number { return this.get_property_value(FigureVM.LeftKey); }
    public get Top():    number { return this.get_property_value(FigureVM.TopKey); }
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
        new Setter(Figure, 'Left', new SetterFactory((t: Visual) => DataContextBinding(t, 'Left'))),
        new Setter(Figure, 'Top',  new SetterFactory((t: Visual) => DataContextBinding(t, 'Top'))),
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

describe('Diagram — alignment guides DP surface', () => {

    test('AlignmentGuidesEnabled defaults to false', () => {
        const { diagram } = setup([]);
        assert.equal(diagram.AlignmentGuidesEnabled, false);
    });

    test('AlignmentGuides defaults to an empty (frozen) array', () => {
        const { diagram } = setup([]);
        const guides = diagram.AlignmentGuides;
        assert.equal(Array.isArray(guides), true);
        assert.equal(guides.length, 0);
    });

    test('flipping AlignmentGuidesEnabled = true installs PositionSnap', () => {
        const { diagram } = setup([]);
        assert.equal(diagram.PositionSnap, undefined, 'precondition: no snap before enable');
        diagram.AlignmentGuidesEnabled = true;
        assert.notEqual(diagram.PositionSnap, undefined, 'PositionSnap installed by the behavior');
    });

    test('flipping AlignmentGuidesEnabled = false restores prior PositionSnap', () => {
        const { diagram } = setup([]);
        const customSnap = (r: Rect): Rect => r;
        diagram.PositionSnap = customSnap;

        diagram.AlignmentGuidesEnabled = true;
        assert.notEqual(diagram.PositionSnap, customSnap, 'behavior overrides snap while enabled');

        diagram.AlignmentGuidesEnabled = false;
        assert.equal(diagram.PositionSnap, customSnap, 'prior snap restored on disable');
    });

    test('re-enabling after disable installs a fresh PositionSnap', () => {
        const { diagram } = setup([]);
        diagram.AlignmentGuidesEnabled = true;
        const firstSnap = diagram.PositionSnap;
        diagram.AlignmentGuidesEnabled = false;
        diagram.AlignmentGuidesEnabled = true;
        assert.notEqual(diagram.PositionSnap, undefined);
        assert.notEqual(diagram.PositionSnap, firstSnap, 'fresh attach yields a fresh snap closure');
    });

    test('AlignmentGuides is read-only — direct set_property_value throws', () => {
        const { diagram } = setup([]);
        assert.throws(
            () => diagram.set_property_value(Diagram.AlignmentGuidesKey, [] as never),
            /read-only/i,
            'public set_property_value must reject the read-only key',
        );
    });

    test('AlignmentGuides can be written by the framework via the privileged path', () => {
        // _setAlignmentGuides exposes the privileged write so the
        // behavior can drive the DP. Same path AlignmentGuidesBehavior
        // uses on PointerMove.
        const { diagram } = setup([]);
        const synthetic = [
            { axis: 'x' as const, position: 100, movingEdge: 'min' as const, otherEdge: 'min' as const, otherRect: new Rect(0, 0, 10, 10) },
        ];
        diagram._setAlignmentGuides(synthetic);
        assert.equal(diagram.AlignmentGuides.length, 1);
        assert.equal(diagram.AlignmentGuides[0].position, 100);
    });
});
