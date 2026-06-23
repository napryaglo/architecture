// Step 12 / § 9 of [src/document/connectors.md](../../../document/connectors.md):
// pins the two-channel selection API per § 7.3 — SelectConnector /
// DeselectConnector / IsConnectorSelected / SelectedConnectors live
// on Diagram alongside the inherited Selector's SelectedItems channel,
// and DeleteRequested fires with snapshots of both populations.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    KeyEventArgs,
    MetaData,
    Model,
    ObservableCollection,
    SetterFactory,
    Setter,
    Size,
    Style,
    Visual,
    DataContextBinding,
    type MountableTarget,
} from '../../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate } from '../../../basic/index.js';
import { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';
import { Point } from '../../../visual-engine/index.js';
import { SelectionMode } from '../../list/list-box.js';
import type { DeleteRequestedArgs } from '../commands/delete-ops.js';
import { RoutingMode } from '../routing/router.js';
import '../routing/straight-router.js';

// ── Test scaffolding ─────────────────────────────────────────────────

class LeafVM extends Model
{
    public static readonly LeftKey   = Model.RegisterProperty<number>(LeafVM, 'Left',   0, MetaData.None);
    public static readonly TopKey    = Model.RegisterProperty<number>(LeafVM, 'Top',    0, MetaData.None);
    public static readonly WidthKey  = Model.RegisterProperty<number>(LeafVM, 'Width',  80, MetaData.None);
    public static readonly HeightKey = Model.RegisterProperty<number>(LeafVM, 'Height', 80, MetaData.None);
    public static readonly IsSelectedKey = Model.RegisterProperty<boolean>(LeafVM, 'IsSelected', false, MetaData.None);
    constructor()
    {
        super();
        this.set_property_value(LeafVM.WidthKey, 80);
        this.set_property_value(LeafVM.HeightKey, 80);
    }
    public get Left(): number      { return this.get_property_value(LeafVM.LeftKey); }
    public get Top():  number      { return this.get_property_value(LeafVM.TopKey); }
    public get Width(): number     { return this.get_property_value(LeafVM.WidthKey); }
    public get Height(): number    { return this.get_property_value(LeafVM.HeightKey); }
    public get IsSelected(): boolean { return this.get_property_value(LeafVM.IsSelectedKey); }
    public set IsSelected(v: boolean) { this.set_property_value(LeafVM.IsSelectedKey, v); }
}

class FakeTarget implements MountableTarget
{
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void { /* noop */ }
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

function setup(items: LeafVM[]): { diagram: Diagram }
{
    Application.current = null;
    new Application();
    const itemsCollection = new ObservableCollection<LeafVM>(items);
    const diagram = new Diagram();
    diagram.SelectionMode = SelectionMode.Extended;
    diagram.ItemsPanel    = new ItemsPanelTemplate(() => new Canvas());
    const style = new Style(Figure, [
        new Setter(Figure, 'Left', new SetterFactory((t: Visual) => DataContextBinding(t, 'Left'))),
        new Setter(Figure, 'Top',  new SetterFactory((t: Visual) => DataContextBinding(t, 'Top'))),
    ], undefined, [], []);
    diagram.ItemContainerStyle = style;
    diagram.ItemsSource = itemsCollection;
    const surface = new Border();
    (surface as unknown as { Child: Visual }).Child = diagram;
    const target = new FakeTarget();
    target.Content = surface;
    (surface as Visual).Measure(new Size(800, 600));
    (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
    return { diagram };
}

function selectFigure(diagram: Diagram, item: LeafVM): void
{
    const container = diagram.Generator.ContainerFromItem(item);
    if (container === undefined) throw new Error('no container for item');
    diagram.HandleContainerClick(container, { Control: true, Shift: false, Alt: false, Meta: false });
}

function dispatchKeyDown(diagram: Diagram, key: string): KeyEventArgs
{
    const args = new KeyEventArgs('KeyDown', diagram, {
        Key:       key,
        Code:      key,
        Modifiers: { Control: false, Shift: false, Alt: false, Meta: false },
        Repeat:    false,
    });
    (diagram as unknown as { OnKeyDown(a: KeyEventArgs): void }).OnKeyDown(args);
    return args;
}

function makeConnector(): Connector
{
    const c = new Connector();
    c.RoutingMode = RoutingMode.Straight;       // only Straight is side-effect-imported in this file
    c.Source = new ConnectorEndpoint({ FreePoint: new Point(0,   0) });
    c.Target = new ConnectorEndpoint({ FreePoint: new Point(100, 0) });
    return c;
}

// ── Connector-selection state API ────────────────────────────────────

describe('Diagram — connector-selection API', () => {
    test('SelectConnector + IsConnectorSelected roundtrip', () => {
        const { diagram } = setup([]);
        const c = makeConnector();
        assert.equal(diagram.IsConnectorSelected(c), false);
        diagram.SelectConnector(c);
        assert.equal(diagram.IsConnectorSelected(c), true);
    });

    test('DeselectConnector clears that entry only', () => {
        const { diagram } = setup([]);
        const a = makeConnector();
        const b = makeConnector();
        diagram.SelectConnector(a);
        diagram.SelectConnector(b);
        diagram.DeselectConnector(a);
        assert.equal(diagram.IsConnectorSelected(a), false);
        assert.equal(diagram.IsConnectorSelected(b), true);
    });

    test('ClearConnectorSelection wipes the whole connector channel', () => {
        const { diagram } = setup([]);
        diagram.SelectConnector(makeConnector());
        diagram.SelectConnector(makeConnector());
        diagram.SelectConnector(makeConnector());
        diagram.ClearConnectorSelection();
        assert.equal(diagram.SelectedConnectors.length, 0);
    });

    test('SelectedConnectors returns a snapshot — outer mutation does not affect internal state', () => {
        const { diagram } = setup([]);
        const c = makeConnector();
        diagram.SelectConnector(c);
        const snap = diagram.SelectedConnectors;
        (snap as Connector[]).push(makeConnector());
        assert.equal(diagram.SelectedConnectors.length, 1);
    });

    test('connector-selection channel is INDEPENDENT of the items-selection channel', () => {
        const a = new LeafVM();
        const { diagram } = setup([a]);
        const conn = makeConnector();
        selectFigure(diagram, a);
        diagram.SelectConnector(conn);
        assert.equal(diagram.SelectedItems.length, 1);
        assert.equal(diagram.SelectedConnectors.length, 1);
        diagram.ClearConnectorSelection();
        assert.equal(diagram.SelectedItems.length, 1);
        assert.equal(diagram.SelectedConnectors.length, 0);
    });
});

// ── Delete delivers both arrays ──────────────────────────────────────

describe('Diagram — Delete with mixed selection fires DeleteRequested with both arrays', () => {
    test('only Items selected: Connectors is empty, Items carries the snapshot', () => {
        const a = new LeafVM();
        const { diagram } = setup([a]);
        const captured: DeleteRequestedArgs[] = [];
        diagram.AddDeleteRequestedListener(args => captured.push(args));
        selectFigure(diagram, a);

        dispatchKeyDown(diagram, 'Delete');
        assert.equal(captured.length, 1);
        assert.equal(captured[0]!.Items.length, 1);
        assert.equal(captured[0]!.Items[0], a);
        assert.equal(captured[0]!.Connectors.length, 0);
    });

    test('only Connectors selected: Items is empty, Connectors carries the snapshot', () => {
        const { diagram } = setup([]);
        const captured: DeleteRequestedArgs[] = [];
        diagram.AddDeleteRequestedListener(args => captured.push(args));
        const conn = makeConnector();
        diagram.SelectConnector(conn);

        const args = dispatchKeyDown(diagram, 'Delete');
        assert.equal(captured.length, 1);
        assert.equal(captured[0]!.Items.length, 0);
        assert.equal(captured[0]!.Connectors.length, 1);
        assert.equal(captured[0]!.Connectors[0], conn);
        assert.equal(args.Handled, true);
    });

    test('mixed selection delivers both populations to a single listener', () => {
        const a = new LeafVM(), b = new LeafVM();
        const { diagram } = setup([a, b]);
        let captured: DeleteRequestedArgs | undefined;
        diagram.AddDeleteRequestedListener(args => { captured = args; });

        selectFigure(diagram, a);
        selectFigure(diagram, b);
        const conn1 = makeConnector();
        const conn2 = makeConnector();
        diagram.SelectConnector(conn1);
        diagram.SelectConnector(conn2);

        dispatchKeyDown(diagram, 'Delete');
        assert.ok(captured !== undefined);
        assert.equal(captured!.Items.length, 2);
        assert.equal(captured!.Connectors.length, 2);
        assert.ok(captured!.Items.includes(a) && captured!.Items.includes(b));
        assert.ok(captured!.Connectors.includes(conn1) && captured!.Connectors.includes(conn2));
    });

    test('empty Items + empty Connectors → no fire, not handled', () => {
        const { diagram } = setup([]);
        let fired = 0;
        diagram.AddDeleteRequestedListener(() => { fired++; });
        const args = dispatchKeyDown(diagram, 'Delete');
        assert.equal(fired, 0);
        assert.equal(args.Handled, false);
    });

    test('Backspace path covers connectors too', () => {
        const { diagram } = setup([]);
        let captured: DeleteRequestedArgs | undefined;
        diagram.AddDeleteRequestedListener(args => { captured = args; });
        diagram.SelectConnector(makeConnector());

        dispatchKeyDown(diagram, 'Backspace');
        assert.ok(captured !== undefined);
        assert.equal(captured!.Connectors.length, 1);
    });

    test('snapshot stability — Items / Connectors arrays survive listener mutation', () => {
        const a = new LeafVM();
        const { diagram } = setup([a]);
        const conn = makeConnector();
        let captured: DeleteRequestedArgs | undefined;
        diagram.AddDeleteRequestedListener(args => {
            captured = args;
            // Simulate the consumer's typical "clear selection as
            // part of removal" pattern. The captured args' arrays
            // must remain populated after the clear.
            diagram.ClearSelection();
            diagram.ClearConnectorSelection();
        });
        selectFigure(diagram, a);
        diagram.SelectConnector(conn);

        dispatchKeyDown(diagram, 'Delete');
        assert.ok(captured !== undefined);
        assert.equal(captured!.Items.length, 1);
        assert.equal(captured!.Connectors.length, 1);
    });
});
