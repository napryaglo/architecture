import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Color } from '../../runtime/index.js';
import { DropShadowEffect, MaterialElevationEffect } from '../drawing/drop-shadow-effect.js';

describe('DropShadowEffect', () => {
    test('defaults: Direction = 270 (straight down), Color = Black, Opacity = 1', () => {
        const e = new DropShadowEffect();
        const css = e.toCssFilter();
        // Direction 270 = straight down → x ≈ 0, y ≈ +ShadowDepth (CSS +Y).
        assert.match(css, /^drop-shadow\(0\.0px 5\.0px 5\.0px rgba\(0, 0, 0, 1\.000\)\)$/);
    });

    test('Direction = 0 (right) puts the shadow along +X', () => {
        const e = new DropShadowEffect({ Direction: 0, ShadowDepth: 4, BlurRadius: 0 });
        const css = e.toCssFilter();
        assert.match(css, /drop-shadow\(4\.0px (-)?0\.0px 0\.0px /);
    });

    test('Opacity multiplies the Color alpha into the rgba alpha', () => {
        const e = new DropShadowEffect({
            Color: new Color(0, 0, 255, 255),
            Opacity: 0.5,
            BlurRadius: 0,
            ShadowDepth: 0,
        });
        const css = e.toCssFilter();
        assert.match(css, /rgba\(0, 0, 255, 0\.500\)/);
    });

    test('Opacity stacks with the Color\'s own alpha', () => {
        const e = new DropShadowEffect({
            Color: new Color(255, 0, 0, 128),     // ≈ 0.502 alpha
            Opacity: 0.5,
            BlurRadius: 0,
            ShadowDepth: 0,
        });
        // (128/255) * 0.5 ≈ 0.251
        assert.match(e.toCssFilter(), /rgba\(255, 0, 0, 0\.25[01]\)/);
    });
});

describe('MaterialElevationEffect', () => {
    test('Level 1 emits two stacked drop-shadows (key + ambient)', () => {
        const e = new MaterialElevationEffect(1);
        const css = e.toCssFilter();
        // Two drop-shadow() functions chained, both with 0 X offset.
        const matches = css.match(/drop-shadow\(/g) ?? [];
        assert.equal(matches.length, 2, 'should emit two drop-shadow functions');
        assert.match(css, /drop-shadow\(0 1px 2px rgba\(0, 0, 0, 0\.30\)\)/);
        assert.match(css, /drop-shadow\(0 1px 3px rgba\(0, 0, 0, 0\.15\)\)/);
    });

    test('Level 5 produces a longer shadow than Level 1', () => {
        const l1 = new MaterialElevationEffect(1).toCssFilter();
        const l5 = new MaterialElevationEffect(5).toCssFilter();
        // Level 5's second-shadow blur (12px) shows up; Level 1's doesn't.
        assert.match(l5, /12px/);
        assert.equal(/12px/.test(l1), false);
    });
});
