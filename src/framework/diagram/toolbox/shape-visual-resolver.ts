import { Color, ServiceKey, type Visual } from '../../../runtime/index.js';
import { SolidColorBrush } from '../../../visual-engine/index.js';
import { Figure } from '../figure.js';
import { VisualContext, type IToolboxVisualResolver } from './toolbox-visual-resolver.js';
import type { ToolboxVisualDescriptor } from './toolbox-visual-descriptor.js';

export const ShapeVisualResolverKey = new ServiceKey<IToolboxVisualResolver>('ShapeVisualResolver');

const TILE_SIZE = 48;
const PREVIEW_FILL = new SolidColorBrush(Color.FromHex('#1976d2'));

// Built-in shapes are always ready: no placeholder, never fires changed.
// Tile → the 48x48 non-hit-test preview Figure the old ToolboxShape built;
// Figure → a default-size Figure (unused by ShapeDropFactory, defined for
// completeness).
export class ShapeVisualResolver implements IToolboxVisualResolver
{
    public Resolve(descriptor: ToolboxVisualDescriptor, context: VisualContext): Visual
    {
        const size = context === VisualContext.Tile ? TILE_SIZE : 80;
        const fig = Figure.fromKind(descriptor.Key, 0, 0, { width: size, height: size });
        fig.Fill = PREVIEW_FILL;
        if (context === VisualContext.Tile) fig.IsHitTestVisible = false;
        return fig;
    }

    // Always-ready resolver: no-op listener surface.
    public AddChangedListener(_cb: (key: string) => void): void {}
    public RemoveChangedListener(_cb: (key: string) => void): void {}
}
