import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import {
    Application,
    DataContextBinding,
    MetaData,
    Model,
    NoModifiers,
    Panel,
    PointerButton,
    ServiceBinding,
    ServiceProvider,
    type PointerEventInit,
} from '../../runtime/index.js';
import { InputManager } from '../index.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { ContextMenu } from '../menu/context-menu.js';
import { MenuItem } from '../menu/menu-strip.js';
import { InspectorService } from '../shell/services/inspector-service.js';
import { DiagramInspector } from '../diagram/diagram-inspector.js';

// A stand-in for DiagramDocument: carries an `Inspector` DP the menu's
// CommandParameter binds ($Inspector), like DiagramDocument.Inspector.
class FakeDoc extends Model
{
    public static readonly InspectorKey = Model.RegisterProperty<DiagramInspector>(
        FakeDoc, 'Inspector', undefined as unknown as DiagramInspector, MetaData.None);
    constructor() { super(); this.set_property_value(FakeDoc.InspectorKey, new DiagramInspector()); }
    public get Inspector(): DiagramInspector { return this.get_property_value(FakeDoc.InspectorKey); }
}

class Root extends Panel {}

function rightClick(): PointerEventInit
{
    return {
        HostX: 50, HostY: 30,
        Button: PointerButton.Secondary, Buttons: 2,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0,
        PointerType: 'mouse',
    };
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// Reproduces the Plexus wiring: a host (the Diagram) with an inherited
// ServiceScope + a DiagramDocument DataContext, an attached ContextMenu whose
// "Format Shape" item binds Command=$service(InspectorService).AddInspectorCommand
// and CommandParameter=$Inspector. Verifies both bindings resolve THROUGH the
// overlay-mounted menu to the shell-scoped service + the document's inspector.
describe('Inspector — Format Shape context menu resolves through the overlay', () =>
{
    beforeEach(() => { initTestApp(); });

    test('the menu item adds the document inspector to the SCOPED InspectorService', async () =>
    {
        // A child scope registering InspectorService scoped — the shell shape.
        const scope = Application.current.Services.createScope();
        scope.registerScoped(InspectorService.Key, (p) => new InspectorService(p));
        const svc = scope.get(InspectorService.Key)!;

        const target = new HeadlessTarget(400, 300);
        const root = new Root();
        target.Content = root;

        // Host publishes the scope + the document, like the shell + Diagram.
        root.ServiceScope = scope;
        const doc = new FakeDoc();
        root.DataContext = doc;

        const cm = new ContextMenu();
        const mi = new MenuItem();
        mi.Header = 'Format Shape';
        mi.set_property_value(
            MenuItem.CommandKey,
            ServiceBinding(mi, ServiceProvider.tokenFor(InspectorService), 'AddInspectorCommand') as never);
        mi.set_property_value(
            MenuItem.CommandParameterKey,
            DataContextBinding(mi, 'Inspector') as never);
        cm.Items = [mi];
        root.ContextMenu = cm;

        const im = new InputManager();
        im.InjectPointerDown(root, rightClick());
        assert.equal(cm.IsOpen, true, 'menu opened');
        await settle();

        // Diagnosis: did the bindings resolve through the overlay?
        assert.equal(mi.CommandParameter, doc.Inspector, '$Inspector resolved to the document inspector');
        assert.equal(mi.Command, svc.AddInspectorCommand, '$service resolved to the scoped InspectorService');

        // Fire it as MenuItem activation would.
        mi.Command!.Execute(mi.CommandParameter);
        assert.equal(svc.Inspectors.Count, 1, 'inspector added to the region-bound service');
        assert.equal(svc.Inspectors.Get(0), doc.Inspector, 'the exact document inspector');
    });
});
