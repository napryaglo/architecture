import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../runtime/index.js';
import { initTestApp } from '../../basic/tests/test-app.js';

import { Border } from '../../basic/border.js';
import { EditorShell } from '../shell/editor-shell.js';
import { ViewerShell } from '../shell/viewer-shell.js';
import { NavigationService } from '../shell/services/navigation-service.js';
import { StatusService } from '../shell/services/status-service.js';
import { ApplicationSettings } from '../shell/services/application-settings-service.js';
import { NavigationRail } from '../navigation/navigation-rail.js';

describe('EditorShell — full region set', () => {
    beforeEach(() => { initTestApp(); });

    test('template exposes every region host', () => {
        const root = new EditorShell().visualChildren[0];
        for (const part of ['PART_HeaderHost', 'PART_CommandHost', 'PART_StatusHost',
                            'PART_NavHost', 'PART_InspectorHost', 'PART_ContentHost']) {
            assert.ok(root.FindName(part) !== undefined, `${part} should be present`);
        }
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

    test('region host DataContext resolves the scoped service via the markup $service binding', () => {
        const shell = new EditorShell();
        const navHost    = shell.visualChildren[0].FindName('PART_NavHost')    as Border;
        const statusHost = shell.visualChildren[0].FindName('PART_StatusHost') as Border;
        // The hosts bind `DataContext = $service(...)` in the shell template;
        // the binding resolves against the shell's published ServiceScope.
        assert.equal(navHost.DataContext,    shell.Services.get(NavigationService.Key));
        assert.equal(statusHost.DataContext, shell.Services.get(StatusService.Key));
        assert.ok(navHost.DataContext instanceof NavigationService);
    });

    test('Navigation host is an activity-bar rail bound to the service destinations', () => {
        const shell = new EditorShell();
        const navHost = shell.visualChildren[0].FindName('PART_NavHost');
        assert.ok(navHost instanceof NavigationRail, 'PART_NavHost is a NavigationRail');
        // The rail's `DataContext = $service(NavigationService)` resolved to the
        // shell-scoped service; `ItemsSource = $Items` then bound to its live
        // destinations collection.
        const svc = navHost.DataContext as NavigationService;
        assert.ok(svc instanceof NavigationService);
        assert.equal(navHost.ItemsSource, svc.Items);
    });

    test('EditorShell auto-provides ApplicationSettings (aggregates module settings)', () => {
        // No app-level registration — the shell supplies the default, like it does
        // for NavigationService / ContentHostService. Resolving it builds the
        // service (PopulateFromModules over Application.current.Modules).
        const shell = new EditorShell();
        const settings = shell.Services.get(ApplicationSettings.Key);
        assert.ok(settings instanceof ApplicationSettings);
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
        // scope resolves (and caches) it when the markup binding resolves.
        Application.current.Services.registerScoped(NavigationService.Key, () => new SpyNav());
        const shell = new EditorShell();
        const nav = shell.visualChildren[0].FindName('PART_NavHost') as Border;
        assert.ok(nav.DataContext instanceof SpyNav);
        shell.Dispose();
        assert.equal(disposed, true);
    });
});
