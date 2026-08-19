import {
    Rect, AlignmentAxis, EdgeKind,
    snapGuidePosition, snapRectToGuides,
    type PointerEventArgs, type Visual, type PersistentGuide, type GuideGlue, type GuideSnap,
} from '../../../runtime/index.js';
import { Orientation } from '../../../basic/index.js';
import { Figure } from '../figure.js';
import { NodeViewModel } from '../node-view-model.js';
import { RulerBar } from '../guides/ruler-bar.js';
import { DiagramSettings } from '../diagram-settings.js';
import type { Diagram } from '../diagram.js';

// The interaction coordinator for persistent (Visio-style) ruler guides. Mirrors
// alignment-guides-behavior: installs a preview-phase pointer interceptor (Figure
// swallows the bubble pass by setting Handled, so drag start/end must be observed
// in the tunnel phase) and composes a PositionSnap link. Owns two modes:
//   * a guide drag (create from a ruler / reposition an existing guide), driven by
//     this behavior's own pointer loop; and
//   * a node drag (observe a Figure drag to snap it to guides + form/break glue).
// The Diagram forwards its OnPreviewPointer{Down,Move,Up} virtuals to the handler
// bundle installed via _setPersistentGuidesHandlers.

// The four pointer virtuals the Diagram delegates to. `unknown` args mirror the
// connector/alignment handler bundles so the Diagram stays decoupled from the
// concrete args type at the dispatch site.
export interface PersistentGuidesHandlers
{
    OnPreviewPointerDown(args: unknown): void;
    OnPreviewPointerMove(args: unknown): void;
    OnPreviewPointerUp  (args: unknown): void;
}

enum Mode { None, Create, Reposition, NodeDrag }

/** @internal */
export function attachPersistentGuides(diagram: Diagram): () => void
{
    let mode = Mode.None;
    let axis = AlignmentAxis.X;
    let guideIndex = -1;                 // Create / Reposition target index in Guides
    let lastPos = 0;                     // last committed guide position (glue delta base)
    let activeNode: Figure | undefined;  // NodeDrag: the container being dragged

    const previousSnap = diagram.PositionSnap;
    diagram.PositionSnap = (rect: Rect): Rect => {
        const base = previousSnap !== undefined ? previousSnap(rect) : rect;
        if (mode !== Mode.NodeDrag || activeNode === undefined) return base;
        return snapRectToGuides(base, diagram.Guides, DiagramSettings.GuideGrabTolerance()).snapped;
    };

    const nodeIdOf = (item: unknown): string | undefined => {
        const id = item instanceof Figure ? item.Id
            : item instanceof NodeViewModel ? item.Id
            : undefined;
        return id !== undefined && id !== '' ? id : undefined;
    };

    const findAncestor = <T>(v: unknown, ctor: new (...a: never[]) => T): T | undefined => {
        let cur = v as { GetVisualParent?(): Visual | undefined } | undefined;
        while (cur !== undefined && cur !== null)
        {
            if (cur instanceof ctor) return cur;
            cur = (cur as { GetVisualParent?(): Visual | undefined }).GetVisualParent?.();
        }
        return undefined;
    };

    const contentPoint = (args: PointerEventArgs): { x: number; y: number } => {
        const p = diagram.HostToContent(args.HostX, args.HostY);
        return { x: p.X, y: p.Y };
    };

    // Content-space rects of every realized node container — snap targets for a
    // guide being placed/moved. Mirrors alignment behavior's collectOtherRects.
    const otherRects = (): Rect[] => {
        const out: Rect[] = [];
        const items = diagram.ItemsSource;
        if (items === undefined) return out;
        for (const it of items as Iterable<unknown>)
        {
            const c = diagram.Generator.ContainerFromItem(it);
            if (!(c instanceof Figure)) continue;
            const r = c.ArrangedRect;
            if (r === undefined || r.Width <= 0) continue;
            out.push(new Rect(c.Left, c.Top, r.Width, r.Height));
        }
        return out;
    };

    const setGuidePos = (i: number, pos: number): void => {
        const next = diagram.Guides.slice();
        next[i] = { ...next[i]!, position: pos };
        diagram.Guides = next;
    };

    // Translate every node glued to `guide` by `delta` along the guide's axis.
    const moveGluedNodes = (guide: PersistentGuide, delta: number): void => {
        const items = diagram.ItemsSource;
        if (items === undefined || delta === 0 || guide.glued.length === 0) return;
        const byId = new Map<string, Figure>();
        for (const it of items as Iterable<unknown>)
        {
            const id = nodeIdOf(it);
            const c = diagram.Generator.ContainerFromItem(it);
            if (id !== undefined && c instanceof Figure) byId.set(id, c);
        }
        for (const g of guide.glued)
        {
            const c = byId.get(g.nodeId);
            if (c === undefined) continue;
            if (guide.axis === AlignmentAxis.X) c.Left = c.Left + delta;
            else                                c.Top  = c.Top  + delta;
        }
    };

    const onDown = (args: PointerEventArgs): void => {
        if (args.Handled) return;
        // 1) drag out of a ruler -> create a guide (top ruler -> Y line, left -> X line)
        const ruler = findAncestor(args.Source, RulerBar);
        if (ruler !== undefined)
        {
            axis = ruler.Orientation === Orientation.Horizontal ? AlignmentAxis.Y : AlignmentAxis.X;
            const p = contentPoint(args);
            const pos = axis === AlignmentAxis.X ? p.x : p.y;
            const next = diagram.Guides.slice();
            guideIndex = next.length;
            next.push({ axis, position: pos, glued: [] });
            diagram.Guides = next;
            mode = Mode.Create; lastPos = pos;
            args.Handled = true;
            return;
        }
        // 2) grab an existing guide within tolerance -> reposition
        const p = contentPoint(args);
        const tol = DiagramSettings.GuideGrabTolerance() / (diagram.Zoom || 1);
        for (let i = 0; i < diagram.Guides.length; i++)
        {
            const g = diagram.Guides[i]!;
            const coord = g.axis === AlignmentAxis.X ? p.x : p.y;
            if (Math.abs(coord - g.position) <= tol)
            {
                mode = Mode.Reposition; guideIndex = i; axis = g.axis; lastPos = g.position;
                args.Handled = true;
                return;
            }
        }
        // 3) otherwise, if a node is being grabbed, arm glue observation (no Handled)
        const fig = findAncestor(args.Source, Figure);
        if (fig !== undefined) { mode = Mode.NodeDrag; activeNode = fig; }
    };

    const onMove = (args: PointerEventArgs): void => {
        if (mode !== Mode.Create && mode !== Mode.Reposition) return;
        const p = contentPoint(args);
        const raw = axis === AlignmentAxis.X ? p.x : p.y;
        const snapped = snapGuidePosition(axis, raw, otherRects(), DiagramSettings.GuideGrabTolerance());
        if (mode === Mode.Reposition) moveGluedNodes(diagram.Guides[guideIndex]!, snapped - lastPos);
        setGuidePos(guideIndex, snapped);
        lastPos = snapped;
    };

    const onUp = (args: PointerEventArgs): void => {
        if (mode === Mode.Create || mode === Mode.Reposition)
        {
            // Dropped back onto a ruler: create -> discard, reposition -> delete.
            if (findAncestor(args.Source, RulerBar) !== undefined && guideIndex >= 0)
            {
                const next = diagram.Guides.slice();
                next.splice(guideIndex, 1);
                diagram.Guides = next;
            }
        }
        else if (mode === Mode.NodeDrag && activeNode !== undefined)
        {
            const r = activeNode.ArrangedRect;
            const finalRect = new Rect(activeNode.Left, activeNode.Top, r?.Width ?? 0, r?.Height ?? 0);
            const res = snapRectToGuides(finalRect, diagram.Guides, DiagramSettings.GuideGrabTolerance());
            // Items-are-Figures: the container IS the node (has its own Id).
            // VM-backed nodes: hop container -> item VM for the stable id.
            const id = nodeIdOf(activeNode) ?? nodeIdOf(diagram.Generator.ItemFromContainer(activeNode));
            if (id !== undefined) reglue(diagram, id, res);
        }
        mode = Mode.None; guideIndex = -1; activeNode = undefined;
    };

    diagram._setPersistentGuidesHandlers({
        OnPreviewPointerDown: onDown as (a: unknown) => void,
        OnPreviewPointerMove: onMove as (a: unknown) => void,
        OnPreviewPointerUp:   onUp   as (a: unknown) => void,
    });

    return (): void => {
        diagram._setPersistentGuidesHandlers(undefined);
        diagram.PositionSnap = previousSnap;
    };
}

// Rewrite a node's glue: on each axis, glue to the snapped guide (if any) and
// remove the node from every other guide of that axis (drag-away un-glue).
function reglue(diagram: Diagram, nodeId: string, res: GuideSnap): void
{
    const guides = diagram.Guides.map(g => ({ ...g, glued: g.glued.slice() as GuideGlue[] }));
    const applyAxis = (axisSnap: { edge: EdgeKind; guide: number } | undefined, wantAxis: AlignmentAxis): void => {
        for (let i = 0; i < guides.length; i++)
        {
            if (guides[i]!.axis !== wantAxis) continue;
            guides[i]!.glued = guides[i]!.glued.filter(g => g.nodeId !== nodeId);
        }
        if (axisSnap !== undefined) guides[axisSnap.guide]!.glued.push({ nodeId, edge: axisSnap.edge });
    };
    applyAxis(res.x, AlignmentAxis.X);
    applyAxis(res.y, AlignmentAxis.Y);
    diagram.Guides = guides;
}
