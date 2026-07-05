import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Application, Rect, Size, Visibility, type Visual } from '../../runtime/index.js';
import { initTestApp } from '../../basic/tests/test-app.js';
import { DataTemplate } from '../../basic/templates/data-template.js';
import { Border } from '../../basic/border.js';
import { EditorShell } from '../shell/editor-shell.js';
import { InspectorService } from '../shell/services/inspector-service.js';
import { Inspector } from '../shell/services/inspector.js';
import { InspectorPanel } from '../shell/inspector/inspector-panel.js';

// A concrete inspector VM rendered by a marker DataTemplate — stands in for
// DiagramInspector (the Format Shape pane) without pulling the diagram in.
class TestInspector extends Inspector
{
    public readonly marker: Border;
    constructor(id: string, title: string)
    {
        super(id, title);
        this.marker = new Border();
    }
}

function collect<T>(root: Visual, ctor: new (...a: never[]) => T, out: T[] = []): T[]
{
    if (root instanceof ctor) out.push(root);
    for (const c of root.visualChildren) collect(c, ctor, out);
    return out;
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('InspectorService — multi-inspector host + collapsible panel stack', () =>
{
    beforeEach(() =>
    {
        initTestApp();
        // The inspector's BODY renders through its type template (each
        // inspector's own marker Border); the InspectorPanel supplies the chrome.
        Application.current.Resources.Set(TestInspector, new DataTemplate(
            (s) => (s as TestInspector).marker, TestInspector));
    });

    async function mount(): Promise<{ root: Visual; svc: InspectorService }>
    {
        const shell = new EditorShell();
        const root  = shell.visualChildren[0]!;
        const svc   = shell.Services.get(InspectorService.Key) as InspectorService;
        await settle();
        return { root, svc };
    }

    test('Add() renders one collapsible panel presenting the inspector', async () =>
    {
        const { root, svc } = await mount();
        const insp = new TestInspector('a', 'Alpha');
        svc.Add(insp);
        await settle();

        const panels = collect(root, InspectorPanel);
        assert.equal(panels.length, 1, 'one panel materialized');
        const panel = panels[0]!;
        assert.equal(panel.DataContext, insp, 'panel DataContext is the inspector');
        assert.equal(panel.Content, insp, 'panel Content is the inspector (body via type template)');
    });

    test('Add() dedupes by Id — re-adding re-surfaces the one panel expanded', async () =>
    {
        const { root, svc } = await mount();
        const insp = new TestInspector('a', 'Alpha');
        svc.Add(insp);
        await settle();
        insp.IsExpanded = false;

        const again = svc.Add(new TestInspector('a', 'Alpha again'));
        await settle();

        assert.equal(again, insp, 'returns the existing instance, not the new one');
        assert.equal(svc.Inspectors.Count, 1, 'no duplicate added');
        assert.equal(insp.IsExpanded, true, 're-add expands the reused panel');
        assert.equal(collect(root, InspectorPanel).length, 1, 'still one panel');
    });

    test('distinct Ids stack multiple panels', async () =>
    {
        const { root, svc } = await mount();
        svc.Add(new TestInspector('a', 'Alpha'));
        svc.Add(new TestInspector('b', 'Beta'));
        await settle();
        assert.equal(collect(root, InspectorPanel).length, 2, 'two panels stacked');
    });

    test('CloseById / CloseInspectorCommand removes the panel', async () =>
    {
        const { root, svc } = await mount();
        svc.Add(new TestInspector('a', 'Alpha'));
        svc.Add(new TestInspector('b', 'Beta'));
        await settle();

        // The command a panel's close affordance binds (CommandParameter = $Id).
        svc.CloseInspectorCommand.Execute('a');
        await settle();

        assert.equal(svc.Inspectors.Count, 1, 'one inspector remains');
        const panels = collect(root, InspectorPanel);
        assert.equal(panels.length, 1, 'one panel remains');
        assert.equal((panels[0]!.Content as TestInspector).Id, 'b', 'the surviving panel is Beta');
    });

    test('adding to an already-laid-out empty region invalidates + expands it', async () =>
    {
        const shell = new EditorShell();
        const root  = shell.visualChildren[0]!;
        const svc   = shell.Services.get(InspectorService.Key) as InspectorService;
        await settle();

        // Realistic order: the region is measured/arranged EMPTY first (starts
        // collapsed), THEN an inspector is added on demand.
        root.Measure(new Size(1200, 800));
        root.Arrange(new Rect(0, 0, 1200, 800));
        assert.equal(collect(root, InspectorPanel).length, 0, 'region starts empty');

        svc.Add(new TestInspector('a', 'Alpha'));
        await settle();

        // The layout loop responds to InvalidateMeasure with another pass.
        root.Measure(new Size(1200, 800));
        root.Arrange(new Rect(0, 0, 1200, 800));

        const panel = collect(root, InspectorPanel)[0]!;
        assert.ok(panel !== undefined, 'panel materialized after add');
        assert.ok(panel.DesiredSize.Width > 0, `panel width should be > 0, got ${panel.DesiredSize.Width}`);
        assert.ok(panel.RenderSize.Width >= 100,
            `panel should arrange to a real width, got ${panel.RenderSize.Width}`);
    });

    test('IsExpanded rides the inspector VM and drives body visibility', async () =>
    {
        const { root, svc } = await mount();
        const insp = new TestInspector('a', 'Alpha');
        svc.Add(insp);
        await settle();

        const panel = collect(root, InspectorPanel)[0]!;
        // TwoWay binding: panel.IsExpanded tracks the VM.
        assert.equal(panel.IsExpanded, true, 'starts expanded');

        insp.IsExpanded = false;
        await settle();
        assert.equal(panel.IsExpanded, false, 'panel collapses when the VM collapses');

        const body = panel.GetTemplateChild('PART_Body');
        assert.ok(body !== undefined, 'panel exposes PART_Body');
        assert.equal(body!.Visibility, Visibility.Collapsed, 'body hidden when collapsed');

        // The header toggle command flips it back (and TwoWay pushes to the VM).
        panel.ToggleExpandedCommand.Execute(undefined);
        await settle();
        assert.equal(panel.IsExpanded, true, 'toggle re-expands');
        assert.equal(insp.IsExpanded, true, 'TwoWay pushes expand back to the VM');
    });
});
