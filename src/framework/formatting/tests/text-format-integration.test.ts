import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Rect, Size } from '../../../runtime/index.js';
import {
    SvgDrawingContext, Color, SolidColorBrush,
    FontWeight, FontStyle, TextDecorations,
} from '../../../visual-engine/index.js';
import { TextBlock } from '../../../basic/text-block.js';
import { ToggleButton } from '../../buttons/toggle-button.js';
import { FontFamilyPicker, FontSizePicker } from '../font-pickers.js';

// End-to-end: the editors expose values; a bridge (mirroring the demo's
// attachFormatBridge) applies them to a sample paragraph; the rendered
// SVG carries the corresponding attributes. Proves the whole editor →
// paragraph path, not just each control in isolation.
function svgOf(tb: TextBlock): string
{
    tb.Measure(new Size(600, 200));
    tb.Arrange(new Rect(0, 0, 600, 200));
    const dc = new SvgDrawingContext();
    tb.Render(dc);
    return dc.ToSvg(600, 200);
}

describe('text-format editors → sample paragraph', () => {
    beforeEach(() => { initTestApp(); });

    test('family / size / bold / italic / underline / colour all land in the render', () => {
        const family = new FontFamilyPicker();
        const size   = new FontSizePicker();
        const bold   = new ToggleButton();
        const italic = new ToggleButton();
        const underline = new ToggleButton();
        const sample = new TextBlock('Sample');

        // Bridge — what the demo bootstrap wires from the VM primitives.
        const apply = (): void =>
        {
            sample.FontFamily = family.Text;
            sample.FontSize = size.Value;
            sample.FontWeight = bold.IsChecked ? FontWeight.Bold : FontWeight.Normal;
            sample.FontStyle = italic.IsChecked ? FontStyle.Italic : FontStyle.Normal;
            sample.TextDecorations = underline.IsChecked ? TextDecorations.Underline : TextDecorations.None;
            sample.Foreground = new SolidColorBrush(Color.FromHex('#1d4ed8'));
        };

        // "Edit" via the editors the way a user would.
        family.Text = 'Georgia';
        size.Value = 28;
        bold.IsChecked = true;
        underline.IsChecked = true;
        apply();

        const svg = svgOf(sample);
        assert.match(svg, /font-family="Georgia"/);
        assert.match(svg, /font-size="28"/);
        assert.match(svg, /font-weight="bold"/);
        assert.match(svg, /text-decoration="underline"/);
        assert.match(svg, /rgb\(29,\s*78,\s*216\)/, 'foreground colour (#1d4ed8) lands');
        assert.ok(!svg.includes('font-style="italic"'), 'italic off → no italic attr');
    });

    test('typing an arbitrary size in the picker flows through to the render', () => {
        const size   = new FontSizePicker();
        const sample = new TextBlock('X');
        size.Text = '13';                 // typed, non-preset
        sample.FontSize = size.Value;
        assert.equal(size.Value, 13);
        assert.match(svgOf(sample), /font-size="13"/);
    });
});
