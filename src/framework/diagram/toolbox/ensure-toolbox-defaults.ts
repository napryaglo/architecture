import type { ServiceProvider } from '../../../runtime/index.js';
import { ToolboxRepository } from './toolbox-repository.js';
import { ShapeVisualResolver, ShapeVisualResolverKey } from './shape-visual-resolver.js';
import { ShapeDropFactory, ShapeDropFactoryKey } from './shape-drop-factory.js';
import { ShapeToolboxItem } from './shape-toolbox-item.js';
import { SHAPE_CATALOG } from '../shape-catalog.js';

// Idempotent first-init. Called from every Diagram ctor; guarded so N
// diagrams register once. A bare mural diagram gets a working Shapes palette
// with zero app wiring. No-op when there is no service provider (headless).
export function ensureToolboxDefaults(services: ServiceProvider | undefined): void
{
    if (services === undefined) return;

    if (!services.has(ToolboxRepository.Key))
    {
        services.registerInstance(ToolboxRepository.Key, new ToolboxRepository());
    }
    if (!services.has(ShapeVisualResolverKey))
    {
        services.registerInstance(ShapeVisualResolverKey, new ShapeVisualResolver());
    }
    if (!services.has(ShapeDropFactoryKey))
    {
        services.registerInstance(ShapeDropFactoryKey, new ShapeDropFactory());
    }

    const repo = services.getRequired(ToolboxRepository.Key);
    // Only populate a freshly-created Shapes page (EnsurePage is get-or-create).
    let hasShapes = false;
    for (let i = 0; i < repo.Pages.Count; i++) if (repo.Pages.Get(i)!.Id === 'shapes') hasShapes = true;
    if (!hasShapes)
    {
        const page = repo.EnsurePage('shapes', 'Shapes');
        for (const e of SHAPE_CATALOG) page.Items.Add(new ShapeToolboxItem(e.kind, e.label));
    }
}
