// Step 8 / § 9 of [src/document/connectors.md](../../../document/connectors.md):
// pins (a) DiagramLayersPanel layer routing + z-order, and (b)
// Diagram.Connectors collection materialization through the
// DiagramConnectorsMaterializer collaborator.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    MetaData,
    Model,
    ObservableCollection,
    Visual,
} from '../../../runtime/index.js';
import { Border } from '../../../basic/border.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import { Connector } from '../connector.js';
import {
    DiagramLayer,
    DiagramLayersPanel,
} from '../diagram-layers-panel.js';
import { Diagram } from '../diagram.js';

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

class ConnectorVM extends Model
{
    public static readonly IdKey = Model.RegisterProperty<string>(
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
        const items = new ObservableCollection<Model>([new ConnectorVM('a'), new ConnectorVM('b')]);
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
        d.Connectors = new ObservableCollection<Model>([item]);
        const v = d._getConnectorsMaterializerForTesting().MaterializedVisuals.get(item);
        assert.ok(v instanceof Connector);
    });

    test('materialized visuals are tagged for the connectors layer', () => {
        const d = newDiagram();
        const item = new ConnectorVM('a');
        d.Connectors = new ObservableCollection<Model>([item]);
        const v = d._getConnectorsMaterializerForTesting().MaterializedVisuals.get(item)!;
        assert.equal(DiagramLayersPanel.GetLayer(v), DiagramLayer.Connectors);
    });
});

describe('Diagram.Connectors — collection mutation', () => {
    test('inserting an item materializes its Visual', () => {
        const d = newDiagram();
        const items = new ObservableCollection<Model>();
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
        const items = new ObservableCollection<Model>([a]);
        d.Connectors = items;
        const m = d._getConnectorsMaterializerForTesting();
        assert.equal(m.MaterializedVisuals.size, 1);

        items.Remove(a);
        assert.equal(m.MaterializedVisuals.size, 0);
        assert.ok(!m.MaterializedVisuals.has(a));
    });

    test('clearing the collection disposes all materialized visuals', () => {
        const d = newDiagram();
        const items = new ObservableCollection<Model>([
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
        const initial = new ObservableCollection<Model>([new ConnectorVM('a')]);
        d.Connectors = initial;
        const m = d._getConnectorsMaterializerForTesting();
        assert.equal(m.MaterializedVisuals.size, 1);

        const fresh = new ObservableCollection<Model>([new ConnectorVM('b'), new ConnectorVM('c')]);
        d.Connectors = fresh;
        assert.equal(m.MaterializedVisuals.size, 2);
    });

    test('setting Connectors to undefined disposes all visuals', () => {
        const d = newDiagram();
        d.Connectors = new ObservableCollection<Model>([new ConnectorVM('a'), new ConnectorVM('b')]);
        const m = d._getConnectorsMaterializerForTesting();
        assert.equal(m.MaterializedVisuals.size, 2);
        d.Connectors = undefined;
        assert.equal(m.MaterializedVisuals.size, 0);
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
        d.Connectors = new ObservableCollection<Model>([item]);

        const v = d._getConnectorsMaterializerForTesting().MaterializedVisuals.get(item)!;
        assert.ok(v instanceof Border);
        assert.equal((v as unknown as { __sentinelData: unknown }).__sentinelData, item);
    });

    test('changing ConnectorTemplate rebuilds existing visuals', () => {
        const d = newDiagram();
        const item = new ConnectorVM('a');
        d.Connectors = new ObservableCollection<Model>([item]);
        const m = d._getConnectorsMaterializerForTesting();
        const initialVisual = m.MaterializedVisuals.get(item)!;
        assert.ok(initialVisual instanceof Connector);

        d.ConnectorTemplate = new DataTemplate(() => new Border());
        const rebuiltVisual = m.MaterializedVisuals.get(item)!;
        assert.notEqual(rebuiltVisual, initialVisual);
        assert.ok(rebuiltVisual instanceof Border);
    });
});
