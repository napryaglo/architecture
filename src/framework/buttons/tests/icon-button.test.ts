import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';

import { CornerRadius } from '../../../visual-engine/index.js';
import { Border } from '../../../basic/border.js';
import { IconButton } from '../icon-button.js';
import { ButtonVariant } from '../button.js';

// IconButton inherits Button's CornerRadius DP, but — unlike Button — its
// four templates historically hardcoded @ShapeFull, so a per-instance
// CornerRadius was silently ignored and every IconButton was forced to a
// circle. The templates now TemplateBind PART_Border / PART_StateLayer to
// `$$CornerRadius` (matching the Button contract), so setting CornerRadius
// reshapes the chrome — e.g. @ShapeMedium (12dp) for a rounded-rectangle
// icon button. These tests pin that contract; without the `$$CornerRadius`
// binding the per-instance cases below fall back to CornerRadius.Full.

describe('IconButton — CornerRadius DP', () => {
    beforeEach(() => { initTestApp(); });

    test('default CornerRadius is the M3 Full pill (circle at 40×40)', () => {
        const btn = new IconButton();
        assert.equal(btn.CornerRadius, CornerRadius.Full);
    });

    test('default TemplateBinds Full onto PART_Border + PART_StateLayer', () => {
        const btn = new IconButton();
        const border = btn.visualChildren[0] as Border;
        const stateLayer = border.child as Border;
        assert.equal(border.CornerRadius, CornerRadius.Full,
            'PART_Border corner should ride $$CornerRadius from the Full default');
        assert.equal(stateLayer.CornerRadius, CornerRadius.Full,
            'PART_StateLayer corner should match PART_Border via the same binding');
    });

    test('a per-instance CornerRadius flows through to the template parts', () => {
        const btn = new IconButton();
        btn.CornerRadius = 12;                  // @ShapeMedium — rounded rectangle
        const border = btn.visualChildren[0] as Border;
        const stateLayer = border.child as Border;
        assert.equal(border.CornerRadius, 12,
            'Local CornerRadius overrides the Style setter and reaches PART_Border');
        assert.equal(stateLayer.CornerRadius, 12,
            'the state-layer overlay tracks the same per-instance corner');
    });

    test('the Standard (transparent) variant honors a per-instance CornerRadius', () => {
        // The rounded-rectangle icon button shape: Standard fill + a small
        // corner radius. Variant swap happens first so we read the Standard
        // template's PART_Border, then confirm the corner reshaped.
        const btn = new IconButton();
        btn.Variant = ButtonVariant.Standard;
        const shape = new CornerRadius(12, 12, 12, 12);
        btn.CornerRadius = shape;
        const border = btn.visualChildren[0] as Border;
        assert.equal(border.CornerRadius, shape,
            'Standard template PART_Border should reshape via $$CornerRadius');
    });
});
