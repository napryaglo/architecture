import { type IHistoryLayer } from './history-layer.js';

interface LayerChange { layer: IHistoryLayer; before: unknown; after: unknown; }
interface HistoryEntry { label: string; changes: LayerChange[]; }

interface HistoryOptions {
    cap?: number;
    scheduleMicrotask?: (fn: () => void) => void;
}

// Per-document undo/redo. Records ref-counted transactions; each committed
// transaction that changed a layer becomes one reversible entry. In-memory,
// session-only. See docs/superpowers/specs/2026-08-26-undo-redo-design.md.
export class DiagramHistory {
    private readonly layers: IHistoryLayer[] = [];
    private readonly undoStack: HistoryEntry[] = [];
    private readonly redoStack: HistoryEntry[] = [];
    private readonly cap: number;
    private readonly schedule: (fn: () => void) => void;

    private depth = 0;
    private label = '';
    private before = new Map<IHistoryLayer, unknown>();
    // Last-committed snapshot per layer — the authoritative pre-edit "before".
    // The safety net (NotifyEdited) fires AFTER a mutation, so it cannot capture a
    // true before by re-reading the layer; it uses this baseline instead. Refreshed
    // after every commit / undo / redo and seeded when a layer registers.
    private readonly baseline = new Map<IHistoryLayer, unknown>();
    private suppressed = false;          // true while restoring (undo/redo)
    private autoScheduled = false;       // a microtask commit is pending

    constructor(opts?: HistoryOptions) {
        this.cap = opts?.cap ?? 100;
        this.schedule = opts?.scheduleMicrotask ?? ((fn) => queueMicrotask(fn));
    }

    public RegisterLayer(layer: IHistoryLayer): () => void {
        this.layers.push(layer);
        this.baseline.set(layer, layer.Capture());
        return () => {
            const i = this.layers.indexOf(layer);
            if (i >= 0) this.layers.splice(i, 1);
            this.baseline.delete(layer);
        };
    }

    // Re-read every layer into the baseline (the new last-good pre-edit state).
    private refreshBaseline(): void {
        for (const l of this.layers) this.baseline.set(l, l.Capture());
    }

    public get CanUndo(): boolean { return this.undoStack.length > 0; }
    public get CanRedo(): boolean { return this.redoStack.length > 0; }
    public get Depth(): number { return this.depth; }

    public Begin(label: string): void {
        if (this.suppressed) return;
        if (this.depth === 0) {
            this.label = label;
            // "before" is the last-committed baseline, not a fresh read: an
            // explicit Begin runs pre-edit (baseline == current), and the safety
            // net runs post-edit (baseline still holds the true pre-edit state).
            this.before = new Map(this.baseline);
        }
        this.depth++;
    }

    public Commit(): void {
        if (this.suppressed) return;
        if (this.depth === 0) return;
        this.depth--;
        if (this.depth > 0) return;
        const changes: LayerChange[] = [];
        for (const l of this.layers) {
            const before = this.before.get(l);
            const after = l.Capture();
            if (!l.Equals(before, after)) changes.push({ layer: l, before, after });
        }
        this.before = new Map();
        this.refreshBaseline();                     // committed state is the new baseline
        if (changes.length === 0) return;           // no-op transaction
        this.undoStack.push({ label: this.label, changes });
        if (this.undoStack.length > this.cap) this.undoStack.shift();
        this.redoStack.length = 0;
    }

    public Abort(): void {
        if (this.depth === 0) return;
        this.depth = 0;
        this.before = new Map();
    }

    // Safety net: an edit happened outside any explicit transaction. Open one and
    // commit it at microtask end so a burst of synchronous edits coalesces.
    public NotifyEdited(): void {
        if (this.suppressed || this.depth > 0) return;
        if (!this.autoScheduled) {
            this.autoScheduled = true;
            this.Begin('Edit');
            this.schedule(() => { this.autoScheduled = false; this.Commit(); });
        }
    }

    public Undo(): void {
        const entry = this.undoStack.pop();
        if (entry === undefined) return;
        this.applyChanges(entry.changes, (c) => c.before);
        this.redoStack.push(entry);
    }

    public Redo(): void {
        const entry = this.redoStack.pop();
        if (entry === undefined) return;
        this.applyChanges(entry.changes, (c) => c.after);
        this.undoStack.push(entry);
    }

    private applyChanges(changes: LayerChange[], pick: (c: LayerChange) => unknown): void {
        this.suppressed = true;
        try {
            for (const c of changes) c.layer.Restore(pick(c));
            for (const c of changes) c.layer.Reconcile?.();
        } finally {
            this.suppressed = false;
        }
        this.refreshBaseline();                     // restored state is the new baseline
    }
}
