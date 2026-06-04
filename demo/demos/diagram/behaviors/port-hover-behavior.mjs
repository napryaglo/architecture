// port-hover-behavior — view-layer logic for the diagram node's
// hover-to-reveal ports. Attaches to a single node container after the
// ItemsControl materializes it; subscribes to PointerEnter / PointerLeave
// on the body and on each of the four port borders; maintains a hide-
// delay timer so a brief pointer excursion between body and port doesn't
// snap the ports away.
//
// Rules-of-the-road for this file (per CLAUDE.md MVVM rules — the
// "Behavior" escape hatch):
//   * Behavior files MAY do `FindName`, `AddRoutedEventListener`, and
//     mutate Visual properties — that's exactly what the VM rules
//     forbid the VM from doing.
//   * Behaviors NEVER hold their own domain state. They translate view
//     events into VM DP writes. Here the only "output" of the behavior
//     is `nodeVm.PortsVisible = ...` (plus chrome-brush writes that
//     belong with the view as visualization).
//
// Lifecycle:
//   const detach = attachPortHover(container, nodeVm);
//   …
//   detach();  // ItemsControl container recycling / node remove
//
// Usage from the demo bootstrap (NOT from the VM):
//   nodesIC.AddRoutedEventListener('ContainerRealized', (args) => {
//       const detach = attachPortHover(args.Container, args.Item);
//       containerDetachers.set(args.Container, detach);
//   });

import { SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { Color } from '@visualisation-sub/mural/runtime';

const brush = (hex) => new SolidColorBrush(Color.FromHex(hex));

const PORT_FILL_IDLE  = brush('#94a3b8');
const PORT_FILL_HOVER = brush('#1976d2');
const PORT_BG         = brush('#ffffff');

const HIDE_DELAY_MS = 80;

export function attachPortHover(container, nodeVm)
{
    // The template's root sits one visualChild deep inside the
    // generated ContentPresenter. The four ports are named port0..3
    // and port-dots dot0..3 on the template root's NameScope.
    const templateRoot = container.visualChildren[0];
    if (templateRoot === undefined) return () => {};

    const ports = [];
    for (let i = 0; i < 4; i++)
    {
        const border = templateRoot.FindName('port' + i);
        const dot    = templateRoot.FindName('dot' + i);
        if (border === undefined || dot === undefined) continue;
        ports.push({ border, dot });
    }
    if (ports.length === 0) return () => {};

    // Local view state — counts and timer. Not on the VM; the VM
    // doesn't care which port is mid-hover, only whether the ports
    // as a group should be visible (via PortsVisible).
    let bodyHovered = false;
    let portHoverCount = 0;
    let hideTimer = null;

    const setVisible = (visible) => {
        for (const { border, dot } of ports)
        {
            if (visible)
            {
                border.Background  = PORT_BG;
                border.BorderBrush = PORT_FILL_IDLE;
                dot.Fill           = PORT_FILL_IDLE;
            }
            else
            {
                border.Background  = undefined;
                border.BorderBrush = undefined;
                dot.Fill           = undefined;
            }
        }
        nodeVm.PortsVisible = visible;
    };

    const refreshActive = () => {
        const active = bodyHovered || portHoverCount > 0;
        if (active)
        {
            if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
            if (!nodeVm.PortsVisible) setVisible(true);
        }
        else if (nodeVm.PortsVisible && hideTimer === null)
        {
            hideTimer = setTimeout(() => {
                hideTimer = null;
                if (!(bodyHovered || portHoverCount > 0)) setVisible(false);
            }, HIDE_DELAY_MS);
        }
    };

    // Body hover — listen on the container so the pointer entering
    // any part of the node body (including its template's internal
    // children) counts as a body hover.
    const onBodyEnter = () => { bodyHovered = true;  refreshActive(); };
    const onBodyLeave = () => { bodyHovered = false; refreshActive(); };
    container.AddRoutedEventListener('PointerEnter', onBodyEnter);
    container.AddRoutedEventListener('PointerLeave', onBodyLeave);

    // Per-port hover. Holding a per-port "hovered" flag instead of
    // tracking count would mis-fire on rapid leave-enter sequences
    // across adjacent ports; a counter handles that without per-port
    // bookkeeping.
    const portUnsubs = [];
    for (const { border, dot } of ports)
    {
        const onEnter = () => {
            portHoverCount++;
            refreshActive();
            if (nodeVm.PortsVisible)
            {
                border.BorderBrush = PORT_FILL_HOVER;
                dot.Fill           = PORT_FILL_HOVER;
            }
        };
        const onLeave = () => {
            if (portHoverCount > 0) portHoverCount--;
            refreshActive();
            if (nodeVm.PortsVisible)
            {
                border.BorderBrush = PORT_FILL_IDLE;
                dot.Fill           = PORT_FILL_IDLE;
            }
        };
        border.AddRoutedEventListener('PointerEnter', onEnter);
        border.AddRoutedEventListener('PointerLeave', onLeave);
        portUnsubs.push(() => {
            border.RemoveRoutedEventListener('PointerEnter', onEnter);
            border.RemoveRoutedEventListener('PointerLeave', onLeave);
        });
    }

    // Initial state — ports hidden until hover.
    setVisible(false);

    return function detach() {
        if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
        container.RemoveRoutedEventListener('PointerEnter', onBodyEnter);
        container.RemoveRoutedEventListener('PointerLeave', onBodyLeave);
        for (const unsub of portUnsubs) unsub();
    };
}
