import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    AnimationManager,
    Application,
    ManipulationDeltaEventArgs,
    ManipulationStartingEventArgs,
    NoModifiers,
    PointerButton,
    Visual,
    type PointerEventInit,
} from '../../runtime/index.js';
import { ManualClock } from '../../visual-engine/index.js';
import { Control, InputManager } from '../index.js';

function touch(id: number, x: number, y: number, buttons = 1): PointerEventInit
{
    return {
        HostX: x, HostY: y, Button: PointerButton.Primary, Buttons: buttons,
        Modifiers: NoModifiers, PointerId: id, Pressure: 0, PointerType: 'touch',
    };
}

class Surface extends Control
{
    private readonly _kids: Visual[] = [];
    constructor() { super(); this.IsManipulationEnabled = true; }
    public AddChild(c: Visual): void
    {
        this._kids.push(c);
        (this as unknown as { AttachLogical(v: Visual): void }).AttachLogical(c);
        (this as unknown as { AttachVisual(v: Visual): void }).AttachVisual(c);
    }
    public override get visualChildren():  readonly Visual[] { return this._kids; }
    public override get logicalChildren(): readonly Visual[] { return this._kids; }
}

function clock(): ManualClock { return AnimationManager.Instance.Clock as ManualClock; }

describe('Manipulation — gesture recognition', () => {
    beforeEach(() => { Application.current = null; AnimationManager.ResetForTests(); });

    test('single-finger pan raises Starting + Started + a translation Delta', () => {
        const s = new Surface();
        const events: string[] = [];
        let lastDelta: ManipulationDeltaEventArgs | undefined;
        s.AddRoutedEventListener('ManipulationStarting', () => events.push('starting'));
        s.AddRoutedEventListener('ManipulationStarted',  () => events.push('started'));
        s.AddRoutedEventListener('ManipulationDelta',    (a) => { events.push('delta'); lastDelta = a as ManipulationDeltaEventArgs; });

        const im = new InputManager();
        im.InjectPointerDown(s, touch(1, 0, 0));
        clock().Tick(16);
        im.InjectPointerMove(s, touch(1, 10, 5));

        assert.deepEqual(events, ['starting', 'started', 'delta']);
        assert.ok(lastDelta !== undefined);
        assert.equal(Math.round(lastDelta!.DeltaManipulation.Translation.X), 10);
        assert.equal(Math.round(lastDelta!.DeltaManipulation.Translation.Y), 5);
        assert.equal(lastDelta!.IsInertial, false);
    });

    test('two-finger spread produces a cumulative scale > 1', () => {
        const s = new Surface();
        let lastDelta: ManipulationDeltaEventArgs | undefined;
        s.AddRoutedEventListener('ManipulationDelta', (a) => { lastDelta = a as ManipulationDeltaEventArgs; });

        const im = new InputManager();
        im.InjectPointerDown(s, touch(1, 0, 0, 1));
        im.InjectPointerDown(s, touch(2, 10, 0, 1));   // second contact
        clock().Tick(16);
        // Spread the second finger out from 10 to 30 (distance grows).
        im.InjectPointerMove(s, touch(2, 30, 0, 1));

        assert.ok(lastDelta !== undefined);
        assert.ok(lastDelta!.CumulativeManipulation.Scale > 1,
            `expected cumulative scale > 1, got ${lastDelta!.CumulativeManipulation.Scale}`);
    });

    test('a ManipulationStarting handler that Cancels suppresses the gesture', () => {
        const s = new Surface();
        let started = 0;
        s.AddRoutedEventListener('ManipulationStarting', (a) => { (a as ManipulationStartingEventArgs).Cancel(); });
        s.AddRoutedEventListener('ManipulationStarted',  () => { started++; });

        const im = new InputManager();
        im.InjectPointerDown(s, touch(1, 0, 0));
        clock().Tick(16);
        im.InjectPointerMove(s, touch(1, 10, 0));
        assert.equal(started, 0);
    });
});

describe('Manipulation — inertia', () => {
    beforeEach(() => { Application.current = null; AnimationManager.ResetForTests(); });

    test('a flick raises InertiaStarting, then inertial Delta(s), then Completed', () => {
        const s = new Surface();
        const events: string[] = [];
        let inertialDeltas = 0;
        s.AddRoutedEventListener('ManipulationInertiaStarting', () => events.push('inertia'));
        s.AddRoutedEventListener('ManipulationDelta', (a) => {
            if ((a as ManipulationDeltaEventArgs).IsInertial) inertialDeltas++;
        });
        s.AddRoutedEventListener('ManipulationCompleted', () => events.push('completed'));

        const im = new InputManager();
        im.InjectPointerDown(s, touch(1, 0, 0));
        clock().Tick(16);
        im.InjectPointerMove(s, touch(1, 100, 0));   // fast flick → velocity
        im.InjectPointerUp(s, touch(1, 100, 0, 0));  // last contact up → inertia

        assert.deepEqual(events.slice(0, 1), ['inertia']);
        // One large clock advance fully decays the velocity → inertial
        // delta(s) then Completed.
        clock().Tick(1_000_000);
        assert.ok(inertialDeltas >= 1, `expected >=1 inertial delta, got ${inertialDeltas}`);
        assert.ok(events.includes('completed'));
    });
});
