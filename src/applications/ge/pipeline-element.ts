// Common metadata that every strategy in the pipeline carries.
// Each stage's strategy interface (IReorderer, ILayerAssigner, …)
// extends IPipelineElement, so every concrete class is required to
// declare these three fields.
//
// The same metadata is mirrored in pipeline-elements.yaml — the
// repo catalogue listing one entry per (stage, class). The loader
// cross-checks the two at startup and throws if they drift.

export interface AcademicReference
{
    readonly authors: string;
    readonly year:    number;
    readonly title:   string;
    readonly venue?:  string;
}

export interface IPipelineElement
{
    // Short human-readable name of the element / variant. Shown in
    // UIs and on rendered SVGs. e.g. "Barycenter", "Median",
    // "Sparse Normalization".
    readonly Name: string;

    // Name of the underlying algorithm. May coincide with `Name`
    // for single-implementation strategies. e.g. "Brandes–Köpf
    // horizontal coordinate assignment", "Weighted median heuristic
    // (3-approximation)".
    readonly AlgorithmName: string;

    // Papers / books / chapters the implementation follows. Empty
    // array is valid for transforms and other ad-hoc utilities that
    // don't cite a specific paper.
    readonly AcademicReferences: readonly AcademicReference[];
}
