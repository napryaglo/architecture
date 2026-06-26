import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Color } from '../../visual-engine/primitives.js';
import { SolidColorBrush, LinearGradientBrush } from '../../visual-engine/drawing/brush.js';
import {
    Lighten, Darken, Mix, Saturate, Desaturate, Alpha,
} from '../binding/color-modifiers.js';

// Built-in color modifiers — converter factories used on the `<<` pipe.
// Each returns a ValueConverter; `convert` runs the Color→Color transform,
// unwrapping/rewrapping a SolidColorBrush so a Fill/Foreground binding
// keeps its brush shape.

describe('Color math', () => {
    test('Lerp blends channel-wise, clamping t', () => {
        const mid = Color.Lerp(new Color(0, 0, 0), new Color(255, 255, 255), 0.5);
        assert.equal(mid.R, 127.5);
        assert.equal(mid.G, 127.5);
        assert.equal(mid.B, 127.5);
        // t clamps: <0 → a, >1 → b.
        assert.deepEqual(Color.Lerp(new Color(10, 20, 30), new Color(0, 0, 0), -1).R, 10);
        assert.deepEqual(Color.Lerp(new Color(10, 20, 30), new Color(0, 0, 0), 5).R, 0);
    });

    test('AdjustSaturation moves toward/away from grey, preserving alpha', () => {
        const c = new Color(180, 100, 100, 200);
        const grey = c.AdjustSaturation(-1);   // fully desaturated → R=G=B
        assert.equal(Math.round(grey.R), Math.round(grey.G));
        assert.equal(Math.round(grey.G), Math.round(grey.B));
        assert.equal(grey.A, 200);             // alpha carried through
    });
});

describe('color modifiers', () => {
    test('Lighten blends toward white and preserves source alpha', () => {
        const out = Lighten(0.5).convert(new Color(0, 0, 0, 128)) as Color;
        assert.equal(out.R, 127.5);
        assert.equal(out.A, 128);              // alpha untouched by a tint
    });

    test('Darken(1) → black', () => {
        const out = Darken(1).convert(new Color(10, 200, 90)) as Color;
        assert.equal(out.R, 0);
        assert.equal(out.G, 0);
        assert.equal(out.B, 0);
    });

    test('a SolidColorBrush in → a SolidColorBrush out', () => {
        const out = Lighten(1).convert(new SolidColorBrush(new Color(0, 0, 0)));
        assert.ok(out instanceof SolidColorBrush);
        assert.equal((out as SolidColorBrush).Color.R, 255);
    });

    test('Mix blends toward another color; accepts a brush as the target', () => {
        const a = Mix(new Color(0, 0, 0), 0.5).convert(new Color(255, 255, 255)) as Color;
        assert.equal(a.R, 127.5);
        // `other` may be a SolidColorBrush (a `#` literal compiles to one).
        const b = Mix(new SolidColorBrush(new Color(0, 0, 0)), 1).convert(new Color(255, 255, 255)) as Color;
        assert.equal(b.R, 0);
    });

    test('Saturate / Desaturate shift intensity', () => {
        const base = new Color(150, 110, 110);
        const less = Desaturate(0.5).convert(base) as Color;
        const more = Saturate(0.5).convert(base) as Color;
        const spread = (c: Color): number => Math.max(c.R, c.G, c.B) - Math.min(c.R, c.G, c.B);
        assert.ok(spread(less) < spread(base));
        assert.ok(spread(more) > spread(base));
    });

    test('Alpha reads a fraction as 0..1 and a >1 value as raw 0..255', () => {
        assert.equal((Alpha(0.5).convert(new Color(0, 0, 0)) as Color).A, 127.5);
        assert.equal((Alpha(200).convert(new Color(0, 0, 0)) as Color).A, 200);
    });

    test('a non-solid brush has no single color to modify → throws', () => {
        assert.throws(
            () => Lighten(0.5).convert(new LinearGradientBrush()),
            /no single color to modify/,
        );
    });

    test('a non-color, non-brush input → throws', () => {
        assert.throws(() => Lighten(0.5).convert(42), /expected a Color or SolidColorBrush/);
    });
});
