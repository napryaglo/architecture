import { readFileSync } from 'node:fs';

import { parse as parseYaml } from 'yaml';

import {
    AdjacentCrossingCounter,
    AdjacentLayerMoveImprover,
    BarycenterReorderer,
    BarycenterVerticalAligner,
    BrandesKopfPositionComputer,
    CardinalPortAssigner,
    CenteredGridPositionComputer,
    ChainDummyInserter,
    CollapseAntiparallelEdgesTransform,
    DedupEdgesTransform,
    DistributedPortAssigner,
    DropIsolatedNodesTransform,
    FilterEdgesTransform,
    FilterNodesTransform,
    GeometricCrossingCounter,
    GraphPipeline,
    GreedySwitchImprover,
    IdentityFirstLayerOrderer,
    IlpExactImprover,
    LayoutPipeline,
    LongestPathLayerAssigner,
    MapLabelsTransform,
    MedianReorderer,
    OrthogonalEdgeRouter,
    OutDegreeFirstLayerOrderer,
    PolylineEdgeRouter,
    SiftingImprover,
    SparseDummyInserter,
    StraightLineEdgeRouter,
    TransposeImprover,
    type IDummyInserter,
    type IEdgeRouter,
    type IFirstLayerOrderer,
    type IGraphTransform,
    type ILayerAssigner,
    type ILayerImprover,
    type ILocalImprover,
    type IPipelineElement,
    type IPortAssigner,
    type IPositionComputer,
    type IReorderer,
    type IVerticalAligner,
} from './index.js';

// One entry in the pipeline-configurations file.
//
// Field semantics for the `layout` block:
//   * missing field      → use LayoutPipeline's built-in default
//                          for that stage
//   * "ClassName" string → instantiate that strategy class
//                          (no-arg constructor; the class must be
//                          registered in the lookup tables below)
//   * null               → explicitly OFF (only valid for optional
//                          stages: improver, layerImprover,
//                          verticalAligner, edgeRouter, portAssigner)
//
// Transforms with constructor arguments (FilterNodesTransform,
// FilterEdgesTransform, MapLabelsTransform) are NOT representable
// here — extend the schema with an `options` object when needed.
export interface PipelineConfiguration
{
    name:         string;
    description?: string;
    transforms:   string[];
    layout: {
        layerAssigner?:     string;
        firstLayerNodes?:   string[];
        firstLayerOrderer?: string;
        layerImprover?:     string | null;
        dummyInserter?:     string;
        reorderer?:         string;
        improver?:          string | null;
        positionComputer?:  string;
        verticalAligner?:   string | null;
        portAssigner?:      string | null;
        edgeRouter?:        string | null;
    };
}

interface ConfigurationFile
{
    configurations: PipelineConfiguration[];
}

// ------------------------------------------------------------------
// Strategy registries — one per stage. To make a new implementation
// available in JSON, add it to the appropriate map. All factories
// take no arguments; switch to a (PipelineConfiguration, opts) shape
// the day strategies start carrying parameters.
// ------------------------------------------------------------------
// Transforms with no-arg constructors — these are configurable from
// JSON. The three parameterized transforms (filter / map-labels) are
// kept in PARAMETERIZED_TRANSFORMS below so the YAML repo can still
// catalogue them, but a configuration referencing them will throw.
const TRANSFORMS: Record<string, () => IGraphTransform> = {
    DedupEdgesTransform:                () => new DedupEdgesTransform(),
    CollapseAntiparallelEdgesTransform: () => new CollapseAntiparallelEdgesTransform(),
    DropIsolatedNodesTransform:         () => new DropIsolatedNodesTransform(),
};

// Transforms that need a callback at construction time. Listed here
// so they can carry metadata in the YAML repo and pass validation;
// instantiated with a stub callback for the metadata cross-check
// only. BuildPipeline does NOT consider these when resolving a
// configuration's transform list.
const PARAMETERIZED_TRANSFORMS: Record<string, () => IGraphTransform> = {
    FilterNodesTransform: () => new FilterNodesTransform(() => true),
    FilterEdgesTransform: () => new FilterEdgesTransform(() => true),
    MapLabelsTransform:   () => new MapLabelsTransform(n => n.Label),
};

const LAYER_ASSIGNERS: Record<string, () => ILayerAssigner> = {
    LongestPathLayerAssigner: () => new LongestPathLayerAssigner(),
};

const FIRST_LAYER_ORDERERS: Record<string, () => IFirstLayerOrderer> = {
    IdentityFirstLayerOrderer:  () => new IdentityFirstLayerOrderer(),
    OutDegreeFirstLayerOrderer: () => new OutDegreeFirstLayerOrderer(),
};

const LAYER_IMPROVERS: Record<string, () => ILayerImprover> = {
    AdjacentLayerMoveImprover: () => new AdjacentLayerMoveImprover(),
};

const DUMMY_INSERTERS: Record<string, () => IDummyInserter> = {
    ChainDummyInserter:  () => new ChainDummyInserter(),
    SparseDummyInserter: () => new SparseDummyInserter(),
};

const REORDERERS: Record<string, () => IReorderer> = {
    BarycenterReorderer: () => new BarycenterReorderer(),
    MedianReorderer:     () => new MedianReorderer(),
};

const IMPROVERS: Record<string, () => ILocalImprover> = {
    TransposeImprover:    () => new TransposeImprover(),
    GreedySwitchImprover: () => new GreedySwitchImprover(),
    SiftingImprover:      () => new SiftingImprover(),
    IlpExactImprover:     () => new IlpExactImprover(),
};

const POSITION_COMPUTERS: Record<string, () => IPositionComputer> = {
    CenteredGridPositionComputer: () => new CenteredGridPositionComputer(),
    BrandesKopfPositionComputer:  () => new BrandesKopfPositionComputer(),
};

const VERTICAL_ALIGNERS: Record<string, () => IVerticalAligner> = {
    BarycenterVerticalAligner: () => new BarycenterVerticalAligner(),
};

const PORT_ASSIGNERS: Record<string, () => IPortAssigner> = {
    CardinalPortAssigner:    () => new CardinalPortAssigner(),
    DistributedPortAssigner: () => new DistributedPortAssigner(),
};

const EDGE_ROUTERS: Record<string, () => IEdgeRouter> = {
    PolylineEdgeRouter:     () => new PolylineEdgeRouter(),
    OrthogonalEdgeRouter:   () => new OrthogonalEdgeRouter(),
    StraightLineEdgeRouter: () => new StraightLineEdgeRouter(),
};

// Crossing counters aren't user-selectable from configurations, but
// they're still pipeline elements — include them so the YAML repo
// validates fully.
const CROSSING_COUNTERS: Record<string, () => IPipelineElement> = {
    GeometricCrossingCounter: () => new GeometricCrossingCounter(),
    AdjacentCrossingCounter:  () => new AdjacentCrossingCounter(),
};

// Stage-name → registry mapping. The stage names here must match
// the top-level keys in pipeline-elements.yaml.
const STAGE_REGISTRIES: Record<string, Record<string, () => IPipelineElement>> = {
    'graph-transforms':    { ...TRANSFORMS, ...PARAMETERIZED_TRANSFORMS },
    'layer-assigner':      LAYER_ASSIGNERS,
    'layer-improver':      LAYER_IMPROVERS,
    'first-layer-orderer': FIRST_LAYER_ORDERERS,
    'dummy-inserter':      DUMMY_INSERTERS,
    'reorderer':           REORDERERS,
    'improver':            IMPROVERS,
    'position-computer':   POSITION_COMPUTERS,
    'vertical-aligner':    VERTICAL_ALIGNERS,
    'port-assigner':       PORT_ASSIGNERS,
    'edge-router':         EDGE_ROUTERS,
    'crossing-counter':    CROSSING_COUNTERS,
};

// ------------------------------------------------------------------
// YAML repo — pipeline-elements.yaml.
// ------------------------------------------------------------------
interface YamlReference
{
    authors: string;
    year:    number;
    title:   string;
    venue?:  string;
}

interface YamlElement
{
    name:        string;
    algorithm:   string;
    references?: YamlReference[];
}

export type PipelineElementRepository = Record<string /* stage */, Record<string /* className */, YamlElement>>;

export function LoadElementRepository(filePath: string): PipelineElementRepository
{
    const text = readFileSync(filePath, 'utf8');
    const parsed = parseYaml(text) as PipelineElementRepository;
    return parsed;
}

// Cross-checks the repo entries against the class-side metadata.
// Throws on any drift: stage missing from registries, repo entry
// missing a registry match (or vice-versa), name/algorithm mismatch,
// or reference list shape mismatch.
export function ValidateRepositoryAgainstClasses(repo: PipelineElementRepository): void
{
    const errors: string[] = [];

    for (const stage of Object.keys(repo))
    {
        const registry = STAGE_REGISTRIES[stage];
        if (registry === undefined)
        {
            errors.push(`YAML stage "${stage}" has no matching registry in configuration-loader.ts`);
            continue;
        }
        const entries = repo[stage]!;
        for (const className of Object.keys(entries))
        {
            const factory = registry[className];
            if (factory === undefined)
            {
                errors.push(`YAML entry "${stage}.${className}" has no matching class registered`);
                continue;
            }
            const inst = factory();
            const yml  = entries[className]!;

            if (inst.Name !== yml.name)
            {
                errors.push(`Name drift on ${stage}.${className}: class="${inst.Name}" yaml="${yml.name}"`);
            }
            if (inst.AlgorithmName !== yml.algorithm)
            {
                errors.push(`AlgorithmName drift on ${stage}.${className}: class="${inst.AlgorithmName}" yaml="${yml.algorithm}"`);
            }
            const ymlRefs = yml.references ?? [];
            if (inst.AcademicReferences.length !== ymlRefs.length)
            {
                errors.push(`AcademicReferences length drift on ${stage}.${className}: class=${inst.AcademicReferences.length} yaml=${ymlRefs.length}`);
            }
            else
            {
                for (let i = 0; i < ymlRefs.length; i++)
                {
                    const r = inst.AcademicReferences[i]!;
                    const y = ymlRefs[i]!;
                    if (r.authors !== y.authors || r.year !== y.year || r.title !== y.title || (r.venue ?? undefined) !== (y.venue ?? undefined))
                    {
                        errors.push(`AcademicReferences[${i}] drift on ${stage}.${className}`);
                    }
                }
            }
        }
        // Reverse direction: every registry entry must appear in the YAML.
        for (const className of Object.keys(registry))
        {
            if (!(className in entries))
            {
                errors.push(`Class ${stage}.${className} is registered in code but missing from the YAML repo`);
            }
        }
    }

    // Stages that exist in code but aren't in the YAML repo.
    for (const stage of Object.keys(STAGE_REGISTRIES))
    {
        if (!(stage in repo))
        {
            errors.push(`Stage "${stage}" is registered in code but missing from the YAML repo`);
        }
    }

    if (errors.length > 0)
    {
        throw new Error(
            `Pipeline element repository validation failed:\n  - ${errors.join('\n  - ')}`,
        );
    }
}

// ------------------------------------------------------------------
// Lookup helpers. The registries above carry both "what factory" and
// "what stage" — these helpers add validation against the repo so
// every name a configuration references must appear in the YAML.
// ------------------------------------------------------------------
function pick<T extends IPipelineElement>(
    registry: Record<string, () => T>,
    repo:     PipelineElementRepository,
    stage:    string,
    name:     string | undefined,
): T | undefined
{
    if (name === undefined) return undefined;
    if (!(stage in repo) || !(name in (repo[stage] ?? {})))
    {
        throw new Error(
            `Configuration references ${stage}.${name}, which is not declared in the YAML repo.`,
        );
    }
    const factory = registry[name];
    if (factory === undefined)
    {
        throw new Error(
            `Unknown ${stage} strategy "${name}". Registered: ${Object.keys(registry).join(', ')}`,
        );
    }
    return factory();
}

function pickOptional<T extends IPipelineElement>(
    registry: Record<string, () => T>,
    repo:     PipelineElementRepository,
    stage:    string,
    name:     string | null | undefined,
): T | undefined
{
    if (name === null) return undefined;
    return pick(registry, repo, stage, name);
}

// ------------------------------------------------------------------
// Public API.
// ------------------------------------------------------------------
export function LoadConfigurationFile(filePath: string): PipelineConfiguration[]
{
    const text = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(text) as ConfigurationFile;
    return parsed.configurations;
}

export function GetConfiguration(filePath: string, name: string): PipelineConfiguration
{
    const all = LoadConfigurationFile(filePath);
    const match = all.find(c => c.name === name);
    if (match === undefined)
    {
        throw new Error(
            `Configuration "${name}" not found in ${filePath}. Available: ${all.map(c => c.name).join(', ')}`,
        );
    }
    return match;
}

export function BuildPipeline(
    config: PipelineConfiguration,
    repo:   PipelineElementRepository,
): {
    graphPipeline:  GraphPipeline;
    layoutPipeline: LayoutPipeline;
}
{
    const graphPipeline = new GraphPipeline();
    for (const name of config.transforms)
    {
        const transform = pick(TRANSFORMS, repo, 'graph-transforms', name);
        if (transform === undefined)
        {
            throw new Error(`graph-transforms entry "${name}" could not be resolved`);
        }
        graphPipeline.Add(transform);
    }

    const L = config.layout;
    const layoutPipeline = new LayoutPipeline(
        pick(REORDERERS,             repo, 'reorderer',           L.reorderer),
        pickOptional(IMPROVERS,      repo, 'improver',            L.improver),
        pick(FIRST_LAYER_ORDERERS,   repo, 'first-layer-orderer', L.firstLayerOrderer),
        L.firstLayerNodes !== undefined ? new Set(L.firstLayerNodes) : undefined,
        pickOptional(LAYER_IMPROVERS,repo, 'layer-improver',      L.layerImprover),
        pick(LAYER_ASSIGNERS,        repo, 'layer-assigner',      L.layerAssigner),
        pick(DUMMY_INSERTERS,        repo, 'dummy-inserter',      L.dummyInserter),
        pick(POSITION_COMPUTERS,     repo, 'position-computer',   L.positionComputer),
        undefined,  // geometricCounter — keep default
        undefined,  // adjacentCounter  — keep default
        undefined,  // maxLayerImproverIterations — keep default
        pickOptional(VERTICAL_ALIGNERS, repo, 'vertical-aligner', L.verticalAligner),
        pickOptional(EDGE_ROUTERS,      repo, 'edge-router',      L.edgeRouter),
        pickOptional(PORT_ASSIGNERS,    repo, 'port-assigner',    L.portAssigner),
    );

    return { graphPipeline, layoutPipeline };
}
