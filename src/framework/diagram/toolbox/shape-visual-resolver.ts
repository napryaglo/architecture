import { ServiceKey, type Visual } from '../../../runtime/index.js';
import { DiagramSettings } from '../diagram-settings.js';
import { Figure } from '../figure.js';
import { VisualContext, type IToolboxVisualResolver } from './toolbox-visual-resolver.js';
import type { ToolboxVisualDescriptor } from './toolbox-visual-descriptor.js';

export const ShapeVisualResolverKey = new ServiceKey<IToolboxVisualResolver>('ShapeVisualResolver');

// Built-in shapes are always ready: no placeholder, never fires changed.
// Tile → a non-hit-test preview Figure at the toolbox tile size the old
// ToolboxShape built; Figure → a default-size Figure (unused by
// ShapeDropFactory, defined for completeness). Tile size and preview fill are
// tunable via DiagramSettings (Diagram · Toolbox).
export class ShapeVisualResolver implements IToolboxVisualResolver
{
    public Resolve(descriptor: ToolboxVisualDescriptor, context: VisualContext): Visual
    {
        const size = context === VisualContext.Tile
            ? DiagramSettings.ToolboxTileSize()
            : DiagramSettings.ShapeDefaultSize();
        const fig = Figure.fromKind(descriptor.Key, 0, 0, { width: size, height: size });
        fig.Fill = DiagramSettings.ToolboxPreviewFill();
        if (context === VisualContext.Tile) fig.IsHitTestVisible = false;
        return fig;
    }

    // Always-ready resolver: no-op listener surface.
    public AddChangedListener(_cb: (key: string) => void): void {}
    public RemoveChangedListener(_cb: (key: string) => void): void {}
}
