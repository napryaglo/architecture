import { Diagram } from '../diagram.js';
import { Point } from '../../../visual-engine/primitives.js';
import { hasModifier, ModifierKeys, PointerButton, WheelDeltaMode } from '../../../runtime/index.js';
import { zoomAtPoint } from '../camera.js';

// Wheel zoom sensitivity: multiplicative factor per normalized delta pixel.
const ZOOM_PER_PX = 1.0015;

// Normalize a wheel delta to pixels so line/page-mode wheels behave like pixel
// wheels (mirrors ScrollViewer's line-step of 16).
function scaleFor(mode: WheelDeltaMode): number {
    return mode === WheelDeltaMode.Line ? 16 : mode === WheelDeltaMode.Page ? 400 : 1;
}

// A host point (HostX/HostY) in PART_Camera's pre-transform local frame — the
// frame the camera's pan is expressed in. Sum ArrangedRect offsets from the
// camera host up to the root (the camera RenderTransform applies inside that
// frame, so it is NOT part of this offset).
function cameraPivot(diagram: Diagram, hostX: number, hostY: number): Point {
    let ox = 0, oy = 0;
    let cur = diagram.GetTemplateChild('PART_Camera');
    while (cur !== undefined) { ox += cur.ArrangedRect.X; oy += cur.ArrangedRect.Y; cur = cur.GetVisualParent(); }
    return new Point(hostX - ox, hostY - oy);
}

// Installs camera gesture handling on a Diagram: Ctrl/⌘+wheel (and pinch, which
// platforms deliver as ctrl+wheel) zooms about the cursor; plain wheel / two-
// finger pans; middle-button drag grab-pans. Returns a detach thunk. The Diagram
// forwards the wheel via OnPointerWheel and the grab via its preview-pointer
// overrides. (Space-hold grab-pan + keyboard zoom are host concerns: the host
// binds Ctrl +/−/0 to the diagram's zoom command DPs.)
export function attachZoomPan(diagram: Diagram): () => void {
    let grabbing = false;
    let lastX = 0, lastY = 0;

    diagram._setCameraHandlers({
        OnWheel(args) {
            const dy = args.DeltaY * scaleFor(args.DeltaMode);
            if (hasModifier(args.Modifiers, ModifierKeys.Control)) {
                const factor = Math.pow(ZOOM_PER_PX, -dy);   // wheel up (negative) = zoom in
                diagram.SetCamera(zoomAtPoint(diagram.Camera, cameraPivot(diagram, args.HostX, args.HostY), factor));
            } else {
                diagram.PanX = diagram.PanX - args.DeltaX * scaleFor(args.DeltaMode);
                diagram.PanY = diagram.PanY - dy;
            }
            args.Handled = true;
        },
        OnGrabStart(args) {
            if (args.Button !== PointerButton.Middle) return;   // middle-drag grab-pan
            grabbing = true; lastX = args.HostX; lastY = args.HostY;
            args.Handled = true;
        },
        OnGrabMove(args) {
            if (!grabbing) return;
            diagram.PanX = diagram.PanX + (args.HostX - lastX);
            diagram.PanY = diagram.PanY + (args.HostY - lastY);
            lastX = args.HostX; lastY = args.HostY;
            args.Handled = true;
        },
        OnGrabEnd() { grabbing = false; },
    });

    return (): void => diagram._setCameraHandlers(undefined);
}
