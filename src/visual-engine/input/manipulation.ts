// WPF-parity Manipulation (System.Windows.Input.Manipulation*). Touch
// contacts on an element whose IsManipulationEnabled is true are
// aggregated into translation / scale / rotation deltas and surfaced as
// bubbling routed events: ManipulationStarting → ManipulationStarted →
// ManipulationDelta* → ManipulationInertiaStarting → (inertial)
// ManipulationDelta* → ManipulationCompleted.
//
// Gesture math (ManipulationProcessor): 1 contact → translation only;
// 2+ contacts → translation of the centroid + scale (mean radius ratio)
// + rotation (angle change of the contact spread). Inertia decays the
// final velocities on the shared AnimationManager clock.

import { Point } from '../primitives.js';
import type { Element } from '../element.js';
import { RoutedEventArgs, buildRoute } from '../routed-event.js';
import { AnimationManager } from '../animation/manager.js';
import type { IClock } from '../animation/clock.js';

// WPF ManipulationModes — [Flags] selecting which components are reported.
export enum ManipulationModes
{
    None      = 0,
    TranslateX = 1 << 0,
    TranslateY = 1 << 1,
    Translate  = TranslateX | TranslateY,
    Rotate     = 1 << 2,
    Scale      = 1 << 3,
    All        = Translate | Rotate | Scale,
}

// Per-frame (or cumulative) manipulation components. Translation in host
// pixels; Scale is a multiplier (1 = no change); Rotation in degrees;
// Expansion is the absolute radius change in pixels per axis.
export class ManipulationDelta
{
    constructor(
        public readonly Translation: Point,
        public readonly Scale: number,
        public readonly Rotation: number,
        public readonly Expansion: Point,
    ) {}
    public static readonly Identity = new ManipulationDelta(new Point(0, 0), 1, 0, new Point(0, 0));
}

export class ManipulationVelocities
{
    constructor(
        public readonly LinearVelocity: Point,    // px / ms
        public readonly AngularVelocity: number,  // deg / ms
        public readonly ExpansionVelocity: Point, // px / ms
    ) {}
    public static readonly Zero = new ManipulationVelocities(new Point(0, 0), 0, new Point(0, 0));
}

// ── Event args ──────────────────────────────────────────────────────

export class ManipulationStartingEventArgs extends RoutedEventArgs
{
    public Mode: ManipulationModes = ManipulationModes.All;
    public ManipulationContainer: Element;
    private _cancelled = false;
    public get Cancelled(): boolean { return this._cancelled; }
    public Cancel(): void { this._cancelled = true; }
    constructor(source: Element, container: Element)
    {
        super('ManipulationStarting', source);
        this.ManipulationContainer = container;
    }
}

export class ManipulationStartedEventArgs extends RoutedEventArgs
{
    constructor(
        source: Element,
        public readonly ManipulationContainer: Element,
        public readonly ManipulationOrigin: Point,
    )
    { super('ManipulationStarted', source); }
}

export class ManipulationDeltaEventArgs extends RoutedEventArgs
{
    constructor(
        source: Element,
        public readonly ManipulationOrigin: Point,
        public readonly DeltaManipulation: ManipulationDelta,
        public readonly CumulativeManipulation: ManipulationDelta,
        public readonly Velocities: ManipulationVelocities,
        public readonly IsInertial: boolean,
    )
    { super('ManipulationDelta', source); }
}

export class ManipulationInertiaStartingEventArgs extends RoutedEventArgs
{
    /** Deceleration applied to the linear velocity, px / ms². Handlers
     *  may overwrite to tune the inertia feel. */
    public TranslationDeceleration = 0.0010;
    /** Deceleration applied to the angular velocity, deg / ms². */
    public RotationDeceleration = 0.0015;
    constructor(
        source: Element,
        public readonly ManipulationOrigin: Point,
        public readonly InitialVelocities: ManipulationVelocities,
    )
    { super('ManipulationInertiaStarting', source); }
}

export class ManipulationCompletedEventArgs extends RoutedEventArgs
{
    constructor(
        source: Element,
        public readonly ManipulationOrigin: Point,
        public readonly TotalManipulation: ManipulationDelta,
        public readonly FinalVelocities: ManipulationVelocities,
        public readonly IsInertial: boolean,
    )
    { super('ManipulationCompleted', source); }
}

export interface ManipulationEventHandlers
{
    OnManipulationStarting        (args: ManipulationStartingEventArgs): void;
    OnManipulationStarted         (args: ManipulationStartedEventArgs): void;
    OnManipulationDelta           (args: ManipulationDeltaEventArgs): void;
    OnManipulationInertiaStarting (args: ManipulationInertiaStartingEventArgs): void;
    OnManipulationCompleted       (args: ManipulationCompletedEventArgs): void;
}

type ManipulationArgs =
    | ManipulationStartingEventArgs | ManipulationStartedEventArgs
    | ManipulationDeltaEventArgs | ManipulationInertiaStartingEventArgs
    | ManipulationCompletedEventArgs;

const MANIP_HANDLER: Record<ManipulationArgs['Kind'] & string, keyof ManipulationEventHandlers> = {
    ManipulationStarting:        'OnManipulationStarting',
    ManipulationStarted:         'OnManipulationStarted',
    ManipulationDelta:           'OnManipulationDelta',
    ManipulationInertiaStarting: 'OnManipulationInertiaStarting',
    ManipulationCompleted:       'OnManipulationCompleted',
} as Record<string, keyof ManipulationEventHandlers>;

// Bubble dispatch (manipulation events have no tunnel pass in WPF).
export function dispatchManipulation(args: ManipulationArgs): void
{
    const route = buildRoute(args.Source);
    const name = MANIP_HANDLER[args.Kind as keyof typeof MANIP_HANDLER];
    for (const v of route)
    {
        args.Visual = v;
        (v as unknown as ManipulationEventHandlers)[name].call(v, args as never);
        if (args.Handled) return;
        v.FireRoutedListeners(args.Kind, args);
        if (args.Handled) return;
    }
}

// ── Gesture math ────────────────────────────────────────────────────

interface Contact { x: number; y: number; }

// Aggregates the live contact set into per-frame + cumulative deltas.
export class ManipulationProcessor
{
    private readonly _contacts = new Map<number, Contact>();
    private _prevCentroid: Point | undefined;
    private _prevRadius = 0;
    private _prevAngle = 0;
    private _cumTranslation = new Point(0, 0);
    private _cumScale = 1;
    private _cumRotation = 0;

    public get ContactCount(): number { return this._contacts.size; }
    public get Origin(): Point { return this._prevCentroid ?? new Point(0, 0); }
    public get Cumulative(): ManipulationDelta
    {
        return new ManipulationDelta(this._cumTranslation, this._cumScale, this._cumRotation, new Point(0, 0));
    }

    // Adding a NEW contact reseeds the reference frame (so the next move
    // delta isn't a spurious jump); moving an EXISTING contact does not,
    // so computeDelta measures the actual movement.
    public setContact(id: number, x: number, y: number): void
    {
        const isNew = !this._contacts.has(id);
        this._contacts.set(id, { x, y });
        if (isNew) this.reseed();
    }
    public removeContact(id: number): void { this._contacts.delete(id); this.reseed(); }

    // Recompute the reference frame after the contact SET changes (a
    // contact added / removed) so the next move delta isn't a spurious
    // jump.
    private reseed(): void
    {
        const c = this.centroid();
        this._prevCentroid = c;
        this._prevRadius = this.meanRadius(c);
        this._prevAngle = this.spreadAngle();
    }

    // Compute the per-frame delta produced by the current contact
    // positions vs the previous frame, and fold it into the cumulative.
    public computeDelta(): ManipulationDelta
    {
        const c = this.centroid();
        const prev = this._prevCentroid ?? c;
        const translation = new Point(c.X - prev.X, c.Y - prev.Y);

        let scale = 1;
        const radius = this.meanRadius(c);
        if (this._contacts.size >= 2 && this._prevRadius > 0.0001)
        {
            scale = radius / this._prevRadius;
        }

        let rotation = 0;
        if (this._contacts.size >= 2)
        {
            rotation = normalizeDeg(this.spreadAngle() - this._prevAngle);
        }

        this._prevCentroid = c;
        this._prevRadius = radius;
        this._prevAngle = this.spreadAngle();

        this._cumTranslation = new Point(this._cumTranslation.X + translation.X, this._cumTranslation.Y + translation.Y);
        this._cumScale *= scale;
        this._cumRotation += rotation;

        return new ManipulationDelta(translation, scale, rotation, new Point(0, 0));
    }

    private centroid(): Point
    {
        let sx = 0, sy = 0;
        for (const c of this._contacts.values()) { sx += c.x; sy += c.y; }
        const n = Math.max(1, this._contacts.size);
        return new Point(sx / n, sy / n);
    }

    private meanRadius(c: Point): number
    {
        if (this._contacts.size === 0) return 0;
        let sum = 0;
        for (const ct of this._contacts.values()) sum += Math.hypot(ct.x - c.X, ct.y - c.Y);
        return sum / this._contacts.size;
    }

    // Angle (degrees) of the vector from the first contact to the second.
    // Stable enough for rotation deltas; >2 contacts use the first two.
    private spreadAngle(): number
    {
        const it = this._contacts.values();
        const a = it.next().value as Contact | undefined;
        const b = it.next().value as Contact | undefined;
        if (a === undefined || b === undefined) return 0;
        return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    }
}

function normalizeDeg(d: number): number
{
    let r = d;
    while (r > 180) r -= 360;
    while (r < -180) r += 360;
    return r;
}

// ── Coordinator (state machine + inertia) ───────────────────────────

interface ActiveManipulation
{
    container: Element;
    processor: ManipulationProcessor;
    started: boolean;
    lastTime: number;
    lastVelocities: ManipulationVelocities;
}

// One active manipulation at a time (the common single-surface case).
// The InputManager feeds it contact lifecycle events; it raises the
// routed events and runs inertia on the shared animation clock.
export class ManipulationCoordinator
{
    private _active: ActiveManipulation | undefined;
    private _inertiaUnsub: (() => void) | undefined;

    private clock(): IClock { return AnimationManager.Instance.Clock; }

    // A touch contact landed on `container` (an IsManipulationEnabled
    // element). Returns false if a starting handler cancelled the gesture.
    public contactDown(container: Element, id: number, x: number, y: number): boolean
    {
        this.stopInertia();
        if (this._active !== undefined && this._active.container !== container)
        {
            // A second surface — ignore (single active manipulation).
            return false;
        }
        if (this._active === undefined)
        {
            const starting = new ManipulationStartingEventArgs(container, container);
            dispatchManipulation(starting);
            if (starting.Cancelled) return false;
            this._active = {
                container,
                processor: new ManipulationProcessor(),
                started: false,
                lastTime: this.clock().Now(),
                lastVelocities: ManipulationVelocities.Zero,
            };
        }
        this._active.processor.setContact(id, x, y);
        if (!this._active.started)
        {
            this._active.started = true;
            const origin = this._active.processor.Origin;
            dispatchManipulation(new ManipulationStartedEventArgs(container, container, origin));
        }
        return true;
    }

    public contactMove(id: number, x: number, y: number): void
    {
        const a = this._active;
        if (a === undefined) return;
        a.processor.setContact(id, x, y);
        const delta = a.processor.computeDelta();
        const now = this.clock().Now();
        const dt = Math.max(1, now - a.lastTime);
        a.lastTime = now;
        const vel = new ManipulationVelocities(
            new Point(delta.Translation.X / dt, delta.Translation.Y / dt),
            delta.Rotation / dt,
            new Point(0, 0),
        );
        a.lastVelocities = vel;
        dispatchManipulation(new ManipulationDeltaEventArgs(
            a.container, a.processor.Origin, delta, a.processor.Cumulative, vel, false));
    }

    public contactUp(id: number): void
    {
        const a = this._active;
        if (a === undefined) return;
        a.processor.removeContact(id);
        if (a.processor.ContactCount > 0) return;   // fingers remain — keep going

        // Last contact lifted — offer inertia, then run it (or complete).
        const inertia = new ManipulationInertiaStartingEventArgs(
            a.container, a.processor.Origin, a.lastVelocities);
        dispatchManipulation(inertia);
        this.beginInertia(a, inertia);
    }

    // Cancel any active manipulation + inertia (e.g. on teardown).
    public cancel(): void
    {
        this.stopInertia();
        this._active = undefined;
    }

    private beginInertia(a: ActiveManipulation, cfg: ManipulationInertiaStartingEventArgs): void
    {
        let vx = cfg.InitialVelocities.LinearVelocity.X;
        let vy = cfg.InitialVelocities.LinearVelocity.Y;
        let va = cfg.InitialVelocities.AngularVelocity;
        const decel = Math.max(0.00001, cfg.TranslationDeceleration);
        const adecel = Math.max(0.00001, cfg.RotationDeceleration);
        const speed = Math.hypot(vx, vy);

        // No meaningful velocity → complete immediately (no inertia).
        if (speed < 0.001 && Math.abs(va) < 0.001)
        {
            this.complete(a, false);
            return;
        }

        let last = this.clock().Now();
        const tick = (now: number): void => {
            const dt = Math.max(1, now - last);
            last = now;
            // Decay magnitudes toward zero.
            const sp = Math.hypot(vx, vy);
            const newSp = Math.max(0, sp - decel * dt);
            if (sp > 0) { vx *= newSp / sp; vy *= newSp / sp; }
            va = va > 0 ? Math.max(0, va - adecel * dt) : Math.min(0, va + adecel * dt);

            const dxy = new Point(vx * dt, vy * dt);
            const drot = va * dt;
            dispatchManipulation(new ManipulationDeltaEventArgs(
                a.container, a.processor.Origin,
                new ManipulationDelta(dxy, 1, drot, new Point(0, 0)),
                a.processor.Cumulative,
                new ManipulationVelocities(new Point(vx, vy), va, new Point(0, 0)),
                true));

            if (Math.hypot(vx, vy) < 0.001 && Math.abs(va) < 0.001)
            {
                this.complete(a, true);
            }
        };
        this._inertiaUnsub = this.clock().Subscribe(tick);
    }

    private complete(a: ActiveManipulation, inertial: boolean): void
    {
        this.stopInertia();
        dispatchManipulation(new ManipulationCompletedEventArgs(
            a.container, a.processor.Origin, a.processor.Cumulative,
            ManipulationVelocities.Zero, inertial));
        if (this._active === a) this._active = undefined;
    }

    private stopInertia(): void
    {
        this._inertiaUnsub?.();
        this._inertiaUnsub = undefined;
    }
}
