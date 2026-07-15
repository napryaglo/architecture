import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Rect, Size } from '../../../runtime/index.js';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { ItemsPanelTemplate } from '../../../basic/panels/items-panel-template.js';
import { Canvas } from '../../../basic/panels/canvas.js';
import { Diagram } from '../diagram.js';
import { DiagramDocument } from '../diagram-document.js';

// The node Figures ARE the Diagram's containers (Diagram.GetContainerForItemOverride
// returns the item itself). So a document's Nodes are shared Visuals. If a Diagram
// is discarded WITHOUT tearing down its containers (what a tab swap does — the
// ContentPresenter just detaches the whole Diagram), its Figures stay pinned to
// the discarded panel. Realizing the same Nodes in a fresh Diagram then hits
// AddVisualChild's single-parent guard: "Visual already has a visual parent".
// This is the reported tab-switch crash, isolated to two Diagrams over one doc.

function layout(d: Diagram): void
{
    d.ItemsPanel = new ItemsPanelTemplate(() => new Canvas());
    d.Measure(new Size(400, 400));
    d.Arrange(new Rect(0, 0, 400, 400));
}

describe('Diagram — a document shown in a second Diagram after the first is discarded', () => {
    beforeEach(() => { initTestApp(); });

    test('realizing a doc\'s shared node Figures in a fresh Diagram does not throw', () => {
        const doc = new DiagramDocument();
        doc.CreateNode('rectangle', 40, 40);
        doc.CreateNode('ellipse', 160, 80);

        const first = new Diagram();
        (first as unknown as { ItemsSource: unknown }).ItemsSource = doc.Nodes;
        layout(first);

        // Discard `first` the way a tab swap does: drop the reference without a
        // container teardown. Its Figures are still visually parented to first's
        // Canvas panel.
        // (No detach call — that's exactly the bug scenario.)

        const second = new Diagram();
        assert.doesNotThrow(() =>
        {
            (second as unknown as { ItemsSource: unknown }).ItemsSource = doc.Nodes;
            layout(second);
        }, 're-showing a document\'s nodes in a new Diagram must reclaim the shared Figures');
    });
});
