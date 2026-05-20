import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Color } from '../../runtime/index.js';
import {
    HeadlessTarget,
    SolidColorBrush,
    SvgDrawingContext,
} from '../../visual-engine/index.js';
import { Canvas, TextBlock } from '../../Controls/index.js';
import {
    BuildScene,
    CollapseAntiparallelEdgesTransform,
    DedupEdgesTransform,
    GreedySwitchImprover,
    Graph,
    GraphPipeline,
    IlpExactImprover,
    MedianReorderer,
    SiftingImprover,
    TransposeImprover,
} from './index.js';
import { CustomLayout } from './layout.js';

// `ge` — graph visualization experiment harness. Builds a small
// graph, runs it through a layout, composes a Visual tree, and writes
// an SVG file. Tweak the graph topology, swap the layout, or pass
// SceneStyle options to BuildScene to iterate on visualization ideas.
//
// Run with: npm run ge   [or]   tsx src/applications/ge/main.ts [out.svg]

// Graph extracted from ai-enabled-composable-landscape.architecture.model.
// Each block is collapsed to a single node (its child components are not
// rendered separately); edges come from the file's `connector` section
// only (scenario `step`s are excluded).
const g = new Graph();

// Blocks (one node per block, children omitted).
g.AddNode('chat-surface',              'CS');
g.AddNode('command-bus',               'CB');
g.AddNode('microsoft-agent-framework', 'MAF');
g.AddNode('ai-data-sources',           'ADS');

// Standalone components.
g.AddNode('platform-api',          'API');
g.AddNode('business-agent',        'BA');
g.AddNode('agent-orchestrator',    'AO');
g.AddNode('workflow-engine',       'WE');
g.AddNode('app-database',          'DB');
g.AddNode('work-iq',               'WIQ');
g.AddNode('autonomous-agent',      'AA');
g.AddNode('analytics-surface',     'AS');
g.AddNode('service-agent',         'SA');
g.AddNode('knowledge-index',       'KI');
g.AddNode('multi-agent-workflow',  'MAW');
g.AddNode('language-model',        'LM');
g.AddNode('validator',             'V');
g.AddNode('external-tool-surface', 'ETS');
g.AddNode('legacy-tool-bridge',    'LTB');
g.AddNode('legacy-application',    'LA');

// Edges — union of all scenario `step`s. The file's top-level
// `connector` section is intentionally excluded (those are structural
// "is enabled by / talks to" relations rather than runtime call flow).
// Steps that originate from an actor (business-user, external-ai-agent)
// are skipped because actors are not part of this node set. Duplicates
// are added freely here — the GraphPipeline below collapses them via
// DedupEdgesTransform.

// scenario conversational / "User-Initiated Conversation with AI Agent"
//   business-user -> chat-surface  (actor source, skipped)
g.AddEdge('chat-surface',       'business-agent');
g.AddEdge('business-agent',     'agent-orchestrator');
g.AddEdge('agent-orchestrator', 'knowledge-index');
g.AddEdge('agent-orchestrator', 'language-model');
g.AddEdge('knowledge-index',    'ai-data-sources');
g.AddEdge('legacy-tool-bridge', 'agent-orchestrator');
g.AddEdge('legacy-application', 'legacy-tool-bridge');

// scenario autonomous-agent-execution / "Low Code Workflow with Autonomous Agent"
g.AddEdge('work-iq',            'workflow-engine');
g.AddEdge('workflow-engine',    'agent-orchestrator');
g.AddEdge('agent-orchestrator', 'knowledge-index');
g.AddEdge('knowledge-index',    'ai-data-sources');
g.AddEdge('agent-orchestrator', 'autonomous-agent');

// scenario autonomous-agent-execution / "Pro-code AI Agent Integration"
g.AddEdge('platform-api',              'command-bus');
g.AddEdge('command-bus',               'validator');
g.AddEdge('validator',                 'command-bus');
g.AddEdge('command-bus',               'microsoft-agent-framework');
g.AddEdge('microsoft-agent-framework', 'knowledge-index');
g.AddEdge('microsoft-agent-framework', 'language-model');
g.AddEdge('microsoft-agent-framework', 'service-agent');

// scenario agentic-external-integration / "External AI Agent Integration"
//   external-ai-agent -> external-tool-surface  (actor source, skipped)
g.AddEdge('external-tool-surface',     'command-bus');
g.AddEdge('command-bus',               'validator');
g.AddEdge('validator',                 'command-bus');
g.AddEdge('platform-api',              'command-bus');
g.AddEdge('command-bus',               'microsoft-agent-framework');
g.AddEdge('microsoft-agent-framework', 'knowledge-index');
g.AddEdge('microsoft-agent-framework', 'language-model');
g.AddEdge('microsoft-agent-framework', 'service-agent');
g.AddEdge('service-agent',             'microsoft-agent-framework');
g.AddEdge('multi-agent-workflow',      'microsoft-agent-framework');
g.AddEdge('service-agent',             'business-agent');
g.AddEdge('microsoft-agent-framework', 'workflow-engine');

// Pipeline — chain of transforms, each producing a new graph from the
// previous step's output. Add more stages (FilterNodesTransform,
// MapLabelsTransform, …) to filter scenarios, swap labelling schemes,
// etc., without rewriting the graph construction above.
const pipeline = new GraphPipeline()
    .Add(new DedupEdgesTransform())
    .Add(new CollapseAntiparallelEdgesTransform());
const finalGraph = pipeline.Apply(g);

// Layered layout — y-position = longest-path depth from any source,
// x-position evenly spread within each layer and centered. Sources
// (no incoming scenario steps) sit at the top; sinks at the bottom.
//
// Run both reorderers on the same graph so we can directly compare
// barycenter vs. median crossings. Whichever produces fewer geometric
// crossings is kept for the actual render. Re-running the layout is
// cheap for graphs this size.
// Compare the four LocalImprover strategies, all running on top of
// the same median reorderer. The ILP-exact improver is used for the
// actual render because it solves the per-layer 2-layer subproblem
// optimally, iterated until no layer's optimum reorder helps.
console.log('  --- median + transpose (comparison only) ---');
const layoutTranspose = new CustomLayout(100, 110, 50,
    new MedianReorderer(), new TransposeImprover());
layoutTranspose.Apply(finalGraph);

console.log('  --- median + greedy switch (comparison only) ---');
const layoutGreedy = new CustomLayout(100, 110, 50,
    new MedianReorderer(), new GreedySwitchImprover());
layoutGreedy.Apply(finalGraph);

console.log('  --- median + sifting (comparison only) ---');
const layoutSifting = new CustomLayout(100, 110, 50,
    new MedianReorderer(), new SiftingImprover());
layoutSifting.Apply(finalGraph);

console.log('  --- median + ILP exact (used for render) ---');
const layout = new CustomLayout(100, 110, 50,
    new MedianReorderer(), new IlpExactImprover());
const positions = layout.Apply(finalGraph);

console.log(`  improvers (geometric after): `
    + `transpose=${layoutTranspose.LastCrossings!.geometricAfter}, `
    + `greedy=${layoutGreedy.LastCrossings!.geometricAfter}, `
    + `sifting=${layoutSifting.LastCrossings!.geometricAfter}, `
    + `ilp=${layout.LastCrossings!.geometricAfter}`);

// Compose the Visual tree. SceneStyle overrides any of the per-node /
// per-edge defaults; left empty here for the stock look.
const scene = BuildScene(finalGraph, positions, {
    nodeRadius:    28,
    nodeFillColor: Color.FromHex('#E6F2FF'),
    edgeColor:     Color.FromHex('#666666'),
});

// Overlay the crossing-count metric in the top-left corner so the SVG
// is self-contained: open the file and the numbers are right there.
if (layout.LastCrossings !== undefined)
{
    const c = layout.LastCrossings;
    const label = new TextBlock(
        `median + ILP exact — `
        + `crossings (geometric): ${c.geometricBefore} → ${c.geometricAfter}    `
        + `(adjacent-only: ${c.adjacentBefore} → ${c.adjacentAfter})`,
    );
    label.FontSize = 13;
    label.Foreground = new SolidColorBrush(Color.FromHex('#222222'));
    Canvas.SetLeft(label, 10);
    Canvas.SetTop(label,  6);
    scene.AddChild(label);
}

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
console.log(`  raw:   ${g.nodes.length} nodes, ${g.edges.length} edges`);
console.log(`  final: ${finalGraph.nodes.length} nodes, ${finalGraph.edges.length} edges`);
