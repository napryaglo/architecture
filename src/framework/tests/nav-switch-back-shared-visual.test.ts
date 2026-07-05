import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Application, Model, MetaData, ServiceProvider, type Visual } from '../../runtime/index.js';
import { initTestApp } from '../../basic/tests/test-app.js';
import { DataTemplate } from '../../basic/templates/data-template.js';
import { Border } from '../../basic/border.js';
import { ContentControl } from '../base/content-control.js';
import { EditorShell } from '../shell/editor-shell.js';
import { NavigationService, NavigationDestination } from '../shell/services/navigation-service.js';
import { NavigationRail } from '../navigation/navigation-rail.js';
import { NavigationItem } from '../navigation/navigation-item.js';
import { Capability } from '../shell/module.js';
import { ModifierKeys } from '../../runtime/index.js';

// A capability service that exposes a SHARED Visual (like ToolboxShape.PreviewNode
// — a Figure held on the model and bound into a tile's ContentControl.Content).
class SharedVisualSvc extends Model {
    public static readonly PreviewKey = Model.RegisterProperty<Visual | undefined>(
        SharedVisualSvc, 'Preview', undefined, MetaData.None);
    constructor() { super(); this.set_property_value(SharedVisualSvc.PreviewKey, new Border()); }
    public get Preview(): Visual | undefined { return this.get_property_value(SharedVisualSvc.PreviewKey); }
}
class OtherSvc extends Model {}

function collect<T>(root: Visual, ctor: new (...a: never[]) => T, out: T[] = []): T[] {
    if (root instanceof ctor) out.push(root);
    for (const c of root.visualChildren) collect(c, ctor, out);
    return out;
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Navigation — re-presenting a capability whose view hosts a shared Visual', () => {
    beforeEach(() => {
        initTestApp();
        Application.current.Services
            .register(ServiceProvider.tokenFor(SharedVisualSvc), () => new SharedVisualSvc(), 'singleton')
            .register(ServiceProvider.tokenFor(OtherSvc), () => new OtherSvc(), 'singleton')
            .registerScoped(NavigationService.Key, (p) => new NavigationService(p));
        // The capability's panel view binds a ContentControl to the service's
        // SHARED Preview Visual — the ToolboxShape tile shape.
        Application.current.Resources.Set(SharedVisualSvc, new DataTemplate((s) => {
            const cc = new ContentControl();
            cc.DataContext = s;
            cc.Content = (s as SharedVisualSvc).Preview;
            return cc;
        }, SharedVisualSvc));
        Application.current.Resources.Set(OtherSvc, new DataTemplate((s) => { const b = new Border(); b.DataContext = s; return b; }, OtherSvc));
    });

    test('clicking rail A(shared) → B → A re-presents A without a logical-parent crash', async () => {
        const shell = new EditorShell();
        const root  = shell.visualChildren[0]!;
        const nav = shell.Services.get(NavigationService.Key) as NavigationService;
        const capA = new Capability(); capA.Name = 'A'; capA.ServiceKey = SharedVisualSvc;
        const capB = new Capability(); capB.Name = 'B'; capB.ServiceKey = OtherSvc;
        nav.Items.Add(new NavigationDestination(capA));
        nav.Items.Add(new NavigationDestination(capB));
        await settle();

        const rail = collect(root, NavigationRail)[0]!;
        const items = collect(rail, NavigationItem);
        const click = (i: number) =>
            (rail as unknown as { HandleContainerClick(c: Visual, m: ModifierKeys): void })
                .HandleContainerClick(items[i]!, ModifierKeys.None);

        click(0); await settle();
        click(1); await settle();
        // Switch back to A — this re-creates A's view, re-attaching the shared Preview.
        assert.doesNotThrow(() => { click(0); });
        await settle();
        assert.equal(nav.ActiveService?.constructor, SharedVisualSvc, 'switch back activated A');
    });
});
