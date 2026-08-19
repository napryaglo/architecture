import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Color, HorizontalAlignment, Thickness, VerticalAlignment } from '../../runtime/index.js';
import {
    FontWeight,
    HeadlessTarget,
    Pen,
    SolidColorBrush,
    SvgDrawingContext,
} from '../../visual-engine/index.js';
import { Border, TextBlock } from '../index.js';

// Visual test: a bold white TextBlock centered inside a blue Border on
// a 400×200 surface. Exercises Border (background + stroke + padding) +
// TextBlock (text rendering with custom font properties) + the layout
// system's alignment + the SvgDrawingContext text emit path.
//
// Run with: npm run demo:text

const text = new TextBlock('Hello, Mural!');
text.FontSize = 28;
text.FontWeight = FontWeight.Bold;
text.Foreground = new SolidColorBrush(Color.White);
text.HorizontalAlignment = HorizontalAlignment.Center;
text.VerticalAlignment   = VerticalAlignment.Center;

const border = new Border(text);
border.Fill      = new SolidColorBrush(Color.FromHex('#1e40af')); // a deep blue
border.Stroke          = new Pen(new SolidColorBrush(Color.Black));
border.BorderThickness = new Thickness(3);
border.Padding         = new Thickness(20);
border.HorizontalAlignment = HorizontalAlignment.Stretch;
border.VerticalAlignment   = VerticalAlignment.Stretch;

const target = new HeadlessTarget(400, 200, border);

const dc = new SvgDrawingContext();
target.Render(dc);

const svg = dc.ToSvg(target.Width, target.Height);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'output');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'text-400x200.svg');
writeFileSync(outPath, svg, 'utf8');

console.log(`Wrote ${outPath}`);
console.log(svg);
