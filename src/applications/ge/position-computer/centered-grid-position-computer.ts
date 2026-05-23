import { Point } from '../../../runtime/index.js';
import type { IPositionComputer } from './position-computer.js';

// Maps a finished layer ordering to (x, y) positions. Each layer is
// centered horizontally on the same axis (so layers of different
// widths still share the same midline) and offset by `padding` so
// all coordinates stay positive — HeadlessTarget's auto-bounds
// machinery needs non-negative positions.
export class CenteredGridPositionComputer implements IPositionComputer
{
    constructor(
        public readonly layerSpacingY: number = 100,
        public readonly nodeSpacingX:  number = 110,
        public readonly padding:       number = 50,
    ) {}

    public Compute(layers: string[][]): Map<string, Point>
    {
        let maxLayerSize = 0;
        for (const ids of layers)
        {
            if (ids.length > maxLayerSize) maxLayerSize = ids.length;
        }
        const layoutWidth = Math.max(0, (maxLayerSize - 1) * this.nodeSpacingX);
        const xCenter = this.padding + layoutWidth / 2;

        const positions = new Map<string, Point>();
        for (let layer = 0; layer < layers.length; layer++)
        {
            const ids = layers[layer]!;
            const rowWidth = (ids.length - 1) * this.nodeSpacingX;
            const startX = xCenter - rowWidth / 2;
            const y = this.padding + layer * this.layerSpacingY;
            for (let i = 0; i < ids.length; i++)
            {
                positions.set(ids[i]!, new Point(startX + i * this.nodeSpacingX, y));
            }
        }
        return positions;
    }
}
