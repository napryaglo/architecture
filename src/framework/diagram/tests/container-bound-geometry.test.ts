// Slice #3a T1: the container Figure is the geometry owner for content
// view-model nodes. When a VM container realizes, the document seeds its
// geometry from the NodeVisualStore (the `visuals` section), via the
// Diagram's ContainerBound signal — so a VM that carries no geometry of its
// own still lands where the store says.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, ObservableCollection, Size, Visual } from '../../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate } from '../../../basic/index.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';
import { NodeViewModel } from '../node-view-model.js';
import { DiagramDocument, type DiagramStorage } from '../diagram-document.js';
import { registerNodeSerializer } from '../node-serialization.js';
import '../node-serializers-default.js';   // side-effect: registers shape/text/callout

// A throwaway content-VM serializer, so Load exercises the REAL path: build the
// node from the `nodes` section (geometry-free) + seed the store from `visuals`.
// A content VM has no framework serializer of its own (Plexus supplies ArchNodeVM);
// this stands in for one.
const TEST_VM_TYPE = 'boundvm';
registerNodeSerializer({
    type: TEST_VM_TYPE,
    matches: (n) => n instanceof NodeViewModel,
    serialize: () => ({}),
    deserialize: () => new NodeViewModel(),
});

class MemoryStorage implements DiagramStorage
{
    private readonly _map = new Map<string, string>();
    public GetItem(key: string): string | null { return this._map.get(key) ?? null; }
    public SetItem(key: string, value: string): void { this._map.set(key, value); }
}

function mountView(doc: DiagramDocument): Diagram
{
    const diagram = new Diagram();
    diagram.ItemsPanel = new ItemsPanelTemplate(() => new Canvas());
    diagram.DataContext = doc;          // publishes diagram as doc.ActiveView
    diagram.ItemsSource = doc.Nodes;
    const surface = new Border();
    (surface as unknown as { Child: Visual }).Child = diagram;
    (surface as Visual).Measure(new Size(800, 600));
    (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
    return diagram;
}

describe('ContainerBound — document seeds VM-container geometry from the store', () => {
    test('a VM node with no own geometry lands at its stored geometry', () => {
        Application.current = null; new Application();
        const storage = new MemoryStorage();
        storage.SetItem('mural-diagram-state-v1', JSON.stringify({
            version: 3,
            nodes:   [{ id: 'v', type: TEST_VM_TYPE, data: {} }],
            visuals: { v: { left: 15, top: 25, w: 120, h: 60 } },
            connectors: [],
            nextId: 1,
        }));

        const doc = new DiagramDocument(storage);
        doc.Load();
        assert.equal(doc.Nodes.Count, 1, 'VM rehydrated from the nodes section');
        const vm = doc.Nodes.Get(0)!;
        assert.ok(vm instanceof NodeViewModel, 'built as a content VM, not a Figure');

        const diagram = mountView(doc);
        const container = diagram.Generator.ContainerFromItem(vm);
        assert.ok(container instanceof Figure, 'VM item wrapped in a Figure container');
        const fig = container as Figure;
        assert.equal(fig.Left,   15, 'container Left seeded from the store');
        assert.equal(fig.Top,    25, 'container Top seeded from the store');
        assert.equal(fig.Width,  120, 'container Width seeded from the store');
        assert.equal(fig.Height, 60,  'container Height seeded from the store');
    });
});
