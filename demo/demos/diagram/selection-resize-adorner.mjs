// SelectionResizeAdorner — single Adorner that hosts the selection
// bbox indicator and 8 resize handles. Lives in the SCP's inner
// AdornerLayer (via AdornerLayer.GetAdornerLayer(itemsPanel)), so it
// rides the scroll translation automatically — no behavior code needed
// to make handles follow scrolling content.
//
// Adornment target: the Diagram's ItemsPanelInstance (the
// PaginatedCanvas). Layer-local frame for an adorner of the items panel
// is canvas-local frame, so child positions are written directly in
// the same coordinate space DiagramNodes use for Canvas.Left / Top.
//
// Hit-testing: adorner itself is IsHitTestVisible=false so the bbox
// region passes pointer events through to shapes underneath. Each
// handle child is IsHitTestVisible=true (the default for Visual), and
// the renderer's pad-level `pointer-events="all"` overrides the
// inherited "none" from the adorner outer — so only the 8 handle pads
// catch pointer events. Bbox Border, being IsHitTestVisible=false too,
// matches the adorner's transparent-to-pointers semantic.
//
// Property surface:
//   * `vm.Selection{X,Y,Width,Height,Count}` — adorner subscribes to all
//                                              five; any change calls
//                                              InvalidateArrange so the
//                                              next layout pass re-reads
//                                              and re-positions children.
//   * `vm.BeginSelectionResize / ApplySelectionResize / EndSelectionResize`
//                                              — invoked by the handle
//                                              pointer pipeline.

import { Adorner, SolidColorBrush } from '@visualisation-sub/mural/visual-engine';
import { Border } from '@visualisation-sub/mural/basic';
import { Color, Rect, Size, Thickness } from '@visualisation-sub/mural/runtime';
import { DiagramVM } from './diagram-vm.mjs';

const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;
const HIDE_OFFSCREEN = -10000;

// Each handle anchors the OPPOSITE side of the selection bbox — the
// natural "bbox-edge follows handle" feel: drag the W handle left and
// the LEFT edge moves left (X decreases, W grows) while the RIGHT edge
// stays put; SE handle drags grow W/H with the NW corner fixed; etc.
//
//   dwDir, dhDir : ∈ {-1, 0, +1}. Multiplied by pointer (dx, dy) to
//                   derive (dw, dh). SE = (+1, +1). NW = (-1, -1).
//                   Edge handles zero one axis (E: dhDir=0; N: dwDir=0).
//   xAnchor      : 'left' (X stays) | 'right' (right edge stays) |
//                   'none' (W doesn't change so X can't either).
//   yAnchor      : 'top' / 'bottom' / 'none'.
//   cursor       : CSS cursor keyword stamped on the handle Visual so
//                   the OS cursor matches the drag axis on hover and
//                   during the drag (the renderer mirrors the DP onto
//                   the outer <g>'s `cursor` attribute). N/S = ns-resize,
//                   E/W = ew-resize, NW/SE = nwse-resize, NE/SW = nesw-
//                   resize — the standard CSS resize-cursor set.
const HANDLE_SPEC = [
    { name: 'NW', dwDir: -1, dhDir: -1, xAnchor: 'right', yAnchor: 'bottom', cursor: 'nwse-resize' },
    { name: 'N',  dwDir:  0, dhDir: -1, xAnchor: 'none',  yAnchor: 'bottom', cursor: 'ns-resize'   },
    { name: 'NE', dwDir:  1, dhDir: -1, xAnchor: 'left',  yAnchor: 'bottom', cursor: 'nesw-resize' },
    { name: 'W',  dwDir: -1, dhDir:  0, xAnchor: 'right', yAnchor: 'none',   cursor: 'ew-resize'   },
    { name: 'E',  dwDir:  1, dhDir:  0, xAnchor: 'left',  yAnchor: 'none',   cursor: 'ew-resize'   },
    { name: 'SW', dwDir: -1, dhDir:  1, xAnchor: 'right', yAnchor: 'top',    cursor: 'nesw-resize' },
    { name: 'S',  dwDir:  0, dhDir:  1, xAnchor: 'none',  yAnchor: 'top',    cursor: 'ns-resize'   },
    { name: 'SE', dwDir:  1, dhDir:  1, xAnchor: 'left',  yAnchor: 'top',    cursor: 'nwse-resize' },
];

// Hardcoded colors — TODO swap for runtime theme lookup if the diagram
// surface ever supports dark mode. @Primary equivalent for outlines,
// @OnPrimary equivalent for handle fill.
const STROKE = new SolidColorBrush(Color.FromHex('#1976d2'));
const FILL   = new SolidColorBrush(Color.FromHex('#ffffff'));

const HANDLE_ANCHORS = {
    NW: (x, y, w, h) => [x,         y        ],
    N:  (x, y, w, h) => [x + w / 2, y        ],
    NE: (x, y, w, h) => [x + w,     y        ],
    W:  (x, y, w, h) => [x,         y + h / 2],
    E:  (x, y, w, h) => [x + w,     y + h / 2],
    SW: (x, y, w, h) => [x,         y + h    ],
    S:  (x, y, w, h) => [x + w / 2, y + h    ],
    SE: (x, y, w, h) => [x + w,     y + h    ],
};

export class SelectionResizeAdorner extends Adorner
{
    constructor(itemsPanel, vm)
    {
        super(itemsPanel);
        this._vm = vm;

        // Adorner pad transparent → empty bbox region passes through to
        // adorned shapes. Handles opt back in because their own pad
        // gets explicit "all" from IsHitTestVisible=true (default).
        this.IsHitTestVisible = false;

        // Bbox indicator — 1 px @Primary outline, no fill. Width / Height
        // set in ArrangeOverride from vm.Selection{Width,Height}.
        this._bbox = new Border();
        this._bbox.BorderBrush     = STROKE;
        this._bbox.BorderThickness = new Thickness(1);
        this._bbox.IsHitTestVisible = false;
        this.AttachVisual(this._bbox);

        // 8 handle Borders. Each is hit-test-visible by default; the
        // pointer pipeline below captures + drives the VM resize trio.
        this._handles = [];
        for (const spec of HANDLE_SPEC)
        {
            const visual = new Border();
            visual.Background      = FILL;
            visual.BorderBrush     = STROKE;
            visual.BorderThickness = new Thickness(1);
            visual.Width  = HANDLE_SIZE;
            visual.Height = HANDLE_SIZE;
            visual.Cursor = spec.cursor;
            this.AttachVisual(visual);
            this._handles.push({ spec, visual });
            this._wireHandlePointer(visual, spec);
        }

        // Drag state. Snapshotted on PointerDown; cleared on PointerUp.
        // Shared across all handles because only one drag is live at a
        // time — captured pointer guarantees it.
        this._dragSpec   = null;
        this._pressHostX = 0;
        this._pressHostY = 0;

        // Re-arrange on every Selection* DP change. The layer's
        // ArrangeOverride re-runs the adorner's ArrangeOverride, which
        // reads the live DP values and repositions everything.
        this._onChange = () => this.InvalidateArrange();
        vm.AddPropertyChangedListener(DiagramVM.SelectionXKey,      this._onChange);
        vm.AddPropertyChangedListener(DiagramVM.SelectionYKey,      this._onChange);
        vm.AddPropertyChangedListener(DiagramVM.SelectionWidthKey,  this._onChange);
        vm.AddPropertyChangedListener(DiagramVM.SelectionHeightKey, this._onChange);
        vm.AddPropertyChangedListener(DiagramVM.SelectionCountKey,  this._onChange);
    }

    get visualChildren()
    {
        return [this._bbox, ...this._handles.map(h => h.visual)];
    }

    // Default Placement returns adornedRect — which the layer computes
    // as the items panel's position in layer-local coords. That gives us
    // a finalSize equal to the canvas extent; child positions inside us
    // map 1-to-1 to canvas coordinates.

    MeasureOverride(_available)
    {
        const big = new Size(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        this._bbox.Measure(big);
        for (const h of this._handles) h.visual.Measure(big);
        // Adorner's own desired size doesn't drive anything — Placement
        // chooses the final rect from the adorned element.
        return Size.Zero;
    }

    ArrangeOverride(finalSize)
    {
        const x    = this._vm.SelectionX;
        const y    = this._vm.SelectionY;
        const w    = this._vm.SelectionWidth;
        const h    = this._vm.SelectionHeight;
        const hide = this._vm.SelectionCount === 0;

        if (hide)
        {
            // Width / Height = 0 collapses the bbox Border to a non-
            // painting rect. Handles go far off-screen so their pads
            // can't accidentally catch hits.
            this._bbox.Arrange(new Rect(0, 0, 0, 0));
            for (const handle of this._handles)
            {
                handle.visual.Arrange(new Rect(
                    HIDE_OFFSCREEN, HIDE_OFFSCREEN, HANDLE_SIZE, HANDLE_SIZE));
            }
            return finalSize;
        }

        this._bbox.Arrange(new Rect(x, y, w, h));
        for (const handle of this._handles)
        {
            const [ax, ay] = HANDLE_ANCHORS[handle.spec.name](x, y, w, h);
            handle.visual.Arrange(new Rect(
                ax - HANDLE_HALF, ay - HANDLE_HALF,
                HANDLE_SIZE, HANDLE_SIZE));
        }
        return finalSize;
    }

    _wireHandlePointer(visual, spec)
    {
        // PointerDown captures + snapshots host coords + tells the VM
        // to record initial geometry of every selected entity. The VM
        // owns the snapshot; this adorner stays state-light.
        //
        visual.AddRoutedEventListener('PointerDown', (args) => {
            this._vm.BeginSelectionResize();
            this._dragSpec   = spec;
            this._pressHostX = args.HostX;
            this._pressHostY = args.HostY;
            // Second arg locks the OS cursor for the capture duration —
            // InputManager → HtmlTarget bridge stamps it on document.body
            // so it survives the pointer wandering over shapes / empty
            // canvas / scrollbars during the drag. Auto-released by the
            // matching PointerUp.
            args.CapturePointer(visual, spec.cursor);
            args.Handled = true;
        });
        // PointerMove computes (dw, dh) and forwards to the VM. The
        // dragSpec guard skips Move events for OTHER handles' captures
        // (defensive — capture should make this impossible).
        visual.AddRoutedEventListener('PointerMove', (args) => {
            if (this._dragSpec !== spec) return;
            const dx = args.HostX - this._pressHostX;
            const dy = args.HostY - this._pressHostY;
            const dw = spec.dwDir * dx;
            const dh = spec.dhDir * dy;
            this._vm.ApplySelectionResize(dw, dh, spec.xAnchor, spec.yAnchor);
            args.Handled = true;
        });
        visual.AddRoutedEventListener('PointerUp', (args) => {
            if (this._dragSpec !== spec) return;
            this._dragSpec = null;
            this._vm.EndSelectionResize();
            args.ReleasePointerCapture();
            args.Handled = true;
        });
    }

    // Tears down the VM listeners. Caller is responsible for invoking
    // this AFTER removing the adorner from its layer (matches the doc
    // contract for adorners that hold subscriptions). Per-handle routed
    // listeners die with the handle visuals when the adorner is detached
    // — no explicit cleanup needed.
    Dispose()
    {
        this._vm.RemovePropertyChangedListener(DiagramVM.SelectionXKey,      this._onChange);
        this._vm.RemovePropertyChangedListener(DiagramVM.SelectionYKey,      this._onChange);
        this._vm.RemovePropertyChangedListener(DiagramVM.SelectionWidthKey,  this._onChange);
        this._vm.RemovePropertyChangedListener(DiagramVM.SelectionHeightKey, this._onChange);
        this._vm.RemovePropertyChangedListener(DiagramVM.SelectionCountKey,  this._onChange);
    }
}
