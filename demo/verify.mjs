// Headless verification of the HTML demo's runtime pipeline. Runs the
// same compile + render path the browser does, but in Node so we can
// assert that:
//   1. The .mu source parses + compiles without errors.
//   2. instantiate() returns a real Application.
//   3. The Visual tree paints to SVG via HeadlessTarget + SvgDrawingContext.
//
// Run with:  npm run build && node demo/verify.mjs
//
// Writes the SVG to demo/demos/dashboard/dashboard.svg for inspection.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { instantiate } from '../dist/compiler/index.js';
import * as runtime    from '../dist/runtime/index.js';
import * as controls   from '../dist/Controls/index.js';
import * as engine     from '../dist/visual-engine/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const dashboardDir = join(here, 'demos', 'dashboard');
const src = readFileSync(join(dashboardDir, 'dashboard.mu'), 'utf8');

const ctx = { ...runtime, ...controls, ...engine };
const app = instantiate(src, ctx);

if (!(app instanceof runtime.Application)) {
    throw new Error('instantiate() did not return an Application');
}
if (app.Root === undefined) {
    throw new Error('Application has no x:root');
}

const W = 460, H = 320;
const target = new engine.HeadlessTarget(W, H, app.Root);
const dc = new engine.SvgDrawingContext();
target.Render(dc);
const svg = dc.ToSvg(W, H);

const outPath = join(dashboardDir, 'dashboard.svg');
writeFileSync(outPath, svg, 'utf8');
console.log(`✓ verified: ${outPath} (${svg.length} bytes)`);
