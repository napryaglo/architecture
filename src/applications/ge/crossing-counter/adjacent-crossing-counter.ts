import type { Edge } from '../graph.js';
import type { AcademicReference } from '../pipeline-element.js';
import type { IAdjacentCrossingCounter } from './crossing-counter.js';

// Counts edge crossings between every pair of ADJACENT layers in the
// supplied ordering. Two edges (uFrom in L → uTo in L+1) and
// (vFrom in L → vTo in L+1) cross iff their endpoints land in
// opposite order on the two layers.
//
// Multi-layer edges (those spanning more than one layer, e.g.
// L0 → L3) are skipped here for the same reason the within-layer
// reorderer ignores them: handling them properly would need dummy
// nodes on every intermediate layer. They still contribute visual
// crossings in the rendered SVG, just not to this metric.
export class AdjacentCrossingCounter implements IAdjacentCrossingCounter
{
    public readonly Name               = 'Adjacent Inversions';
    public readonly AlgorithmName      = 'Pairwise inversion count across adjacent layers';
    public readonly AcademicReferences: readonly AcademicReference[] = [];

    public Count(layers: string[][], edges: Edge[]): number
    {
        const layerOf = new Map<string, number>();
        const indexInLayer = new Map<string, number>();
        for (let L = 0; L < layers.length; L++)
        {
            for (let i = 0; i < layers[L]!.length; i++)
            {
                const id = layers[L]![i]!;
                layerOf.set(id, L);
                indexInLayer.set(id, i);
            }
        }

        // Bucket adjacent-layer edges by their source layer.
        const byLayerPair = new Map<number, Array<{ fromIdx: number; toIdx: number }>>();
        for (const e of edges)
        {
            const lFrom = layerOf.get(e.From);
            const lTo = layerOf.get(e.To);
            if (lFrom === undefined || lTo === undefined) continue;
            if (lTo - lFrom !== 1) continue;
            if (!byLayerPair.has(lFrom)) byLayerPair.set(lFrom, []);
            byLayerPair.get(lFrom)!.push({
                fromIdx: indexInLayer.get(e.From)!,
                toIdx:   indexInLayer.get(e.To)!,
            });
        }

        let count = 0;
        for (const pairEdges of byLayerPair.values())
        {
            for (let i = 0; i < pairEdges.length; i++)
            {
                const a = pairEdges[i]!;
                for (let j = i + 1; j < pairEdges.length; j++)
                {
                    const b = pairEdges[j]!;
                    if ((a.fromIdx < b.fromIdx && a.toIdx > b.toIdx) ||
                        (a.fromIdx > b.fromIdx && a.toIdx < b.toIdx))
                    {
                        count++;
                    }
                }
            }
        }
        return count;
    }
}
