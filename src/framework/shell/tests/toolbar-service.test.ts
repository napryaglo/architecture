import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, ServiceKey, type ServiceToken } from '../../../runtime/index.js';
import { ShellModule } from '../module.js';
import { ContentHostService } from '../services/content-host-service.js';
import { DocumentsContentHostService, type IDocument } from '../services/documents-content-host-service.js';
import { CommandManager } from '../../commands/command-manager.js';
import { CommandDefinition } from '../commands/command-definition.js';
import { CommandRegistry } from '../commands/command-registry.js';
import { ToolbarService } from '../commands/toolbar-service.js';
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
