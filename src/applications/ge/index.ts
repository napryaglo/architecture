// Barrel re-exports for the `ge` graph-visualization framework.
// Consumers (currently main.ts; future experiment scripts) import
// from here rather than the individual files. Strategy implementations
// live in stage-named subfolders; this barrel re-exports each
// subfolder's index for one-stop consumption.
export { Node, Edge, Graph } from './graph.js';
export {
    NodeVisual,
    EdgeVisual,
    BuildScene,
    type SceneStyle,
} from './scene.js';
export * from './layer-assigner/index.js';        // Stage 2
export * from './dummy-inserter/index.js';        // Stage 5
export * from './position-computer/index.js';     // Stage 8
export * from './crossing-counter/index.js';      // diagnostics
export * from './vertical-aligner/index.js';      // Stage 9
export * from './edge-router/index.js';           // Stage 10
export * from './port-assigner/index.js';         // Stage 11
export * from './layouts/index.js';
export * from './graph-transforms/index.js';      // Stage 1
export * from './layer-improver/index.js';        // Stage 3
export * from './first-layer-orderer/index.js';   // Stage 4
export * from './reorderer/index.js';             // Stage 6
export * from './improver/index.js';              // Stage 7
export {
    type IPipelineElement,
    type AcademicReference,
} from './pipeline-element.js';
export {
    type PipelineConfiguration,
    type PipelineElementRepository,
    LoadConfigurationFile,
    LoadElementRepository,
    ValidateRepositoryAgainstClasses,
    GetConfiguration,
    BuildPipeline,
} from './configuration-loader.js';
