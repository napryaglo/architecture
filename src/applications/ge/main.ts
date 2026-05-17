import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Color, Point } from '../../runtime/index.js';
import {
    HeadlessTarget,
    SolidColorBrush,
    SvgDrawingContext,
} from '../../visual-engine/index.js';
import {
    BuildScene,
    CircularLayout,
    Graph,
} from './index.js';

// `ge` — graph visualization experiment harness. Builds a small
// graph, runs it through a layout, composes a Visual tree, and writes
// an SVG file. Tweak the graph topology, swap the layout, or pass
// SceneStyle options to BuildScene to iterate on visualization ideas.
//
// Run with: npm run ge   [or]   tsx src/applications/ge/main.ts [out.svg]

// Sample graph — a 7-node "hub and spoke + a triangle on the side"
// shape. Replace this block with whatever topology you're investigating.
const g = new Graph();
g.AddNode('center', 'Hub');
g.AddNode('n', 'North');
g.AddNode('e', 'East');
g.AddNode('s', 'South');
g.AddNode('w', 'West');
g.AddNode('p', 'P');
g.AddNode('q', 'Q');

g.AddEdge('center', 'n');
g.AddEdge('center', 'e');
g.AddEdge('center', 's');
g.AddEdge('center', 'w');
g.AddEdge('n', 'e');
g.AddEdge('e', 's');
g.AddEdge('s', 'w');
g.AddEdge('w', 'n');
g.AddEdge('p', 'q');
g.AddEdge('p', 'center');

// Layout — swap the line below for GridLayout or ManualLayout to
// experiment with placement. The center is chosen so all node centers
// stay within the canvas with room for the node radii.
const positions = new CircularLayout(new Point(300, 300), 200).Apply(g);

// Compose the Visual tree. SceneStyle overrides any of the per-node /
// per-edge defaults; left empty here for the stock look.
const scene = BuildScene(g, positions, {
    nodeRadius:    28,
    nodeFillColor: Color.FromHex('#E6F2FF'),
    edgeColor:     Color.FromHex('#666666'),
});

// Auto-mode target — the canvas sizes to the scene's bounding box.
// Set Width / Height explicitly here to pin a fixed-size canvas instead.
const target = new HeadlessTarget(undefined, undefined, scene);
target.Background = new SolidColorBrush(Color.White);

const dc = new SvgDrawingContext();
target.Render(dc);

const svg = dc.ToSvg(target.ActualWidth, target.ActualHeight);

const outPath = resolve(process.cwd(), process.argv[2] ?? 'ge.svg');
writeFileSync(outPath, svg, 'utf8');

console.log(`Wrote ${outPath} (${target.ActualWidth}x${target.ActualHeight})`);
console.log(`  ${g.nodes.length} nodes, ${g.edges.length} edges`);
