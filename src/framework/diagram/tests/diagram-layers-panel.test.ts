// Step 8 / § 9 of [docs/connectors.md](../../../../docs/connectors.md):
// pins (a) DiagramLayersPanel layer routing + z-order, and (b)
// Diagram.Connectors collection materialization through the
// DiagramConnectorsMaterializer collaborator.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    MetaData,
    MuralBase,
    ObservableCollection,
    Size,
    Visual,
} from '../../../runtime/index.js';
import { Border, ItemsPanelTemplate } from '../../../basic/index.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import { Point } from '../../../visual-engine/index.js';
import { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import {
    DiagramLayer,
    DiagramLayersPanel,
} from '../diagram-layers-panel.js';
import { Diagram } from '../diagram.js';
import { RoutingMode } from '../routing/router.js';
import '../routing/straight-router.js';

// ── DiagramLayersPanel — layer routing ───────────────────────────────

describe('DiagramLayersPanel — layer routing', () => {
    test('default child (no Layer attached prop set) goes to the figures layer', () => {
        const panel = new DiagramLayersPanel();
        const v = new Border();
        panel.AddChild(v);
        assert.equal(panel.FiguresLayer.Children.IndexOf(v), 0);
        assert.equal(panel.ConnectorsLayer.Children.IndexOf(v), -1);
    });

    test('child tagged DiagramLayer.Connectors goes to the connectors layer', () => {
        const panel = new DiagramLayersPanel();
        const v = new Border();
        DiagramLayersPanel.SetLayer(v, DiagramLayer.Connectors);
        panel.AddChild(v);
        assert.equal(panel.ConnectorsLayer.Children.IndexOf(v), 0);
        assert.equal(panel.FiguresLayer.Children.IndexOf(v), -1);
    });

    test('child tagged DiagramLayer.Figures explicitly goes to figures layer', () => {
        const panel = new DiagramLayersPanel();
        const v = new Border();
        DiagramLayersPanel.SetLayer(v, DiagramLayer.Figures);
        panel.AddChild(v);
        assert.equal(panel.FiguresLayer.Children.IndexOf(v), 0);
    });

    test('RemoveChild handles both layers', () => {
        const panel = new DiagramLayersPanel();
        const a = new Border();
        const b = new Border();
        DiagramLayersPanel.SetLayer(a, DiagramLayer.Connectors);
        // b stays default (Figures).
        panel.AddChild(a);
        panel.AddChild(b);
        panel.RemoveChild(a);
        panel.RemoveChild(b);
        assert.equal(panel.ConnectorsLayer.Children.Count, 0);
        assert.equal(panel.FiguresLayer.Children.Count, 0);
    });

    test('AddVisualChild routes the same way as AddChild', () => {
        const panel = new DiagramLayersPanel();
        const v = new Border();
        DiagramLayersPanel.SetLayer(v, DiagramLayer.Connectors);
        panel.AddVisualChild(v);
        assert.equal(panel.ConnectorsLayer.Children.IndexOf(v), 0);
    });
});

describe('DiagramLayersPanel — z-order', () => {
    test('connectors layer is the FIRST inner child (renders behind figures)', () => {
        const panel = new DiagramLayersPanel();
        // Both inner Canvases are added in the constructor — the
        // connectors layer first so paint order keeps it behind.
        const children = [...panel.Children];
        assert.equal(children[0], panel.ConnectorsLayer);
        assert.equal(children[1], panel.FiguresLayer);
    });
});

// ── Diagram.Connectors materialization ───────────────────────────────

class ConnectorVM extends MuralBase
{
    public static readonly IdKey = MuralBase.RegisterProperty<string>(
        ConnectorVM, 'Id', '', MetaData.None);
    constructor(id: string)
    {
        super();
        this.set_property_value(ConnectorVM.IdKey, id);
    }
    public get Id(): string { return this.get_property_value(ConnectorVM.IdKey); }
}

function newDiagram(): Diagram
{
    Application.current = null;
    new Application();
    return new Diagram();
}

describe('Diagram.Connectors — materialization on assign', () => {
    test('initial Connectors collection materializes one Visual per item', () => {
        const d = newDiagram();
        const items = new ObservableCollection<MuralBase>([new ConnectorVM('a'), new ConnectorVM('b')]);
        d.Connectors = items;

        const m = d._getConnectorsMaterializerForTesting();
        assert.equal(m.MaterializedVisuals.size, 2);
        // Each Visual has its corresponding item as DataContext.
        for (const item of items)
        {
            const v = m.MaterializedVisuals.get(item);
            assert.ok(v !== undefined);
            assert.equal(v!.DataContext, item);
        }
    });

    test('default ConnectorTemplate (undefined) materializes a `new Connector()`', () => {
        const d = newDiagram();
        const item = new ConnectorVM('a');
        d.Connectors = new ObservableCollection<MuralBase>([item]);
        const v = d._getConnectorsMaterializerForTesting().MaterializedVisuals.get(item);
        assert.ok(v instanceof Connector);
    });

    test('materialized visuals are tagged for the connectors layer', () => {
        const d = newDiagram();
        const item = new ConnectorVM('a');
        d.Connectors = new ObservableCollection<MuralBase>([item]);
        const v = d._getConnectorsMaterializerForTesting().MaterializedVisuals.get(item)!;
        assert.equal(DiagramLayersPanel.GetLayer(v), DiagramLayer.Connectors);
    });
});

describe('Diagram.Connectors — collection mutation', () => {
    test('inserting an item materializes its Visual', () => {
        const d = newDiagram();
        const items = new ObservableCollection<MuralBase>();
        d.Connectors = items;
        const m = d._getConnectorsMaterializerForTesting();
        assert.equal(m.MaterializedVisuals.size, 0);

        const a = new ConnectorVM('a');
        items.Add(a);
        assert.equal(m.MaterializedVisuals.size, 1);
        assert.ok(m.MaterializedVisuals.has(a));
    });

    test('removing an item disposes its Visual', () => {
        const d = newDiagram();
        const a = new ConnectorVM('a');
        const items = new ObservableCollection<MuralBase>([a]);
        d.Connectors = items;
        const m = d._getConnectorsMaterializerForTesting();
        assert.equal(m.MaterializedVisuals.size, 1);

        items.Remove(a);
        assert.equal(m.MaterializedVisuals.size, 0);
        assert.ok(!m.MaterializedVisuals.has(a));
    });

    test('clearing the collection disposes all materialized visuals', () => {
        const d = newDiagram();
        const items = new ObservableCollection<MuralBase>([
            new ConnectorVM('a'), new ConnectorVM('b'), new ConnectorVM('c'),
        ]);
        d.Connectors = items;
        const m = d._getConnectorsMaterializerForTesting();
        assert.equal(m.MaterializedVisuals.size, 3);

        items.Clear();
        assert.equal(m.MaterializedVisuals.size, 0);
    });

    test('replacing Connectors with a different collection drops the old visuals', () => {
        const d = newDiagram();
        const initial = new ObservableCollection<MuralBase>([new ConnectorVM('a')]);
        d.Connectors = initial;
        const m = d._getConnectorsMaterializerForTesting();
        assert.equal(m.MaterializedVisuals.size, 1);

        const fresh = new ObservableCollection<MuralBase>([new ConnectorVM('b'), new ConnectorVM('c')]);
        d.Connectors = fresh;
        assert.equal(m.MaterializedVisuals.size, 2);
    });

    test('setting Connectors to undefined disposes all visuals', () => {
        const d = newDiagram();
        d.Connectors = new ObservableCollection<MuralBase>([new ConnectorVM('a'), new ConnectorVM('b')]);
        const m = d._getConnectorsMaterializerForTesting();
        assert.equal(m.MaterializedVisuals.size, 2);
        d.Connectors = undefined;
        assert.equal(m.MaterializedVisuals.size, 0);
    });
});

// ── Cap visuals mount into the connectors layer ──────────────────────

// Minimal cap template: a Border carrying a CapInset, standing in for a
// catalog @…Cap. The materializer only needs a materialized Visual to
// mount; the catalog Path is exercised by cap-inset.test.ts.
function capTemplate(inset: number): DataTemplate
{
    return new DataTemplate(() => {
        const root = new Border();
        Connector.SetCapInset(root, inset);
        return root;
    });
}

// Full-layout fixture: a Diagram whose ItemsPanel is a DiagramLayersPanel,
// measured/arranged so ItemsPanelInstance is live and the materializer
// mounts into the real connectors layer.
function layeredDiagram(): Diagram
{
    Application.current = null;
    new Application();
    const d = new Diagram();
    d.ItemsPanel = new ItemsPanelTemplate(() => new DiagramLayersPanel());
    const surface = new Border();
    (surface as unknown as { Child: Visual }).Child = d;
    (surface as Visual).Measure(new Size(800, 600));
    (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
    return d;
}

function connectorsPanel(d: Diagram): DiagramLayersPanel
{
    const panel = d.ItemsPanelInstance;
    assert.ok(panel instanceof DiagramLayersPanel, 'ItemsPanelInstance is a DiagramLayersPanel');
    return panel;
}

function straightConnectorWithTargetCap(inset: number): Connector
{
    const c = new Connector();
    c.RoutingMode = RoutingMode.Straight;
    c.Source = new ConnectorEndpoint({ FreePoint: new Point(0,   0) });
    c.Target = new ConnectorEndpoint({ FreePoint: new Point(100, 0) });
    c.TargetCapTemplate = capTemplate(inset);
    return c;
}

describe('Diagram.Connectors — cap visuals mount into the connectors layer', () => {
    test("a connector's target cap visual lands in the connectors layer", () => {
        const d = layeredDiagram();
        const panel = connectorsPanel(d);
        const c = straightConnectorWithTargetCap(8);
        d.Connectors = new ObservableCollection<MuralBase>([c]);

        // Both the connector line AND its cap are in the connectors layer.
        assert.notEqual(panel.ConnectorsLayer.Children.IndexOf(c), -1);
        assert.notEqual(panel.ConnectorsLayer.Children.IndexOf(c.TargetCapInstance!), -1);
        // The cap is tagged for the connectors layer.
        assert.equal(DiagramLayersPanel.GetLayer(c.TargetCapInstance!), DiagramLayer.Connectors);
    });

    test('flipping the cap template swaps the mounted cap visual', () => {
        const d = layeredDiagram();
        const panel = connectorsPanel(d);
        const c = straightConnectorWithTargetCap(8);
        d.Connectors = new ObservableCollection<MuralBase>([c]);
        const firstCap = c.TargetCapInstance!;
        assert.notEqual(panel.ConnectorsLayer.Children.IndexOf(firstCap), -1);

        c.TargetCapTemplate = capTemplate(12);
        const secondCap = c.TargetCapInstance!;
        assert.notEqual(secondCap, firstCap);
        // Old cap unmounted, new cap mounted.
        assert.equal(panel.ConnectorsLayer.Children.IndexOf(firstCap), -1);
        assert.notEqual(panel.ConnectorsLayer.Children.IndexOf(secondCap), -1);
    });

    test('clearing the cap template unmounts the cap visual', () => {
        const d = layeredDiagram();
        const panel = connectorsPanel(d);
        const c = straightConnectorWithTargetCap(8);
        d.Connectors = new ObservableCollection<MuralBase>([c]);
        const cap = c.TargetCapInstance!;
        assert.notEqual(panel.ConnectorsLayer.Children.IndexOf(cap), -1);

        c.TargetCapTemplate = undefined;
        assert.equal(c.TargetCapInstance, undefined);
        assert.equal(panel.ConnectorsLayer.Children.IndexOf(cap), -1);
    });

    test('removing the connector unmounts its cap too', () => {
        const d = layeredDiagram();
        const panel = connectorsPanel(d);
        const c = straightConnectorWithTargetCap(8);
        const items = new ObservableCollection<MuralBase>([c]);
        d.Connectors = items;
        const cap = c.TargetCapInstance!;
        assert.notEqual(panel.ConnectorsLayer.Children.IndexOf(cap), -1);

        items.Remove(c);
        assert.equal(panel.ConnectorsLayer.Children.IndexOf(cap), -1);
        assert.equal(panel.ConnectorsLayer.Children.IndexOf(c), -1);
    });
});

describe('Diagram.ConnectorTemplate — honored on materialization', () => {
    test('custom ConnectorTemplate produces the template-derived Visual', () => {
        const d = newDiagram();
        // Sentinel Visual that distinguishes "template applied" from
        // "default Connector created".
        const sentinel = (data: unknown): Visual => {
            const b = new Border();
            (b as unknown as { __sentinelData: unknown }).__sentinelData = data;
            return b;
        };
        d.ConnectorTemplate = new DataTemplate(sentinel);
        const item = new ConnectorVM('a');
        d.Connectors = new ObservableCollection<MuralBase>([item]);

        const v = d._getConnectorsMaterializerForTesting().MaterializedVisuals.get(item)!;
        assert.ok(v instanceof Border);
        assert.equal((v as unknown as { __sentinelData: unknown }).__sentinelData, item);
    });

    test('changing ConnectorTemplate rebuilds existing visuals', () => {
        const d = newDiagram();
        const item = new ConnectorVM('a');
        d.Connectors = new ObservableCollection<MuralBase>([item]);
        const m = d._getConnectorsMaterializerForTesting();
        const initialVisual = m.MaterializedVisuals.get(item)!;
        assert.ok(initialVisual instanceof Connector);

        d.ConnectorTemplate = new DataTemplate(() => new Border());
        const rebuiltVisual = m.MaterializedVisuals.get(item)!;
        assert.notEqual(rebuiltVisual, initialVisual);
        assert.ok(rebuiltVisual instanceof Border);
    });
});
