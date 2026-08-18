import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Color, HorizontalAlignment, Thickness, VerticalAlignment } from '../../runtime/index.js';
import {
    FontMetricsMeasurer,
    FontWeight,
    HeadlessTarget,
    SolidColorBrush,
    SvgDrawingContext,
    loadGoogleFontInto,
} from '../../visual-engine/index.js';
import { Border, TextBlock } from '../index.js';

// End-to-end demo of Google Fonts → FontMetricsMeasurer → TextBlock.
//
// Fetches the "Inter" family in two weights from Google Fonts, registers
// the TTF buffers with a FontMetricsMeasurer installed on the target,
// then renders a bold heading inside a Border so the SVG output shows
// the real per-glyph advance widths (no more approximation-driven
// over-sizing).
//
// Run with: npm run demo:gfont
// Requires network access to fonts.googleapis.com and fonts.gstatic.com.

const target = new HeadlessTarget(600, 200);

// Install a real measurer BEFORE assigning Content, so the first
// MeasureOverride for TextBlock uses font metrics.
const measurer = new FontMetricsMeasurer();
target.TextMeasurer = measurer;

console.log('Fetching Inter from Google Fonts (weights 400, 700)…');
await loadGoogleFontInto(measurer, 'Inter', { weights: [400, 700] });
console.log('Inter loaded.');

const text = new TextBlock('Hello, Mural!');
text.FontFamily = 'Inter, sans-serif';
text.FontSize = 36;
text.FontWeight = FontWeight.Bold;
text.Foreground = new SolidColorBrush(Color.White);
text.HorizontalAlignment = HorizontalAlignment.Center;
text.VerticalAlignment   = VerticalAlignment.Center;

const border = new Border(text);
border.Fill = new SolidColorBrush(Color.FromHex('#0f172a')); // slate-900
border.BorderBrush = new SolidColorBrush(Color.FromHex('#38bdf8')); // sky-400
border.BorderThickness = new Thickness(2);
border.Padding = new Thickness(28);

target.Content = border;

const dc = new SvgDrawingContext();
target.Render(dc);

const svg = dc.ToSvg(target.Width, target.Height);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'output');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'google-font.svg');
writeFileSync(outPath, svg, 'utf8');

console.log(`Wrote ${outPath}`);
console.log(svg);
