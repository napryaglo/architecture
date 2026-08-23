import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Color, Thickness } from '../../runtime/index.js';
import {
    HeadlessTarget,
    Pen,
    SolidColorBrush,
    SvgDrawingContext,
} from '../../visual-engine/index.js';
import { Border } from '../index.js';

// Smoke / visual test: builds a 100×100 Border with a blue Fill
// and a 3px black BorderBrush, mounts it on a HeadlessTarget, drives
// one render pass through the minimal SvgDrawingContext, and writes
// the resulting SVG to src/Controls/tests/output/border-100x100.svg.
// Open the SVG in a browser to verify the rendering.
//
// Run with: npm run demo:border

// Build the scene.
const border = new Border();
border.Fill      = new SolidColorBrush(Color.Blue);
border.Stroke          = new Pen(new SolidColorBrush(Color.Black), 3);
border.Width = 100;
border.Height = 100;
// Mount it on a 100×100 host-less target. Constructor seeds the
// Visual-host back-pointer through PresentationTarget.Content; the
// Border's tree now knows it's attached.
const target = new HeadlessTarget(300, 300, border);

// Drive one full layout + render pass. HeadlessTarget.Render measures
// Content against the surface, arranges it to the full rect, then walks
// the tree calling Visual.Render(dc) for every node.
const dc = new SvgDrawingContext();
target.Render(dc);

// Wrap the buffered draw output as a standalone SVG document and write
// to disk for visual inspection.
const svg = dc.ToSvg(target.Width, target.Height);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'output');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'border-300x300.svg');
writeFileSync(outPath, svg, 'utf8');

console.log(`Wrote ${outPath}`);
console.log(svg);
