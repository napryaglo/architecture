// node-container-behavior — composite behavior wired to each node
// container after the ItemsControl materializes it. Owns three things:
//
//   1. Port hover state (delegates to port-hover-behavior).
//   2. Port → port wire drag (one port-wire-behavior per port).
//   3. Edge endpoint re-layout on node X/Y changes — subscribes to
//      the NodeVM's X and Y property changes and asks the DiagramVM
//      to recompute attached edges.
//
// All three are bundled here so the bootstrap only deals with one
// attach/detach handle per container. The bootstrap calls this once
// per realized container; the container's lifetime owns the
// behavior's lifetime.
//
// View-tree reaches are confined to this file — the VM and the
// individual behaviors don't reach into template internals.

import { attachPortHover } from './port-hover-behavior.mjs';
import { attachPortWire } from './port-wire-behavior.mjs';

export function attachNodeContainer(container, nodeVm, diagramVm, canvas)
{
    // The template root is one visualChild deep inside the
    // ContentPresenter container; its NameScope holds port0..3 and
    // dot0..3 plus the body chrome.
    const templateRoot = container.visualChildren[0];

    // Port hover — uses container + templateRoot internally.
    const detachHover = attachPortHover(container, nodeVm);

    // Port wires — one per port border. The wire behavior reads
    // canvas-local coords, hence needs a canvas reference too.
    const wireDetachers = [];
    if (templateRoot !== undefined) {
        for (let i = 0; i < 4; i++) {
            const border = templateRoot.FindName('port' + i);
            if (border === undefined) continue;
            wireDetachers.push(attachPortWire(border, nodeVm, canvas, i));
        }
    }

    // Edge layout — when this node's X or Y changes, the VM
    // recomputes endpoints for attached edges. The subscription
    // is a no-op when no edges are attached.
    const onXY = (descriptor) => {
        if (descriptor.Name === 'X' || descriptor.Name === 'Y') {
            diagramVm.relayoutEdgesFor(nodeVm);
        }
    };
    nodeVm._add_property_changed_listener_by_name('X', onXY);
    nodeVm._add_property_changed_listener_by_name('Y', onXY);

    return function detach() {
        detachHover();
        for (const d of wireDetachers) d();
        nodeVm._remove_property_changed_listener_by_name('X', onXY);
        nodeVm._remove_property_changed_listener_by_name('Y', onXY);
    };
}
