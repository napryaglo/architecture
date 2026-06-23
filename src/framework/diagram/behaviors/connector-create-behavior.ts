import { Point } from '../../../visual-engine/index.js';
import type { Diagram } from '../diagram.js';
import { Connector } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import type { Figure } from '../figure.js';
import type { Port } from '../port.js';
import { RoutingMode } from '../routing/router.js';

// Fired when the drag-create gesture lands on a target Figure
// (PointerUp over a Figure body or one of its ports). The consumer's
// listener decides what to do with the proposed Source / Target
// endpoints — typically construct a domain-level connector entry and
// push it into `Diagram.Connectors`. The framework does NOT mutate the
// Connectors collection itself; same event-based contract as
// Group / Ungroup / Combine / Delete in
// [diagram.ts:265-289](../diagram.ts#L265-L289).
export interface ConnectorCreatedArgs
{
    readonly Source: ConnectorEndpoint;
    readonly Target: ConnectorEndpoint;
}

export type ConnectorCreatedListener = (args: ConnectorCreatedArgs) => void;

// State machine for the drag-create gesture per § 4.1 of
// [src/document/connectors.md](../../../document/connectors.md).
// Imperative begin/update/end/abort API: pointer wiring (Figure-level
// PointerDown trigger + cursor coordinate translation through any
// enclosing ScrollViewer) lives one layer up and calls into the
// methods on this behavior. The split keeps the state machine fully
// testable without faking the input subsystem.
//
// During the gesture a transient `Connector` instance lives on the
// behavior — exposed via `TransientConnector` so a consumer's
// pointer-wiring layer can mount it into the diagram's connectors
// layer for visual feedback. On EndCreate the transient is dropped
// and the consumer's ConnectorCreated listener materializes a
// non-transient connector through the Connectors collection.
export class ConnectorCreateBehavior
{
    private readonly _diagram: Diagram;
    private _transientConnector: Connector | undefined = undefined;
    private _sourceFigure:       Figure    | undefined = undefined;
    private _sourcePort:         Port      | undefined = undefined;

    constructor(diagram: Diagram)
    {
        this._diagram = diagram;
    }

    public get IsActive(): boolean { return this._transientConnector !== undefined; }
    public get TransientConnector(): Connector | undefined { return this._transientConnector; }

    // Start a drag-create gesture. If a gesture is already in flight
    // the previous transient is silently dropped — the same convention
    // as a second drag-start preempting a previous unreleased drag.
    public BeginCreate(sourceFigure: Figure, sourcePort: Port | undefined, cursor: Point): void
    {
        if (this._transientConnector !== undefined) this.Abort();

        this._sourceFigure = sourceFigure;
        this._sourcePort   = sourcePort;

        const transient = new Connector();
        transient.RoutingMode = RoutingMode.Orthogonal;
        transient.Source = makeHitEndpoint(sourceFigure, sourcePort);
        transient.Target = new ConnectorEndpoint({ FreePoint: cursor });
        this._transientConnector = transient;
    }

    // Per-pointer-move update — bubbles the cursor through to the
    // transient connector's Target.FreePoint. The connector's existing
    // OnPropertyChanged → recompute pipeline takes care of re-routing
    // at the new free-end position.
    public UpdateCursor(cursor: Point): void
    {
        const t = this._transientConnector;
        if (t === undefined) return;
        const tgt = t.Target;
        if (tgt === undefined) return;
        tgt.FreePoint = cursor;
    }

    // Close the gesture on a Figure target. Drops the transient,
    // fires ConnectorCreated with proposed Source / Target endpoints
    // shaped per § 4.1's port-ref rules. The consumer's listener owns
    // the next step (insert into the Connectors collection).
    public EndCreate(targetFigure: Figure, targetPort: Port | undefined): void
    {
        if (this._transientConnector === undefined || this._sourceFigure === undefined) return;

        const source = makeHitEndpoint(this._sourceFigure, this._sourcePort);
        const target = makeHitEndpoint(targetFigure,        targetPort);
        this._cleanup();
        this._diagram._fireConnectorCreated({ Source: source, Target: target });
    }

    // PointerUp over empty space — drop the transient connector
    // silently. No event fires.
    public Abort(): void
    {
        if (this._transientConnector === undefined) return;
        this._cleanup();
    }

    private _cleanup(): void
    {
        this._transientConnector = undefined;
        this._sourceFigure       = undefined;
        this._sourcePort         = undefined;
    }
}

// Port-ref rules per § 4.1: named port → PortName; anonymous
// (Name = '') OR no port hit → bare Node (positional addressing is
// V2 — anonymous-port shape connectors fall back to path-4 auto-pick
// at resolution time, which lands on the closest port to the other
// endpoint).
function makeHitEndpoint(figure: Figure, port: Port | undefined): ConnectorEndpoint
{
    if (port === undefined || port.Name === '')
    {
        return new ConnectorEndpoint({ Node: figure });
    }
    return new ConnectorEndpoint({ Node: figure, PortName: port.Name });
}

// Convenience attach function mirroring the canvas-drop / mutator
// pattern. v1 wires only the behavior instance — pointer wiring is
// the consumer's responsibility, but the detach thunk drops the
// transient if one's still in flight when the behavior tears down.
export function attachConnectorCreate(diagram: Diagram): { behavior: ConnectorCreateBehavior; detach: () => void }
{
    const behavior = new ConnectorCreateBehavior(diagram);
    return {
        behavior,
        detach: (): void => behavior.Abort(),
    };
}
