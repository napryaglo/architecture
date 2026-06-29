// Integration: under the real Material theme, the Divider rules under
// each section header (Fill / Line / Connector ends) get a non-zero
// render slot so they paint, and the FillEditor's PART_HeaderRule
// collapses in lock-step with its (empty) header inside the Line
// section's embedded brush editor.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Size } from '../../../runtime/index.js';
import { Pen, SolidColorBrush, Color } from '../../../visual-engine/index.js';
import { Divider } from '../../markers/divider.js';
import { ShapeFormatControl } from '../shape-format-control.js';
import { FillEditor } from '../fill-editor.js';
import { PenEditor } from '../pen-editor.js';
import { initTestApp } from '../../../basic/tests/test-app.js';

function mounted(): ShapeFormatControl
{
    const sfc = new ShapeFormatControl();
    // Non-empty Fill + Stroke so PART_Editors is Visible (the editors
    // collapse in the "no shape selected" empty state).
    sfc.Fill   = new SolidColorBrush(Color.FromHex('#3366cc'));
    sfc.Stroke = new Pen(new SolidColorBrush(Color.FromHex('#222222')), 2);
    sfc.ShowCaps = true;
    sfc.Measure(new Size(320, 800));
    sfc.Arrange({ X: 0, Y: 0, Width: 320, Height: 800 } as never);
    return sfc;
}

describe('Formatting section divider rules — lay out under the theme', () => {

    test('Fill header rule is a visible Divider with a real slot', () => {
        initTestApp();
        const sfc = mounted();
        const fe = sfc.GetTemplateChild('PART_FillEditor') as FillEditor | undefined;
        assert.ok(fe instanceof FillEditor, 'PART_FillEditor exists');
        const rule = fe!.GetTemplateChild('PART_HeaderRule') as Divider | undefined;
        assert.ok(rule instanceof Divider, 'Fill header rule is a Divider');
        assert.ok(rule!.RenderSize.Width  > 0, `rule stretched to a real width (got ${rule!.RenderSize.Width})`);
        assert.ok(rule!.RenderSize.Height > 0, `rule has a paintable height (got ${rule!.RenderSize.Height})`);
    });

    test('embedded Line-section brush editor (Header="") collapses its rule', () => {
        initTestApp();
        const sfc = mounted();
        const pe = sfc.GetTemplateChild('PART_PenEditor') as PenEditor | undefined;
        assert.ok(pe instanceof PenEditor, 'PART_PenEditor exists');
        const brushEditor = pe!.GetTemplateChild('PART_BrushEditor') as FillEditor | undefined;
        assert.ok(brushEditor instanceof FillEditor, 'PenEditor embeds a FillEditor');
        const innerRule = brushEditor!.GetTemplateChild('PART_HeaderRule') as Divider | undefined;
        assert.ok(innerRule instanceof Divider, 'inner rule exists');
        // Header="" → both the header and its rule are collapsed (zero slot).
        assert.equal(innerRule!.RenderSize.Height, 0,
            'embedded brush editor shows no divider (collapsed)');
    });
});
