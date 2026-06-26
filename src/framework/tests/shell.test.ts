import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../runtime/index.js';
import { initTestApp } from '../../basic/tests/test-app.js';

import { Border } from '../../basic/border.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';
import { TextBlock } from '../../basic/text-block.js';
import { Shell, ShellRegion } from '../shell/shell.js';
import { EditorShell } from '../shell/editor-shell.js';
import { ViewerShell } from '../shell/viewer-shell.js';
import { NavigationService } from '../shell/services/navigation-service.js';
import { StatusService } from '../shell/services/status-service.js';

describe('Shell — region attached property', () => {
    beforeEach(() => { initTestApp(); });

    test('Region default is Content', () => {
        const v = new TextBlock('x');
        assert.equal(Shell.GetRegion(v), ShellRegion.Content);
    });

    test('SetRegion / GetRegion round-trip', () => {
        const v = new TextBlock('x');
        Shell.SetRegion(v, ShellRegion.Inspector);
        assert.equal(Shell.GetRegion(v), ShellRegion.Inspector);
    });
});

describe('EditorShell — full region set', () => {
    beforeEach(() => { initTestApp(); });

    test('template exposes every region host', () => {
        const root = new EditorShell().visualChildren[0];
        for (const part of ['PART_HeaderHost', 'PART_CommandHost', 'PART_StatusHost',
                            'PART_NavHost', 'PART_InspectorHost', 'PART_ContentHost']) {
            assert.ok(root.FindName(part) !== undefined, `${part} should be present`);
        }
    });

    test('untagged child routes into Content', () => {
        const shell = new EditorShell();
        const body  = new TextBlock('doc');
        shell.AddChild(body);
        const content = shell.visualChildren[0].FindName('PART_ContentHost') as Border;
        assert.equal(content.visualChildren[0], body);
    });

    test('tagged children route into their region hosts', () => {
        const shell  = new EditorShell();
        const menu   = new TextBlock('menu');
        const insp   = new TextBlock('props');
        Shell.SetRegion(menu, ShellRegion.Commands);
        Shell.SetRegion(insp, ShellRegion.Inspector);
        shell.AddChild(menu);
        shell.AddChild(insp);
        const root = shell.visualChildren[0];
        assert.ok((root.FindName('PART_CommandHost') as StackPanel).visualChildren.includes(menu));
        assert.equal((root.FindName('PART_InspectorHost') as Border).visualChildren[0], insp);
    });
});

describe('ViewerShell — readonly subset', () => {
    beforeEach(() => { initTestApp(); });

    test('provides Header / Navigation / Content but no editor regions', () => {
        const root = new ViewerShell().visualChildren[0];
        assert.ok(root.FindName('PART_HeaderHost')  !== undefined);
        assert.ok(root.FindName('PART_NavHost')     !== undefined);
        assert.ok(root.FindName('PART_ContentHost') !== undefined);
        assert.equal(root.FindName('PART_CommandHost'),   undefined);
        assert.equal(root.FindName('PART_InspectorHost'), undefined);
        assert.equal(root.FindName('PART_StatusHost'),    undefined);
    });

    test('tagging a child for a missing region throws', () => {
        const shell = new ViewerShell();
        const insp  = new TextBlock('props');
        Shell.SetRegion(insp, ShellRegion.Inspector);
        assert.throws(() => shell.AddChild(insp), /has no 'Inspector' region/);
    });
});

describe('Shell — region services', () => {
    beforeEach(() => {
        initTestApp();
        // Register the region services app-wide as `scoped`, so every
        // shell scope instantiates its own. registerScoped overwrites
        // idempotently on the process-shared app.
        Application.current.Services
            .registerScoped(NavigationService.Key, (p) => new NavigationService(p))
            .registerScoped(StatusService.Key,     (p) => new StatusService(p));
    });

    test('region host DataContext is the resolved service', () => {
        const shell = new EditorShell();
        const navHost    = shell.visualChildren[0].FindName('PART_NavHost')    as Border;
        const statusHost = shell.visualChildren[0].FindName('PART_StatusHost') as Border;
        assert.equal(navHost.DataContext,    shell.Services.get(NavigationService.Key));
        assert.equal(statusHost.DataContext, shell.Services.get(StatusService.Key));
        assert.ok(navHost.DataContext instanceof NavigationService);
    });

    test('Content region (no service) keeps inherited DataContext', () => {
        const shell = new EditorShell();
        const content = shell.visualChildren[0].FindName('PART_ContentHost') as Border;
        assert.equal(content.DataContext, undefined);
    });

    test('each shell gets its own scoped service instance', () => {
        const a = new EditorShell();
        const b = new EditorShell();
        const navA = a.Services.get(NavigationService.Key);
        const navB = b.Services.get(NavigationService.Key);
        assert.ok(navA !== undefined && navB !== undefined);
        assert.notEqual(navA, navB);
    });

    test('Dispose tears down the scope, disposing its services', () => {
        let disposed = false;
        class SpyNav extends NavigationService {
            public override Dispose(): void { disposed = true; super.Dispose(); }
        }
        // Register the spy at the root before constructing, so the shell's
        // scope resolves (and caches) it on the ctor's bind pass.
        Application.current.Services.registerScoped(NavigationService.Key, () => new SpyNav());
        const shell = new EditorShell();
        const nav = shell.visualChildren[0].FindName('PART_NavHost') as Border;
        assert.ok(nav.DataContext instanceof SpyNav);
        shell.Dispose();
        assert.equal(disposed, true);
    });
});
