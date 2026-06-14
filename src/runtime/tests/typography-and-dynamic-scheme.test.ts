import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Color, Typography } from '../index.js';
import {
    DynamicSchemeVariant,
    makeDynamicScheme,
    makeDynamicLightDarkPair,
} from '../../resources/material/dynamic-scheme.js';
import { SolidColorBrush } from '../../visual-engine/index.js';

// § 17.10 — Typography value class.

describe('§ 17.10 — Typography', () => {

    test('constructs immutable instance from a property bag', () => {
        const t = new Typography({
            Family:     'Roboto',
            Size:       14,
            Weight:     400,
            LineHeight: 20,
            Tracking:   0.25,
        });
        assert.equal(t.Family,     'Roboto');
        assert.equal(t.Size,       14);
        assert.equal(t.Weight,     400);
        assert.equal(t.LineHeight, 20);
        assert.equal(t.Tracking,   0.25);
    });

    test('Tracking defaults to 0', () => {
        const t = new Typography({
            Family: 'Roboto', Size: 14, Weight: 400, LineHeight: 20,
        });
        assert.equal(t.Tracking, 0);
    });

    test('Equals returns true for identical bundles, false otherwise', () => {
        const a = new Typography({ Family: 'F', Size: 14, Weight: 400, LineHeight: 20 });
        const b = new Typography({ Family: 'F', Size: 14, Weight: 400, LineHeight: 20 });
        const c = new Typography({ Family: 'F', Size: 16, Weight: 400, LineHeight: 20 });
        assert.equal(a.Equals(b), true);
        assert.equal(a.Equals(c), false);
    });
});

// § 17.13 — HCT (HSL stand-in for v1) dynamic-scheme generator.

describe('§ 17.13 — makeDynamicScheme', () => {

    test('builds a Scheme covering the M3 role tokens from a seed Color', () => {
        const seed = Color.FromHex('#1976d2'); // material blue 700
        const scheme = makeDynamicScheme({
            name:    'auto-light',
            theme:   'material',
            seed,
            isDark:  false,
        });
        assert.equal(scheme.name,  'auto-light');
        assert.equal(scheme.theme, 'material');
        // Spot-check a few required roles.
        assert.ok(scheme.tokens.get('Primary')              instanceof SolidColorBrush);
        assert.ok(scheme.tokens.get('OnPrimary')            instanceof SolidColorBrush);
        assert.ok(scheme.tokens.get('Surface')              instanceof SolidColorBrush);
        assert.ok(scheme.tokens.get('SurfaceContainerHigh') instanceof SolidColorBrush);
        assert.ok(scheme.tokens.get('OutlineVariant')       instanceof SolidColorBrush);
        assert.ok(scheme.tokens.get('Error')                instanceof SolidColorBrush);
    });

    test('dark variant produces visibly different Surface tone than light', () => {
        const seed = Color.FromHex('#1976d2');
        const light = makeDynamicScheme({ name: 'l', theme: 't', seed, isDark: false });
        const dark  = makeDynamicScheme({ name: 'd', theme: 't', seed, isDark: true  });
        const lightSurface = (light.tokens.get('Surface') as SolidColorBrush).Color;
        const darkSurface  = (dark.tokens.get('Surface')  as SolidColorBrush).Color;
        // Light Surface near tone-99 (bright), dark near tone-10 (dim).
        assert.ok(lightSurface.R > darkSurface.R, 'light Surface should be brighter than dark');
    });

    test('Monochrome variant has near-zero chroma in the primary palette', () => {
        const seed = Color.FromHex('#1976d2');
        const scheme = makeDynamicScheme({
            name: 'mono', theme: 't', seed, isDark: false,
            variant: DynamicSchemeVariant.Monochrome,
        });
        const primary = (scheme.tokens.get('Primary') as SolidColorBrush).Color;
        // Greyscale check: R ≈ G ≈ B.
        const maxDiff = Math.max(
            Math.abs(primary.R - primary.G),
            Math.abs(primary.G - primary.B),
            Math.abs(primary.B - primary.R));
        assert.ok(maxDiff < 5, `Monochrome Primary should be near-grey, got R=${primary.R} G=${primary.G} B=${primary.B}`);
    });

    test('makeDynamicLightDarkPair returns matched schemes', () => {
        const seed = 0xFF6750A4; // material purple
        const { light, dark } = makeDynamicLightDarkPair(seed);
        assert.equal(light.name, 'auto-light');
        assert.equal(dark.name,  'auto-dark');
    });

    test('seed can be a number (ARGB) or a Color', () => {
        const a = makeDynamicScheme({ name: 'a', theme: 't', seed: 0xFF6750A4, isDark: false });
        const b = makeDynamicScheme({ name: 'b', theme: 't', seed: Color.FromHex('#6750A4'), isDark: false });
        const aPrimary = (a.tokens.get('Primary') as SolidColorBrush).Color;
        const bPrimary = (b.tokens.get('Primary') as SolidColorBrush).Color;
        // Both seeds resolve to the same primary tone (within rounding).
        assert.ok(Math.abs(aPrimary.R - bPrimary.R) < 2);
        assert.ok(Math.abs(aPrimary.G - bPrimary.G) < 2);
        assert.ok(Math.abs(aPrimary.B - bPrimary.B) < 2);
    });
});
