import { Port, PortCoordSpace, PortSide } from '../port.js';
import { BoundingBoxPorts } from './bounding-box-ports.js';
import { CustomPortProvider } from './custom-port-provider.js';
import { RadialPorts } from './radial-ports.js';
import { VertexPorts } from './vertex-ports.js';
import type { IPortProvider } from './port-provider.js';

// Per-kind default providers. Keyed on Figure.Kind (the lowercase
// kebab string the catalog uses — see
// [shape-catalog.ts](../shape-catalog.ts) SHAPE_CATALOG entries).
//
// Coverage is intentionally minimal — only kinds whose topology is
// genuinely better served by something other than bbox-edge ports
// get a custom entry. Everything else falls through to FALLBACK_PROVIDER
// (1 port per bbox side); consumers override per-Figure via
// Figure.PortProvider when they need something different.
//
// Kept as a side-table inside the framework rather than a static on
// each Shape subclass — that would couple the diagram framework to
// [src/basic/shapes/](../../../basic/shapes/), which today owns the
// shape catalog without knowing connectors exist. See § 1a + § 3.8 of
// [docs/connectors.md](../../../../docs/connectors.md).
const DEFAULT_PORT_PROVIDERS: ReadonlyMap<string, IPortProvider> = new Map<string, IPortProvider>([
    ['rectangle', new BoundingBoxPorts({ portsPerSide: 1 })],
    ['ellipse',   new RadialPorts({ count: 4 })],
    ['triangle',  new VertexPorts({ includeMidpoints: false })],
    ['heart',     new CustomPortProvider(() => [
        new Port({ Name: 'top-left',  CoordSpace: PortCoordSpace.Outline, OutlineT: 0.10, Side: PortSide.N }),
        new Port({ Name: 'top-right', CoordSpace: PortCoordSpace.Outline, OutlineT: 0.40, Side: PortSide.N }),
        new Port({ Name: 'bottom',    CoordSpace: PortCoordSpace.Outline, OutlineT: 0.75, Side: PortSide.S }),
    ])],
]);

const FALLBACK_PROVIDER: IPortProvider = new BoundingBoxPorts({ portsPerSide: 1 });

// Duck-typed on `Kind` so default-port-providers.ts stays a leaf
// import — no Figure dependency. Combined-geometry figures (boolean
// op results) carry Kind = '' and route through FALLBACK_PROVIDER.
export function resolveDefaultPortProvider(host: { readonly Kind: string }): IPortProvider
{
    return DEFAULT_PORT_PROVIDERS.get(host.Kind) ?? FALLBACK_PROVIDER;
}
