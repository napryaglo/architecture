import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Application, MuralBase, ServiceProvider } from '../../runtime/index.js';
import { initTestApp } from '../../basic/tests/test-app.js';
import { NavigationService, NavigationDestination } from '../shell/services/navigation-service.js';
import { Capability } from '../shell/module.js';

class SvcA extends MuralBase {}
class SvcB extends MuralBase {}

describe('NavigationService — re-selecting a capability (switch back)', () => {
    let nav: NavigationService;
    let destA: NavigationDestination;
    let destB: NavigationDestination;
    let svcA: SvcA;
    let svcB: SvcB;

    beforeEach(() => {
        initTestApp();
        svcA = new SvcA();
        svcB = new SvcB();
        Application.current.Services
            .register(ServiceProvider.tokenFor(SvcA), () => svcA, 'singleton')
            .register(ServiceProvider.tokenFor(SvcB), () => svcB, 'singleton');

        const capA = new Capability(); capA.Name = 'A'; capA.ServiceKey = SvcA;
        const capB = new Capability(); capB.Name = 'B'; capB.ServiceKey = SvcB;
        nav = new NavigationService(Application.current.Services);
        destA = new NavigationDestination(capA);
        destB = new NavigationDestination(capB);
        nav.Items.Add(destA);
        nav.Items.Add(destB);
    });

    test('ActiveService tracks A → B → A (switch away and back)', () => {
        nav.SelectedItem = destA;
        assert.equal(nav.ActiveService, svcA, 'A selected → ActiveService is SvcA');

        nav.SelectedItem = destB;
        assert.equal(nav.ActiveService, svcB, 'B selected → ActiveService is SvcB');

        nav.SelectedItem = destA;
        assert.equal(nav.ActiveService, svcA, 'switch back to A → ActiveService is SvcA again');
    });
});
