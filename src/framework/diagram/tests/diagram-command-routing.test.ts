import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ObservableCollection, Size, Rect, Visual, ModifierKeys, type MountableTarget } from '../../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate } from '../../../basic/index.js';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Diagram } from '../diagram.js';
import { SelectionMode } from '../../list/list-box.js';
import { DiagramDocument } from '../diagram-document.js';
import { DiagramCommandId } from '../diagram-command-contexts.js';
import { CommandDefinition } from '../../shell/commands/command-definition.js';

class FakeTarget implements MountableTarget
{
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void { /* noop */ }
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

function alignDef(id: string): CommandDefinition
{
    const d = new CommandDefinition();
    d.Id = id;
    return d;
}

// Verifies the toolbar → document → ActiveView command path: pressing an align
// button dispatches CommandDefinition → DiagramDocument.Execute → the published
// ActiveView's command. If ActiveView isn't published or Execute doesn't route,
// the buttons "do nothing".
describe('Diagram command routing — toolbar dispatch reaches the canvas', () => {
    beforeEach(() => { initTestApp(); });

    test('the canvas publishes itself as the document ActiveView', () => {
        const doc = new DiagramDocument();
        const d = new Diagram();
        (d as unknown as { DataContext: unknown }).DataContext = doc;
        assert.equal(doc.ActiveView, d, 'Diagram publishes itself onto DiagramDocument.ActiveView');
    });

    test('align-left dispatched via DiagramDocument.Execute moves the selection', () => {
        const doc = new DiagramDocument();
        const a = doc.CreateNode('rectangle', 40, 60)!;
        const b = doc.CreateNode('ellipse', 200, 130)!;
        assert.ok(a && b, 'seeded two figures');

        const d = new Diagram();
        d.SelectionMode = SelectionMode.Extended;
        d.ItemsPanel    = new ItemsPanelTemplate(() => new Canvas());
        d.ItemsSource   = doc.Nodes;
        (d as unknown as { DataContext: unknown }).DataContext = doc;   // publishes ActiveView

        const surface = new Border();
        (surface as unknown as { Child: Visual }).Child = d;
        const target = new FakeTarget();
        target.Content = surface;
        (surface as Visual).Measure(new Size(800, 600));
        (surface as Visual).Arrange(new Rect(0, 0, 800, 600));

        // Select both figures.
        for (const fig of [a, b])
        {
            const container = d.Generator.ContainerFromItem(fig);
            assert.ok(container !== undefined, 'container generated for figure');
            d.HandleContainerClick(container!, ModifierKeys.Control);
        }
        assert.equal(d.SelectionCount, 2, 'both figures selected');

        // Dispatch through the SAME path the toolbar CommandViewModel uses.
        assert.ok(doc.CanExecute(alignDef(DiagramCommandId.AlignLeft)), 'align-left is executable with a 2-shape selection');
        doc.Execute(alignDef(DiagramCommandId.AlignLeft));

        assert.equal(a.Left, b.Left, 'align-left equalized the two figures\' Left — command routed to the canvas');
    });
});
