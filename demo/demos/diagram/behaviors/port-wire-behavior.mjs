// port-wire-behavior — wires port → port drag with an author-rendered
// rubber-band line (mode B preview).
//
// Each port border on a node container gets one attach. The behavior:
//   1. Listens for PointerDown on the port border.
//   2. Calls args.BeginDragDrop with FMT_PORT data and Link effect,
//      asking the framework to skip its built-in preview (preview=null).
//   3. Allocates a Line under the canvas; updates its X2/Y2 on each
//      session.OnMove tick using canvas-local coords.
//   4. Removes the Line in session.then() after the session resolves.
//
// The drop-side dispatch (adding the edge) happens in
// canvas-drop-behavior — this behavior only handles the source side.

import { Line, Canvas } from '@visualisation-sub/mural/Controls';
import { SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { Color, DataObject, DragDropEffects } from '@visualisation-sub/mural/runtime';

const FMT_PORT = 'mural/port';

const GHOST_STROKE = new SolidColorBrush(Color.FromHex('#1976d2'));

const NODE_W = 130;
const NODE_H = 60;

function hostTopLeft(visual) {
    let x = 0, y = 0, cur = visual;
    while (cur !== undefined) {
        const r = cur.ArrangedRect;
        x += r.X;
        y += r.Y;
        cur = cur.GetVisualParent();
    }
    return { x, y };
}

function portPositions(node) {
    const x = node.X, y = node.Y, w = NODE_W, h = NODE_H;
    return [
        { x: x + w / 2, y: y         },
        { x: x + w,     y: y + h / 2 },
        { x: x + w / 2, y: y + h     },
        { x: x,         y: y + h / 2 },
    ];
}

// `portIndex` is which of the four ports this is (0=top, 1=right,
// 2=bottom, 3=left). The drag-data payload carries it so receivers
// (canvas-drop-behavior) can resolve the source end.
export function attachPortWire(portBorder, nodeVm, canvas, portIndex)
{
    const onPointerDown = (args) => {
        args.Handled = true;

        const origin = hostTopLeft(canvas);
        const local = (hostX, hostY) => ({
            x: hostX - origin.x, y: hostY - origin.y,
        });

        const positions = portPositions(nodeVm);
        const ghost = new Line();
        ghost.Stroke = GHOST_STROKE;
        ghost.StrokeThickness = 2;
        Canvas.SetLeft(ghost, 0);
        Canvas.SetTop (ghost, 0);
        canvas.AddChild(ghost);
        ghost.X1 = positions[portIndex].x;
        ghost.Y1 = positions[portIndex].y;
        const down = local(args.HostX, args.HostY);
        ghost.X2 = down.x;
        ghost.Y2 = down.y;

        const data = new DataObject().Set(FMT_PORT, {
            nodeId: nodeVm.Id,
            side:   portIndex,
        });
        const session = args.BeginDragDrop(data, DragDropEffects.Link, {
            preview: null,             // mode B — we render the ghost
        });

        session.OnMove((hostX, hostY) => {
            const p = local(hostX, hostY);
            ghost.X2 = p.x;
            ghost.Y2 = p.y;
        });
        session.then(() => {
            canvas.RemoveChild(ghost);
        });
    };

    portBorder.AddRoutedEventListener('PointerDown', onPointerDown);
    return function detach() {
        portBorder.RemoveRoutedEventListener('PointerDown', onPointerDown);
    };
}
