import { Panel } from '../../../runtime/index.js';
import { Point } from '../../../visual-engine/index.js';
import { diagramSpaceRect, toParentSpace } from '../coordinate-space.js';
import { ContainerFigure } from '../container-figure.js';
import { Figure } from '../figure.js';
import type { Diagram } from '../diagram.js';

// Diagram-owned collaborator that turns each node's ParentId (membership tag)
// into visual-tree structure: a child Figure is re-parented OUT of the root
// items host and INTO its container's clipped ChildHost, keeping its diagram-
// space position (its stored Left/Top become parent-relative). Because children
// then are real visual descendants, move-together / clip / hit-test are free.
//
// Authoritative pass: placeAll() — enumerate realized nodes, register every
// ContainerFigure, then apply each node's ParentId. Called after load / mount
// and whenever a VM container binds (ContainerBound). reparent() is the
// imperative entry the drag and wrap/unwrap paths use. Deferred attach: a child
// whose container is not registered yet is queued and flushed when it registers,
// so record/realization order does not matter.
export class ContainerPlacement
{
    private readonly _diagram: Diagram;
    private readonly _containers = new Map<string, ContainerFigure>();   // id -> container
    private readonly _pending = new Map<string, Figure[]>();             // parentId -> children awaiting it
    private _rootHost: Panel | undefined;

    constructor(diagram: Diagram)
    {
        this._diagram = diagram;
        // VM content nodes (e.g. arch tiles) fire ContainerBound as they realize
        // with geometry seeded; re-run the pass so their nesting applies with the
        // right coordinates. Self-container Figures are handled by placeAll().
        diagram.AddContainerBoundListener(() => this.placeAll());
    }

    // Register every realized container, then apply every node's ParentId.
    // Idempotent — safe to call repeatedly (a node already correctly placed is a
    // no-op).
    public placeAll(): void
    {
        for (const node of this._realizedNodes()) this._register(node);
        for (const node of this._realizedNodes()) this._apply(node);
    }

    // Imperative reparent (drag-in/out, wrap/unwrap): set the tag, then place.
    public reparent(node: Figure, parentId: string | undefined): void
    {
        node.ParentId = parentId;
        this._apply(node);
    }

    // The container that currently holds `point` (diagram-space), innermost first,
    // excluding `exclude` and any descendant of it (cycle guard). Used by drag-in.
    public containerAt(point: Point, exclude?: Figure): ContainerFigure | undefined
    {
        let best: ContainerFigure | undefined;
        for (const c of this._containers.values())
        {
            if (c === exclude || (exclude !== undefined && this._isDescendant(c, exclude))) continue;
            const r = diagramSpaceRect(c);
            if (point.X < r.X || point.Y < r.Y || point.X > r.X + r.Width || point.Y > r.Y + r.Height) continue;
            // Innermost wins: prefer the deeper-nested container.
            if (best === undefined || this._isDescendant(c, best)) best = c;
        }
        return best;
    }

    private _register(node: Figure): void
    {
        this._captureRootHost(node);
        if (!(node instanceof ContainerFigure) || node.Id === undefined) return;
        this._containers.set(node.Id, node);
        const waiting = this._pending.get(node.Id);
        if (waiting !== undefined)
        {
            this._pending.delete(node.Id);
            for (const child of waiting) this._apply(child);
        }
    }

    private _apply(node: Figure): void
    {
        const parentId = node.ParentId;
        if (parentId === undefined) { this._moveToRoot(node); return; }
        const target = this._containers.get(parentId);
        if (target === undefined) { this._queue(parentId, node); return; }
        if (target === node || this._isDescendant(target, node)) return;   // cycle guard
        if (node.ContainerParent === target) return;                       // already placed
        this._attach(node, target);
    }

    private _attach(node: Figure, target: ContainerFigure): void
    {
        const host = target.ChildHost;
        if (host === undefined) return;
        const before = diagramSpaceRect(node);
        this._detach(node);
        node.ContainerParent = target;
        const local = toParentSpace(new Point(before.X, before.Y), target);
        node.Left = local.X;
        node.Top  = local.Y;
        host.AddVisualChild(node);
    }

    private _moveToRoot(node: Figure): void
    {
        if (node.ContainerParent === undefined) return;   // already root
        const before = diagramSpaceRect(node);
        this._detach(node);
        node.ContainerParent = undefined;
        node.Left = before.X;
        node.Top  = before.Y;
        this._rootHost?.AddVisualChild(node);
    }

    private _detach(node: Figure): void
    {
        // Realized containers are VISUAL-only children of their host (the
        // ItemsControl uses AddVisualChild), so re-parent through the visual
        // tree, not the logical AddChild/RemoveChild path.
        const parent = node.GetVisualParent();
        if (parent instanceof Panel) parent.RemoveVisualChild(node);
    }

    private _queue(parentId: string, node: Figure): void
    {
        const arr = this._pending.get(parentId) ?? [];
        if (!arr.includes(node)) arr.push(node);
        this._pending.set(parentId, arr);
    }

    private _isDescendant(maybe: Figure, ancestor: Figure): boolean
    {
        for (let c = maybe.ContainerParent; c !== undefined; c = c.ContainerParent)
            if (c === ancestor) return true;
        return false;
    }

    // The root items host is the visual parent of a realized, un-nested node.
    private _captureRootHost(node: Figure): void
    {
        if (this._rootHost !== undefined || node.ContainerParent !== undefined) return;
        const p = node.GetVisualParent();
        if (p instanceof Panel) this._rootHost = p;
    }

    private *_realizedNodes(): Iterable<Figure>
    {
        const src = this._diagram.ItemsSource as { ToArray?: () => unknown[] } | undefined;
        for (const item of src?.ToArray?.() ?? [])
        {
            const container = item instanceof Figure
                ? item
                : this._diagram.Generator.ContainerFromItem(item);
            if (container instanceof Figure) yield container;
        }
    }
}
