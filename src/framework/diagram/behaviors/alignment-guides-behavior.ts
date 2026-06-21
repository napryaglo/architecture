import {
    Rect,
    findAlignmentGuides,
    type AlignmentGuide,
    type PointerEventArgs,
    type Visual,
} from '../../../runtime/index.js';
import { Figure } from '../figure.js';
import type { Diagram } from '../diagram.js';

// Promoted from the demo's align-edges-behavior.mjs. Owns the
// pointer-driven alignment-guide computation that lights up dashed
// guide lines while a Figure is being dragged. Also installs a
// PositionSnap callback on the Diagram so the in-progress drag snaps
// to the nearest peer edge (per axis, within the kernel's tolerance).
//
// Lifecycle owned by Diagram — see Diagram constructor's subscription
// to AlignmentGuidesEnabledKey. Not exported as an attachThing/detach
// pair for consumer use; the public surface is the
// `Diagram.AlignmentGuidesEnabled` DP. Internal `@internal` API so the
// framework can install + uninstall it from a single place.
//
// On attach: subscribes to Diagram's PointerDown / PointerMove /
// PointerUp routed events; installs PositionSnap.
//
// On detach: removes every listener; restores prior PositionSnap.

/** @internal */
export function attachAlignmentGuides(diagram: Diagram): () => void
{
    let activeFigure: Figure | undefined = undefined;

    const previousSnap = diagram.PositionSnap;
    diagram.PositionSnap = (rect: Rect): Rect => {
        if (activeFigure === undefined) return rect;
        const others = collectOtherRects(diagram, activeFigure);
        return findAlignmentGuides(rect, others).snapped;
    };

    const onPointerDown = (args: PointerEventArgs): void => {
        const fig = findFigureAncestor(args.Source);
        if (fig === undefined) return;
        activeFigure = fig;
        diagram._setAlignmentGuides([]);   // user hasn't moved yet
    };

    const onPointerMove = (_args: PointerEventArgs): void => {
        if (activeFigure === undefined) return;
        const moving = rectFromFigure(activeFigure);
        const others = collectOtherRects(diagram, activeFigure);
        const guides = findAlignmentGuides(moving, others).guides;
        diagram._setAlignmentGuides(guides);
    };

    const onPointerUp = (_args: PointerEventArgs): void => {
        if (activeFigure === undefined) return;
        activeFigure = undefined;
        diagram._setAlignmentGuides([]);
    };

    diagram.AddRoutedEventListener('PointerDown', onPointerDown as unknown as (a: unknown) => void);
    diagram.AddRoutedEventListener('PointerMove', onPointerMove as unknown as (a: unknown) => void);
    diagram.AddRoutedEventListener('PointerUp',   onPointerUp   as unknown as (a: unknown) => void);

    return (): void => {
        diagram.RemoveRoutedEventListener('PointerDown', onPointerDown as unknown as (a: unknown) => void);
        diagram.RemoveRoutedEventListener('PointerMove', onPointerMove as unknown as (a: unknown) => void);
        diagram.RemoveRoutedEventListener('PointerUp',   onPointerUp   as unknown as (a: unknown) => void);
        diagram.PositionSnap = previousSnap;
        if (diagram.AlignmentGuides.length > 0) diagram._setAlignmentGuides([]);
    };
}

// Walk up the visual parent chain from the event source to the
// enclosing Figure container. Captured-pointer events bubble through
// the container that owns the gesture first.
function findFigureAncestor(visual: unknown): Figure | undefined
{
    let cur = visual as { GetVisualParent?(): Visual | undefined } | undefined;
    while (cur !== undefined && cur !== null)
    {
        if (cur instanceof Figure) return cur;
        cur = (cur as { GetVisualParent?(): Visual | undefined }).GetVisualParent?.();
    }
    return undefined;
}

function rectFromFigure(figure: Figure): Rect
{
    const ar = figure.ArrangedRect;
    const w = ar?.Width  ?? 0;
    const h = ar?.Height ?? 0;
    return new Rect(figure.X, figure.Y, w, h);
}

// Walk Diagram's items, look up each one's container via the
// ItemContainerGenerator, snapshot its current rect. Skip the
// dragged figure itself.
function collectOtherRects(diagram: Diagram, excludedFigure: Figure): Rect[]
{
    const out: Rect[] = [];
    const items = diagram.ItemsSource;
    if (items === undefined) return out;
    const excludedItem = excludedFigure.DataContext;
    for (const peer of items as Iterable<unknown>)
    {
        if (peer === excludedItem) continue;
        const container = diagram.Generator.ContainerFromItem(peer);
        if (!(container instanceof Figure)) continue;
        const rect = container.ArrangedRect;
        if (rect === undefined || rect.Width <= 0) continue;
        out.push(new Rect(container.X, container.Y, rect.Width, rect.Height));
    }
    return out;
}

// Re-export AlignmentGuide for consumers binding to Diagram.AlignmentGuides.
export type { AlignmentGuide };
