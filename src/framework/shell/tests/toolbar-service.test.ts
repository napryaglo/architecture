import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, ServiceKey, type ServiceToken } from '../../../runtime/index.js';
import { ShellModule } from '../module.js';
import { ContentHostService } from '../services/content-host-service.js';
import { DocumentsContentHostService, type IDocument } from '../services/documents-content-host-service.js';
import { CommandManager } from '../../commands/command-manager.js';
import { CommandDefinition, CommandGroupPresentation } from '../commands/command-definition.js';
import { CommandRegistry } from '../commands/command-registry.js';
import { ShellControlDefinition, ShellRegion } from '../commands/shell-control-definition.js';
import { StatusService } from '../services/status-service.js';
import { ToolbarService } from '../commands/toolbar-service.js';
import {
    ShellControlViewModel,
    ToolbarFlatGroup,
    ToolbarGroupViewModel,
    ToolbarSplitGridGroup,
    ToolbarSplitMenuGroup,
    ToolbarToggleGroup,
} from '../commands/toolbar-group-view-model.js';
import { type ICommandTarget } from '../commands/command-target.js';

// Two shared contexts the fake documents activate.
const CTX_A = new ServiceKey<unknown>('ctx.a');
const CTX_B = new ServiceKey<unknown>('ctx.b');

function command(id: string, context: ServiceToken<unknown>, order = 0): CommandDefinition
{
    const c = new CommandDefinition();
    c.Id = id;
    c.Title = id;
    c.Context = context;
    c.Group = 'g';
    c.Order = order;
    return c;
}

// A document that is BOTH an IDocument (so the host can open it) and an
// ICommandTarget (so the toolbar dispatches to it).
class FakeDoc implements IDocument, ICommandTarget
{
    public readonly Id: string;
    public readonly Title = 'doc';
    public readonly IsDirty = false;
    public CommandContexts: readonly ServiceToken<unknown>[];
    public readonly executed: CommandDefinition[] = [];
    public canRun = true;

    constructor(id: string, contexts: readonly ServiceToken<unknown>[])
    {
        this.Id = id;
        this.CommandContexts = contexts;
    }

    public Save(): void { /* no-op */ }
    public Execute(def: CommandDefinition): void { this.executed.push(def); }
    public CanExecute(_def: CommandDefinition): boolean { return this.canRun; }
}

function appWith(...cmds: CommandDefinition[]): Application
{
    const mod = new ShellModule();
    for (const c of cmds) mod.Commands.Add(c);
    const app = new Application();
    app.Modules.Add(mod);
    app.Services.register(CommandRegistry.Key, p => new CommandRegistry(p));
    app.Services.register(ContentHostService.Key, p => new DocumentsContentHostService(p));
    app.Services.register(ToolbarService.Key, p => new ToolbarService(p));
    return app;
}

function ids(toolbar: ToolbarService): string[]
{
    return [...toolbar.VisibleCommands].map(vm => vm.Definition.Id);
}

describe('ToolbarService visibility', () => {
    test('shows only commands whose context the active document activates', () => {
        const app = appWith(command('c.a1', CTX_A, 0), command('c.a2', CTX_A, 1), command('c.b1', CTX_B, 0));
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        const toolbar = app.Services.getRequired(ToolbarService.Key);

        assert.deepEqual(ids(toolbar), []);            // nothing active yet

        host.Open(new FakeDoc('a', [CTX_A]));
        assert.deepEqual(ids(toolbar), ['c.a1', 'c.a2']);
    });

    test('reflows when the active document changes', () => {
        const app = appWith(command('c.a1', CTX_A), command('c.b1', CTX_B));
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        const toolbar = app.Services.getRequired(ToolbarService.Key);

        host.Open(new FakeDoc('a', [CTX_A]));
        assert.deepEqual(ids(toolbar), ['c.a1']);
        host.Open(new FakeDoc('b', [CTX_B]));
        assert.deepEqual(ids(toolbar), ['c.b1']);
    });

    test('orders survivors by Order', () => {
        const app = appWith(command('c.late', CTX_A, 20), command('c.early', CTX_A, 5));
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        const toolbar = app.Services.getRequired(ToolbarService.Key);
        host.Open(new FakeDoc('a', [CTX_A]));
        assert.deepEqual(ids(toolbar), ['c.early', 'c.late']);
    });

    test('an active document that is not a command target yields an empty toolbar', () => {
        const app = appWith(command('c.a1', CTX_A));
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        const toolbar = app.Services.getRequired(ToolbarService.Key);
        // A plain IDocument (no Execute/CanExecute/CommandContexts).
        host.Open({ Id: 'plain', Title: 'plain', IsDirty: false, Save() { /* */ } });
        assert.deepEqual(ids(toolbar), []);
    });
});

describe('ToolbarService dispatch', () => {
    test('invoking a command executes it on the active document with the definition', () => {
        const app = appWith(command('c.a1', CTX_A));
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        const toolbar = app.Services.getRequired(ToolbarService.Key);
        const doc = new FakeDoc('a', [CTX_A]);
        host.Open(doc);

        toolbar.VisibleCommands.Get(0)!.Command.Execute(undefined);
        assert.equal(doc.executed.length, 1);
        assert.equal(doc.executed[0]!.Id, 'c.a1');
    });

    test('CanExecute reflects the active document', () => {
        const app = appWith(command('c.a1', CTX_A));
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        const toolbar = app.Services.getRequired(ToolbarService.Key);
        const doc = new FakeDoc('a', [CTX_A]);
        host.Open(doc);
        const cmd = toolbar.VisibleCommands.Get(0)!.Command;

        doc.canRun = false;
        assert.equal(cmd.CanExecute(undefined), false);
        doc.canRun = true;
        assert.equal(cmd.CanExecute(undefined), true);
    });
});

// A grouped command with an explicit Group + optional presentation metadata.
function grouped(
    id: string, group: string, order: number,
    opts?: { presentation?: CommandGroupPresentation; groupTitle?: string; columns?: number },
): CommandDefinition
{
    const c = new CommandDefinition();
    c.Id = id;
    c.Title = id;
    c.Context = CTX_A;
    c.Group = group;
    c.Order = order;
    if (opts?.presentation !== undefined) c.Presentation = opts.presentation;
    if (opts?.groupTitle !== undefined)  c.GroupTitle = opts.groupTitle;
    if (opts?.columns !== undefined)     c.Columns = opts.columns;
    return c;
}

// A command target that also reports active-state for a fixed id set.
class TogglingDoc extends FakeDoc
{
    public active = new Set<string>();
    public override IsActive?(def: CommandDefinition): boolean { return this.active.has(def.Id); }
}

describe('ToolbarService grouping', () => {
    test('clusters commands into presentation groups by Group, leader sets the type', () => {
        const app = appWith(
            grouped('align.l', 'align', 10, { presentation: CommandGroupPresentation.SplitMenu, groupTitle: 'Align' }),
            grouped('align.r', 'align', 20),
            grouped('dist.h',  'align', 30),   // rides in the align group
            grouped('place.tl', 'place', 40, { presentation: CommandGroupPresentation.SplitGrid, columns: 3 }),
            grouped('place.t',  'place', 50),
            grouped('bold', 'style', 60, { presentation: CommandGroupPresentation.Toggles }),
            grouped('italic', 'style', 70),
            grouped('grp', 'arrange', 80),     // no presentation → Flat
        );
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        const toolbar = app.Services.getRequired(ToolbarService.Key);
        host.Open(new FakeDoc('a', [CTX_A]));

        const groups = [...toolbar.VisibleEntries] as ToolbarGroupViewModel[];
        assert.equal(groups.length, 4, 'four groups: align, place, style, arrange');

        assert.ok(groups[0] instanceof ToolbarSplitMenuGroup);
        assert.equal(groups[0]!.Title, 'Align');
        assert.deepEqual([...groups[0]!.Items].map(vm => vm.Definition.Id), ['align.l', 'align.r', 'dist.h']);

        assert.ok(groups[1] instanceof ToolbarSplitGridGroup);
        assert.equal(groups[1]!.Columns, 3);

        assert.ok(groups[2] instanceof ToolbarToggleGroup);
        assert.deepEqual([...groups[2]!.Items].map(vm => vm.Definition.Id), ['bold', 'italic']);

        assert.ok(groups[3] instanceof ToolbarFlatGroup);
    });

    test('a toolbar CONTROL interleaves with command groups by Order', () => {
        const mod = new ShellModule();
        mod.Commands.Add(grouped('a', 'g1', 10));
        mod.Commands.Add(grouped('b', 'g2', 30));
        const ctrl = new ShellControlDefinition();
        ctrl.Context = CTX_A;
        ctrl.Order = 20;   // between the two command groups
        mod.ShellControls.Add(ctrl);

        const app = new Application();
        app.Modules.Add(mod);
        app.Services.register(CommandRegistry.Key, p => new CommandRegistry(p));
        app.Services.register(ContentHostService.Key, p => new DocumentsContentHostService(p));
        app.Services.register(ToolbarService.Key, p => new ToolbarService(p));
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        const toolbar = app.Services.getRequired(ToolbarService.Key);
        const doc = new FakeDoc('a', [CTX_A]);
        host.Open(doc);

        const entries = [...toolbar.VisibleEntries];
        assert.equal(entries.length, 3);
        assert.ok(entries[0] instanceof ToolbarFlatGroup);
        assert.ok(entries[1] instanceof ShellControlViewModel);
        assert.ok(entries[2] instanceof ToolbarFlatGroup);
        // The control is bound to the active document.
        assert.equal((entries[1] as ShellControlViewModel).Target, doc);
    });

    test('a StatusBar-region control syncs into StatusService.Items for the active doc', () => {
        const mod = new ShellModule();
        const ctrl = new ShellControlDefinition();
        ctrl.Context = CTX_A;
        ctrl.Region = ShellRegion.StatusBar;
        mod.ShellControls.Add(ctrl);

        const app = new Application();
        app.Modules.Add(mod);
        app.Services.register(CommandRegistry.Key, p => new CommandRegistry(p));
        app.Services.register(ContentHostService.Key, p => new DocumentsContentHostService(p));
        app.Services.register(StatusService.Key, p => new StatusService(p));
        app.Services.register(ToolbarService.Key, p => new ToolbarService(p));
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        app.Services.getRequired(ToolbarService.Key);   // instantiate (wires listeners)
        const status = app.Services.getRequired(StatusService.Key);

        // A StatusBar-region control is NOT in the command bar entries.
        const doc = new FakeDoc('a', [CTX_A]);
        host.Open(doc);
        assert.equal(status.Items.Count, 1);
        assert.ok(status.Items.Get(0) instanceof ShellControlViewModel);
        assert.equal((status.Items.Get(0) as ShellControlViewModel).Target, doc);

        // Switching to a doc that doesn't activate the context removes the cell.
        host.Open(new FakeDoc('b', [CTX_B]));
        assert.equal(status.Items.Count, 0);
    });

    test('IsActive reflects the active document per command, refreshed on requery', () => {
        const app = appWith(
            grouped('bold',   'style', 10, { presentation: CommandGroupPresentation.Toggles }),
            grouped('italic', 'style', 20),
        );
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        const toolbar = app.Services.getRequired(ToolbarService.Key);
        const doc = new TogglingDoc('a', [CTX_A]);
        doc.active.add('bold');
        host.Open(doc);

        const group = [...toolbar.VisibleEntries][0]!;
        const byId = new Map([...group.Items].map(vm => [vm.Definition.Id, vm]));
        assert.equal(byId.get('bold')!.IsActive, true);
        assert.equal(byId.get('italic')!.IsActive, false);

        // Flip the selection state → the requery pulse re-reads IsActive.
        doc.active.delete('bold');
        doc.active.add('italic');
        CommandManager.InvalidateRequerySuggested();
        assert.equal(byId.get('bold')!.IsActive, false);
        assert.equal(byId.get('italic')!.IsActive, true);
    });
});

describe('ToolbarService requery', () => {
    test('the CommandManager pulse re-raises CanExecuteChanged on visible commands', () => {
        const app = appWith(command('c.a1', CTX_A));
        const host = app.Services.getRequired(ContentHostService.Key) as DocumentsContentHostService;
        const toolbar = app.Services.getRequired(ToolbarService.Key);
        host.Open(new FakeDoc('a', [CTX_A]));

        let fired = 0;
        toolbar.VisibleCommands.Get(0)!.Command.AddCanExecuteChangedListener(() => fired++);
        CommandManager.InvalidateRequerySuggested();
        assert.ok(fired >= 1, 'CanExecuteChanged should fire on the requery pulse');
    });
});
