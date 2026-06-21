// Drag & drop subsystem — primitives that the InputManager + Visual
// route into, and the session object returned to authors.
//
// Spec: docs/superpowers/specs/2026-06-04-drag-and-drop-design.md
//
// Layered like the rest of the runtime — `DataObject` and
// `DragDropEffects` are pure data with no Visual dependency; the
// session and `DragDrop` static come later in the file once the
// `Visual` type is in scope through type-only imports.

// Flag enum — values are OR-able so receivers can write e.g.
// `args.Effect = DragDropEffects.Copy | DragDropEffects.Move`. Matches
// WPF's `System.Windows.DragDropEffects` shape.
export enum DragDropEffects
{
    None = 0,
    Copy = 1,
    Move = 2,
    Link = 4,
    All  = Copy | Move | Link,
}

// WPF-parity formats map. Per the spec (Q2: B), one source can publish
// the same payload under multiple format keys (e.g. `text/plain` and
// `application/x-mural-node` for a draggable that wants to interoperate
// with future text receivers). Receivers query the formats they
// understand via `Has(format)` / `Get(format)`.
//
// `Set` returns `this` for fluent chaining. Insertion order is preserved
// so `Formats()` is deterministic for tests.
export class DataObject
{
    private readonly entries: Map<string, unknown> = new Map();

    public Set(format: string, data: unknown): this
    {
        this.entries.set(format, data);
        return this;
    }

    public Get<T = unknown>(format: string): T | undefined
    {
        return this.entries.get(format) as T | undefined;
    }

    public Has(format: string): boolean
    {
        return this.entries.has(format);
    }

    public Formats(): readonly string[]
    {
        return [...this.entries.keys()];
    }
}

// Forward type-only — Visual is in another module and importing the
// value would cycle through routed-event.ts. The session never
// instantiates a Visual, only carries the caller's reference.
import type { Visual } from './visual.js';

// Resolution + InputManager-hookable session. Authors get this back
// from BeginDragDrop / DoDragDrop; the InputManager drives it via the
// `_fireMove` / `_complete` hooks (these are underscore-prefixed
// because they aren't part of the author surface, but they're not
// language-level private so cross-module callers in `input-manager.ts`
// can reach them).
//
// PromiseLike via an inner Promise<DragDropEffects> resolved on
// session end. then() returns the inner promise's then().
export class DragSession implements PromiseLike<DragDropEffects>
{
    // Source is the originating Visual when the drag was initiated by
    // user code via `DragDrop.DoDragDrop`. For OS-level drops (8.1) the
    // session is synthesized by the host with no in-tree origin —
    // Source is then `undefined` and consumers can detect "this came
    // from outside the app" by that.
    public readonly Source:         Visual | undefined;
    public readonly Data:           DataObject;
    public readonly AllowedEffects: DragDropEffects;

    private readonly _moveSubs:        Set<(x: number, y: number) => void> = new Set();
    private readonly _feedbackSubs:    Set<(effect: DragDropEffects) => void> = new Set();
    private readonly _continueQueries: Set<() => boolean> = new Set();
    private readonly _completion:      Promise<DragDropEffects>;
    private          _resolve!:        (e: DragDropEffects) => void;
    private          _settled:         boolean = false;
    private          _lastFeedback:    DragDropEffects = DragDropEffects.None;

    constructor(source: Visual | undefined, data: DataObject, allowedEffects: DragDropEffects)
    {
        this.Source         = source;
        this.Data           = data;
        this.AllowedEffects = allowedEffects;
        this._completion    = new Promise<DragDropEffects>((res) => { this._resolve = res; });
    }

    public OnMove(cb: (hostX: number, hostY: number) => void): () => void
    {
        this._moveSubs.add(cb);
        return () => { this._moveSubs.delete(cb); };
    }

    // Source-side feedback hook — fires whenever the receiver chooses a
    // new `Effect` (different from the previous one). Useful for swapping
    // a custom drag-image when the cursor moves over a "delete" zone vs
    // a "move" zone, or for updating source-side UI to mirror the
    // receiver's intent. Initial state is `None`; the first
    // non-None receiver triggers a feedback fire.
    //
    // Returns the unsubscribe thunk. Mirrors WPF's `GiveFeedback`
    // (cursor case excluded — the framework's automatic
    // `host.style.cursor` writes already handle that).
    public OnFeedback(cb: (effect: DragDropEffects) => void): () => void
    {
        this._feedbackSubs.add(cb);
        return () => { this._feedbackSubs.delete(cb); };
    }

    // Source-side cancel hook — polled every move sample. Returning
    // `false` cancels the drag (the InputManager calls
    // session._complete(None) and clears the drag state). Useful for
    // modifier-key abort patterns: e.g., a query that reads
    // `host.modifiers.shift` and returns false when Shift is held.
    //
    // Multiple queries are AND-ed (if ANY returns false, the drag
    // cancels). The query is allowed to mutate external state
    // (logging, hint badges, etc.) — but should be fast since it
    // fires on every move.
    public OnContinueQuery(cb: () => boolean): () => void
    {
        this._continueQueries.add(cb);
        return () => { this._continueQueries.delete(cb); };
    }

    public Cancel(): void
    {
        this._complete(DragDropEffects.None);
    }

    public then<R1 = DragDropEffects, R2 = never>(
        onfulfilled?: ((value: DragDropEffects) => R1 | PromiseLike<R1>) | null | undefined,
        onrejected?:  ((reason: unknown) => R2 | PromiseLike<R2>) | null | undefined,
    ): PromiseLike<R1 | R2>
    {
        return this._completion.then(onfulfilled, onrejected);
    }

    // ── Framework-internal hooks ────────────────────────────────────
    //
    // Called by the InputManager while the session is live. Kept on
    // the session (not on the InputManager) so unit tests can drive
    // a session without going through pointer-event injection — the
    // tests poke `_fireMove` / `_complete` directly.

    public _fireMove(hostX: number, hostY: number): void
    {
        for (const cb of this._moveSubs) cb(hostX, hostY);
    }

    // Fired by the InputManager after each DragOver dispatch. Skips the
    // notification when the receiver's chosen effect hasn't changed
    // since the previous sample — feedback handlers only see the
    // edges, not every move.
    public _fireFeedback(effect: DragDropEffects): void
    {
        if (effect === this._lastFeedback) return;
        this._lastFeedback = effect;
        for (const cb of this._feedbackSubs) cb(effect);
    }

    // Polled by the InputManager on every move sample. Returns `false`
    // when ANY registered query returned `false`, signalling the
    // caller (DriveDragMove) to cancel the drag. Returns `true` when
    // every query agrees the drag should continue OR no queries are
    // installed.
    public _pollContinue(): boolean
    {
        for (const q of this._continueQueries)
        {
            if (q() === false) return false;
        }
        return true;
    }

    public _complete(effect: DragDropEffects): void
    {
        if (this._settled) return;
        this._settled = true;
        this._moveSubs.clear();
        this._feedbackSubs.clear();
        this._continueQueries.clear();
        this._resolve(effect);
    }

    // Read by InputManager.ObserveSessionCancellation to detect a
    // Cancel() done outside the pointer-event pipeline (author code,
    // ESC handler, blur listener).
    public get IsSettled(): boolean { return this._settled; }
}

// Per the spec § 4 (preview modes). `undefined` = mode A framework
// translucent clone; `null` = mode B (author renders); `{ Apply }` =
// mode C (DataTemplate). Imported here structurally so this module
// stays Controls-independent.
export type DragPreviewKind =
    | undefined
    | null
    | { Apply(data: unknown): Visual };

export interface DragDropOptions
{
    preview?: DragPreviewKind;
    // Cursor position relative to the ghost content's top-left, in host
    // coords. The HtmlTarget subtracts this from each move sample's
    // (hostX, hostY) so the cursor stays under the press-relative point
    // throughout the drag — without it, a wide source (e.g. an
    // ItemsControl ContentPresenter that stretches across its panel)
    // shows the visible tile far from the cursor because the cloned
    // outer's local frame starts at the source's left edge, not where
    // the user pressed. Declarative drag-start (Visual's IsDraggable
    // latch) populates this automatically from the press coords; for
    // imperative DoDragDrop callers, defaulting to (0, 0) keeps the
    // ghost anchored at its top-left.
    ghostCursorOffset?: { x: number; y: number };
}

// Return shape for a declarative-drag source's OnDragStart callback.
// Mirrors the imperative `DragDrop.DoDragDrop` argument list — the
// framework hands `data` / `effects` / `preview` straight to it, then
// wires `onFeedback` / `onContinueQuery` onto the freshly-started
// session before handing control back to the InputManager (backlog
// 8.3 source-side hooks).
export interface DragStartSpec
{
    data: DataObject;
    effects: DragDropEffects;
    preview?: DragPreviewKind;
    // GiveFeedback hook — fires whenever the OS-level drag-over cursor
    // effect changes. Lets a declarative source swap a per-effect
    // cursor / ghost tint without imperatively reaching into the
    // session post-start.
    onFeedback?: (effect: DragDropEffects) => void;
    // QueryContinueDrag hook — return false to cancel the drag mid-
    // flight (e.g. Esc pressed, source visibility revoked).
    onContinueQuery?: () => boolean;
}

// Callback shape installed on `Visual.OnDragStart`. The framework
// invokes it when the IsDraggable latch has crossed
// `DragDrop.DragThreshold` pixels. Return `null` to skip the drag
// (e.g. precondition not met); return a `DragStartSpec` to launch it.
export type DragStartCallback = (source: Visual) => DragStartSpec | null;

// Static entry point. The instance method `args.BeginDragDrop(...)`
// (added in Task 11) wraps this so authors don't have to import the
// class.
export class DragDrop
{
    public static DragThreshold: number = 4;

    public static DoDragDrop(
        source: Visual,
        data: DataObject,
        allowedEffects: DragDropEffects,
        opts?: DragDropOptions,
    ): DragSession
    {
        const session = new DragSession(source, data, allowedEffects);
        DragDrop._pendingSession = session;
        DragDrop._pendingOptions = opts ?? {};
        return session;
    }

    // Framework-internal handoff between DoDragDrop and the
    // InputManager. The IM polls this on the next pointer event after
    // a DoDragDrop call, picks up the session, and clears the slot.
    // A null `_pendingSession` means no drag is starting.
    //
    // Single-slot intentionally — only one drag at a time in v1
    // (multi-pointer drags are deferred to backlog § 8.2). If a
    // PointerDown handler calls DoDragDrop twice before the IM polls
    // (extremely rare; would require synchronous double-dispatch in
    // one handler), only the second sticks. The first session is
    // orphaned — never picked up, never resolves. Document this and
    // accept it for v1.
    public static _pendingSession: DragSession | null = null;
    public static _pendingOptions: DragDropOptions    = {};
}
