import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { TextBlock } from '../../../basic/text-block.js';
import { Shape } from '../../../basic/shapes/shape.js';
import { RectangleGeometry } from '../../../visual-engine/index.js';
import { ToolBarToggleButton } from '../tool-bar-items.js';

// Regression: the command-bar toggle icon must follow the ToolBarToggleButton's
// checked-ink flip. The button Style sets its inherited TextBlock.Foreground to
// @OnSurfaceVariant at rest and @OnPrimary while checked; a bare icon Shape (Fill
// UNSET) paints through that inherited Foreground. If a template hardcodes the
// Shape.Fill, the icon is pinned to the resting ink and reads wrong (dark on the
// @Primary checked fill) — the reported bug. This guards the "Fill unset" contract.
describe('ToolBarToggleButton — bare icon follows the checked-ink flip', () => {
    beforeEach(() => { initTestApp(); });

    test('a Fill-less icon Shape inherits a DIFFERENT foreground when checked', () => {
        const tb = new ToolBarToggleButton();
        const icon = new Shape();
        icon.Geometry = new RectangleGeometry({ X: 0, Y: 0, Width: 10, Height: 10 } as never, 0, 0) as never;
        // No Fill set — this is the contract the command toggle template relies on.
        assert.equal(icon.Fill, undefined, 'icon Shape starts with no explicit Fill');
        (tb as unknown as { Content: unknown }).Content = icon;

        const target = new HeadlessTarget(200, 60);
        target.Content = tb as never;
        target.Flush();

        // The inherited ink the Shape falls back to at rest.
        const resting = icon.get_property_value(TextBlock.ForegroundKey);
        assert.ok(resting !== undefined, 'resting icon inherits the button foreground (@OnSurfaceVariant)');

        tb.IsChecked = true;
        target.Flush();

        const checked = icon.get_property_value(TextBlock.ForegroundKey);
        assert.ok(checked !== undefined, 'checked icon inherits the button foreground (@OnPrimary)');
        assert.notEqual(checked, resting,
            'checked ink differs from resting ink — the icon follows the toggle flip (would be pinned if Fill were hardcoded)');

        // Sanity: the checked ink is the theme @OnPrimary the Style flips to.
        const onPrimary = Application.current!.Resources.Get('OnPrimary');
        if (onPrimary !== undefined) assert.equal(checked, onPrimary, 'checked ink is @OnPrimary');
    });
});
