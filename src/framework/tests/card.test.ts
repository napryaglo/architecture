import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';

import { Border } from '../../basic/border.js';
import { ContentPresenter } from '../../basic/templates/content-presenter.js';
import { TextBlock } from '../../basic/text-block.js';
import { Card, CardVariant } from '../card.js';

describe('Card — Variant DP', () => {
    beforeEach(() => { initTestApp(); });

    test('Variant default is Filled', () => {
        const card = new Card();
        assert.equal(card.Variant, CardVariant.Filled);
    });

    test('Variant is a settable, get-roundtrips DP', () => {
        const card = new Card();
        card.Variant = CardVariant.Elevated;
        assert.equal(card.Variant, CardVariant.Elevated);
        card.Variant = CardVariant.Outlined;
        assert.equal(card.Variant, CardVariant.Outlined);
    });
});

describe('Card — default template', () => {
    beforeEach(() => { initTestApp(); });

    test('Filled card installs PART_Border + PART_StateLayer + ContentPresenter', () => {
        const card = new Card();
        const root = card.visualChildren[0];
        assert.ok(root instanceof Border,
            'template root should be a Border (PART_Border)');
        const stateLayer = (root as Border).child;
        assert.ok(stateLayer instanceof Border,
            'PART_Border child should be the PART_StateLayer Border');
        const presenter = (stateLayer as Border).child;
        assert.ok(presenter instanceof ContentPresenter,
            'PART_StateLayer child should be the ContentPresenter slot');
    });

    test('Filled variant has no Effect at rest (M3 spec)', () => {
        const card = new Card();
        const root = card.visualChildren[0] as Border;
        assert.equal(root.Effect, undefined,
            'Filled card should not carry a resting Effect (no elevation at rest)');
    });

    test('Content set on Card slots into the templated ContentPresenter', () => {
        const card = new Card();
        const body = new TextBlock('Card body');
        card.Content = body;
        const root = card.visualChildren[0] as Border;
        const stateLayer = root.child as Border;
        const presenter = stateLayer.child as ContentPresenter;
        assert.equal(presenter.visualChildren[0], body);
    });
});

describe('Card — variant templates', () => {
    beforeEach(() => { initTestApp(); });

    test('Elevated variant installs a Border with a resting Effect (ElevationLevel1)', () => {
        const card = new Card();
        card.Variant = CardVariant.Elevated;
        const root = card.visualChildren[0] as Border;
        assert.ok(root.Effect !== undefined,
            'Elevated card should carry a resting Effect — the M3 ElevationLevel1 dual-shadow ramp');
    });

    test('Outlined variant installs a Border with a 1-DIP outline', () => {
        const card = new Card();
        card.Variant = CardVariant.Outlined;
        const root = card.visualChildren[0] as Border;
        // BorderThickness can be a Thickness instance or a uniform number,
        // depending on the renderer. Just assert it isn't zero.
        const t = root.BorderThickness;
        const isThicknessObj = t !== undefined && typeof t === 'object';
        const left  = isThicknessObj ? (t as { Left: number }).Left : (t as number);
        assert.ok(left > 0,
            'Outlined card should carry a non-zero border thickness');
        // Outlined carries no resting Effect — the outline is the
        // emphasis cue, not an elevation shadow.
        assert.equal(root.Effect, undefined,
            'Outlined card should not carry a resting Effect');
    });
});
