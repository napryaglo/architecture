import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { SideConnectableNodeVM } from '../side-connectable-node-vm.js';
import { Figure } from '../figure.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import { PortSide } from '../port.js';

describe('SideConnectableNodeVM — side-endpoint host base', () => {
    beforeEach(() => { initTestApp(); });

    test('a bare instance exposes bbox ports and an empty side count', () => {
        const vm = new SideConnectableNodeVM();
        vm.Left = 10; vm.Top = 20; vm.Width = 80; vm.Height = 60;
        assert.equal(vm.Kind, '', 'box VM uses the fallback provider key');
        assert.equal(vm.Ports.length, 4, 'one bbox port per cardinal side');
        assert.deepEqual(
            [vm.ArrangedRect.X, vm.ArrangedRect.Y, vm.ArrangedRect.Width, vm.ArrangedRect.Height],
            [10, 20, 80, 60],
        );
        assert.equal(vm.GetSideEndpointCount(PortSide.E), 0);
    });

    test('endpoints register into slots on a side and rebalance', () => {
        const vm = new SideConnectableNodeVM();
        const a = new ConnectorEndpoint({ Node: vm, PortSide: PortSide.E });
        const b = new ConnectorEndpoint({ Node: vm, PortSide: PortSide.E });
        vm._registerSideEndpoint(PortSide.E, a, () => {});
        vm._registerSideEndpoint(PortSide.E, b, () => {});

        assert.equal(vm.GetSideEndpointCount(PortSide.E), 2);
        assert.deepEqual(vm.GetSideSlot(a, PortSide.E), { index: 0, count: 2 });
        assert.deepEqual(vm.GetSideSlot(b, PortSide.E), { index: 1, count: 2 });

        vm._unregisterSideEndpoint(PortSide.E, a);
        assert.equal(vm.GetSideEndpointCount(PortSide.E), 1);
        assert.deepEqual(vm.GetSideSlot(b, PortSide.E), { index: 0, count: 1 });
    });

    test('a shape Figure implements the host surface and keeps its catalog Kind', () => {
        const fig = Figure.fromKind('rectangle', 0, 0);
        assert.equal(typeof fig.GetSideSlot, 'function', 'a shape Figure is a side host');
        assert.equal(fig.Kind, 'rectangle', 'a shape Figure carries its catalog kind');
        assert.equal(fig.Ports.length, 4);
    });
});
