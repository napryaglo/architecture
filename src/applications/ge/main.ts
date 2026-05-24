import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Color } from '../../runtime/index.js';
import {
    HeadlessTarget,
    SolidColorBrush,
    SvgDrawingContext,
} from '../../visual-engine/index.js';
import { Canvas, TextBlock } from '../../Controls/index.js';
import {
    BuildPipeline,
    BuildScene,
    GetConfiguration,
    Graph,
    LoadElementRepository,
    ValidateRepositoryAgainstClasses,
} from './index.js';

// `ge` — graph visualization experiment harness. Builds a small
// graph, runs it through a pipeline declared in
// pipeline-configurations.json, composes a Visual tree, and writes
// an SVG file.
//
// Run with: npm run ge   [or]   tsx src/applications/ge/main.ts [out.svg] [configName]

// Graph extracted from ai-enabled-composable-landscape.architecture.model.
// Each block is collapsed to a single node (its child components are not
// rendered separately); edges come from the file's `connector` section
// only (scenario `step`s are excluded).
const g = new Graph();

// Actors (pinned to L0 by the firstLayerNodes constraint in the config).
g.AddNode('business-user',     'BU');
g.AddNode('external-ai-agent', 'EAI');

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

// Edges — union of all scenario `step`s. Duplicates are dropped by
// the DedupEdgesTransform stage declared in the configuration.

// scenario conversational / "User-Initiated Conversation with AI Agent"
g.AddEdge('business-user',      'chat-surface');
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
g.AddEdge('external-ai-agent',         'external-tool-surface');
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

// ------------------------------------------------------------------
// Pipeline assembly from a named configuration.
// ------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const repo = LoadElementRepository(resolve(here, 'pipeline-elements.yaml'));
ValidateRepositoryAgainstClasses(repo);

const configName = process.argv[3] ?? 'default';
const config     = GetConfiguration(resolve(here, 'pipeline-configurations.json'), configName);
const { graphPipeline, layoutPipeline } = BuildPipeline(config, repo);

const finalGraph = graphPipeline.Apply(g);
const positions  = layoutPipeline.Apply(finalGraph);

// Compose the Visual tree. SceneStyle overrides any of the per-node /
// per-edge defaults; left empty here for the stock look.
const scene = BuildScene(finalGraph, positions, {
    nodeRadius:    28,
    nodeFillColor: Color.FromHex('#E6F2FF'),
    edgeColor:     Color.FromHex('#666666'),
    drawGrid:      true,
}, layoutPipeline.LastRoutes);

// Overlay the configuration name + crossing-count metric in the
// top-left corner so the SVG is self-contained.
if (layoutPipeline.LastCrossings !== undefined)
{
    const c = layoutPipeline.LastCrossings;
    const description = config.description !== undefined ? ` — ${config.description}` : '';
    const label = new TextBlock(
        `${config.name}${description}    `
        + `crossings (geometric): ${c.geometricBefore} → ${c.geometricAfter}    `
        + `(adjacent-only: ${c.adjacentBefore} → ${c.adjacentAfter})`,
    );
    label.FontSize = 13;
    label.Foreground = new SolidColorBrush(Color.FromHex('#222222'));
    Canvas.SetLeft(label, 10);
    Canvas.SetTop(label,  6);
    scene.AddChild(label);
}

const target = new HeadlessTarget(undefined, undefined, scene);
target.Background = new SolidColorBrush(Color.White);

const dc = new SvgDrawingContext();
target.Render(dc);

const svg = dc.ToSvg(target.ActualWidth, target.ActualHeight);

const outPath = resolve(process.cwd(), process.argv[2] ?? 'ge.svg');
writeFileSync(outPath, svg, 'utf8');

console.log(`Wrote ${outPath} (${target.ActualWidth}x${target.ActualHeight})`);
console.log(`  config: ${config.name}`);
console.log(`  raw:    ${g.nodes.length} nodes, ${g.edges.length} edges`);
console.log(`  final:  ${finalGraph.nodes.length} nodes, ${finalGraph.edges.length} edges`);
