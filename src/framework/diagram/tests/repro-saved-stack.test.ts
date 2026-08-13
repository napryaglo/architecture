// Regression: the user's saved-diagram connector stacking. Rebuilds the exact
// node positions + connector (node, side) topology from their diagram.diagram
// and asserts (a) the three shared sides fan into distinct slots on load and
// (b) repositioning an endpoint onto an occupied side fans rather than stacks
// (the itemOf binding fix — reposition must bind to the same VM item a create
// does, not the container Figure, so both share one side registry).

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { initTestApp } from '../../../basic/tests/test-app.js';
import { SideConnectableNodeVM } from '../side-connectable-node-vm.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import { Connector } from '../connector.js';
import { Figure } from '../figure.js';
import { PortSide, type ResolvedPortSide } from '../port.js';
import { ConnectorEnd, RoutingMode } from '../routing/router.js';
import { ConnectorEditAdorner } from '../behaviors/connector-edit-adorner.js';
import { Point } from '../../../visual-engine/index.js';
import '../routing/straight-router.js';
import '../routing/orthogonal-router.js';

const NODES: Record<string, { left: number; top: number }> = {
    component5:  { left: 413.6, top: 448.25 },
    component6:  { left: 115.5, top: 235 },
    n8:          { left: 115.5, top: 460.25 },
    n9:          { left: 264.6, top: 844.5 },
    n10:         { left: 619.5, top: 247 },
    n11:         { left: 351,   top: 66 },
    component7:  { left: 839.5, top: 832.5 },
    component8:  { left: 820.7, top: 448.25 },
    component9:  { left: 1149,  top: 438.25 },
    component10: { left: 827.6, top: 159 },
    n12:         { left: 424,   top: 639.125 },
    n13:         { left: 619.5, top: 460.25 },
};

const EDGES: [string, ResolvedPortSide, string, ResolvedPortSide][] = [
    ['n8', PortSide.S, 'n9', PortSide.N],
    ['component8', PortSide.S, 'component7', PortSide.N],
    ['n10', PortSide.S, 'n13', PortSide.N],
    ['component5', PortSide.S, 'n12', PortSide.N],
    ['n12', PortSide.S, 'n9', PortSide.N],
    ['component10', PortSide.S, 'component8', PortSide.N],
    ['component8', PortSide.E, 'component9', PortSide.W],
    ['component6', PortSide.S, 'n8', PortSide.N],
    ['component6', PortSide.N, 'n11', PortSide.W],
    ['n11', PortSide.E, 'n10', PortSide.N],
    ['n11', PortSide.N, 'component10', PortSide.N],
    ['component6', PortSide.E, 'n11', PortSide.S],
    ['n8', PortSide.W, 'n11', PortSide.W],
    ['n10', PortSide.W, 'n11', PortSide.S],
    ['component5', PortSide.E, 'n13', PortSide.W],
    ['n13', PortSide.E, 'component8', PortSide.W],
    ['n8', PortSide.E, 'component5', PortSide.W],
    ['n9', PortSide.E, 'component7', PortSide.W],
    ['component7', PortSide.E, 'component9', PortSide.S],
];

describe('repro — saved-diagram shared-side fan', () => {
    beforeEach(() => { initTestApp(); });

    test('the three shared sides fan into distinct slots on load', () => {
        const vms: Record<string, SideConnectableNodeVM> = {};
        for (const [id, p] of Object.entries(NODES)) {
            const vm = new SideConnectableNodeVM();
            vm.Left = p.left; vm.Top = p.top; vm.Width = 80; vm.Height = 80;
            vm.Id = id;
            vms[id] = vm;
        }

        const conns: Connector[] = [];
        for (const [s, ss, t, ts] of EDGES) {
            const c = new Connector();
            c.RoutingMode = RoutingMode.Orthogonal;
            c.Source = new ConnectorEndpoint({ Node: vms[s], PortSide: ss });
            c.Target = new ConnectorEndpoint({ Node: vms[t], PortSide: ts });
            conns.push(c);
        }

        // The three sides that host two connectors each.
        for (const [id, side] of [['n9', PortSide.N], ['n11', PortSide.W], ['n11', PortSide.S]] as const) {
            const count = vms[id]!.GetSideEndpointCount(side);
            assert.equal(count, 2, `${id}|${side} should host 2 connectors`);
        }

        // And each pair occupies distinct slot indices (no stacking).
        const slotIdx = (id: string, side: ResolvedPortSide): number[] =>
            conns
                .flatMap(c => [c.Source, c.Target])
                .filter((e): e is ConnectorEndpoint => e !== undefined && e.Node === vms[id] && e.PortSide === side)
                .map(e => vms[id]!.GetSideSlot(e, side)?.index ?? -1);

        for (const [id, side] of [['n9', PortSide.N], ['n11', PortSide.W], ['n11', PortSide.S]] as const) {
            const idxs = slotIdx(id, side).sort();
            assert.deepEqual(idxs, [0, 1], `${id}|${side} connectors must occupy distinct slots 0 and 1`);
        }
    });

    test('repositioning a connector endpoint onto a side that a sibling already holds FANS, not stacks', () => {
        // The exact user gesture: node N already hosts connector B on its N side
        // (B bound to the node VM, as created). The user drags connector A's
        // endpoint onto that same N side. The drop resolves a CONTAINER Figure
        // whose DataContext is the VM. A must bind to the VM (like B) so both
        // share ONE side registry and fan — not to the container (a second
        // registry) which lands A on the side centre atop B.
        const diamond = new SideConnectableNodeVM();
        diamond.Left = 300; diamond.Top = 300; diamond.Width = 80; diamond.Height = 80;
        diamond.Id = 'diamond';
        const other = new SideConnectableNodeVM();
        other.Left = 300; other.Top = 0; other.Width = 80; other.Height = 80; other.Id = 'other';
        const src = new SideConnectableNodeVM();
        src.Left = 0; src.Top = 300; src.Width = 80; src.Height = 80; src.Id = 'src';

        // B: already on diamond's N side (VM-bound, like a created connector).
        const b = new Connector();
        b.RoutingMode = RoutingMode.Orthogonal;
        b.Source = new ConnectorEndpoint({ Node: other,   PortSide: PortSide.S });
        b.Target = new ConnectorEndpoint({ Node: diamond, PortSide: PortSide.N });

        // A: currently on diamond's W side; we'll reposition its target to N.
        const a = new Connector();
        a.RoutingMode = RoutingMode.Orthogonal;
        a.Source = new ConnectorEndpoint({ Node: src,     PortSide: PortSide.E });
        a.Target = new ConnectorEndpoint({ Node: diamond, PortSide: PortSide.W });

        // The drop target the interaction hands the adorner is the CONTAINER
        // Figure whose DataContext is the diamond VM (arch nodes render this way).
        const container = new Figure();
        container.Left = 300; container.Top = 300; container.Width = 80; container.Height = 80;
        container.ExplicitPorts = [];
        container.DataContext = diamond;

        const adorner = new ConnectorEditAdorner();
        adorner.BeginEndpointDrag(a, ConnectorEnd.Target, new Point(340, 340));
        adorner.EndDragOverTarget(container, PortSide.N);

        // A's target must now reference the VM, and diamond's N side hosts BOTH.
        assert.equal(a.Target!.Node, diamond, 'repositioned endpoint binds to the VM item, not the container');
        assert.equal(diamond.GetSideEndpointCount(PortSide.N), 2, 'both connectors register on the SAME side registry');
        const ia = diamond.GetSideSlot(a.Target as ConnectorEndpoint, PortSide.N)?.index;
        const ib = diamond.GetSideSlot(b.Target as ConnectorEndpoint, PortSide.N)?.index;
        assert.ok(ia !== undefined && ib !== undefined && ia !== ib, 'they occupy distinct slots (no centre stack)');
    });
});
