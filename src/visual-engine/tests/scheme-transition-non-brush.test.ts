import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    DoubleAnimation,
    Thickness,
    ThicknessAnimation,
    AnimationTimeline,
    CornerRadius,
    getSchemeTransitionAnimator,
    _clearAllSchemeTransitionAnimators,
} from '../../runtime/index.js';
// Side-effect import — registers the Thickness / CornerRadius / number
// animators when this module loads.
import '../drawing/scheme-transition-animators.js';

// § 17.3 — Non-Brush SchemeTransition animators dispatch by value type.
// number → DoubleAnimation, Thickness → ThicknessAnimation,
// CornerRadius → CornerRadiusAnimation. Mismatched pairs decline so
// downstream factories in the composite chain can try.

describe('§ 17.3 — non-Brush SchemeTransition animators', () => {

    beforeEach(() => {
        // Don't clear ALL animators — we want the new secondaries to
        // remain registered from the side-effect import above. The
        // primary slot doesn't matter for these tests since each
        // value-pair is type-specific.
    });

    test('number → number swap produces a DoubleAnimation', () => {
        const dispatcher = getSchemeTransitionAnimator();
        assert.ok(dispatcher !== undefined);
        const tl = dispatcher!(10, 30, { duration: 200 });
        assert.ok(tl instanceof DoubleAnimation,
            `expected DoubleAnimation, got ${tl?.constructor.name}`);
        assert.equal((tl as DoubleAnimation).From, 10);
        assert.equal((tl as DoubleAnimation).To,   30);
        assert.equal(tl!.Duration, 200);
    });

    test('Thickness → Thickness swap produces a ThicknessAnimation', () => {
        const dispatcher = getSchemeTransitionAnimator()!;
        const from = new Thickness(2, 4, 2, 4);
        const to   = new Thickness(8, 12, 8, 12);
        const tl = dispatcher(from, to, { duration: 150 });
        assert.ok(tl instanceof ThicknessAnimation,
            `expected ThicknessAnimation, got ${tl?.constructor.name}`);
        assert.equal((tl as ThicknessAnimation).From, from);
        assert.equal((tl as ThicknessAnimation).To,   to);
    });

    test('CornerRadius → CornerRadius swap produces a CornerRadiusAnimation', () => {
        const dispatcher = getSchemeTransitionAnimator()!;
        const from = new CornerRadius(4, 4, 4, 4);
        const to   = new CornerRadius(12, 12, 12, 12);
        const tl = dispatcher(from, to, { duration: 200 });
        assert.ok(tl !== undefined, 'expected a timeline');
        assert.equal(tl!.Duration, 200);
        // The constructor name varies (the animator class lives in
        // scheme-transition-animators.ts and is anonymous from outside),
        // but the Evaluate output should be a CornerRadius at t=0 / t=1.
        const at0 = (tl as AnimationTimeline).Evaluate(0, from) as CornerRadius;
        const at1 = (tl as AnimationTimeline).Evaluate(200, from) as CornerRadius;
        assert.ok(at0 instanceof CornerRadius);
        assert.ok(at1 instanceof CornerRadius);
        assert.equal(at0.TopLeft, 4);
        assert.equal(at1.TopLeft, 12);
    });

    test('mixed-type pair (number ↔ Thickness) returns undefined — falls through', () => {
        const dispatcher = getSchemeTransitionAnimator()!;
        const tl = dispatcher(10, new Thickness(1, 1, 1, 1), { duration: 100 });
        assert.equal(tl, undefined);
    });

    test('unknown value types decline cleanly', () => {
        const dispatcher = getSchemeTransitionAnimator()!;
        const tl = dispatcher({ kind: 'opaque' }, { kind: 'other' }, { duration: 100 });
        assert.equal(tl, undefined);
    });

    test('_clearAllSchemeTransitionAnimators wipes the secondaries too', () => {
        // After clear-all, the dispatcher should be undefined (no primary,
        // no secondaries).
        _clearAllSchemeTransitionAnimators();
        const d = getSchemeTransitionAnimator();
        assert.equal(d, undefined);
        // Restore — re-import the module so the secondaries register
        // again for subsequent test runs. Tests in different files
        // import this module independently, so the clear here only
        // affects this run; the next test file's side-effect import
        // re-registers them.
        return import('../drawing/scheme-transition-animators.js');
    });
});
