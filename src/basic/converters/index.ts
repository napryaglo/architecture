// Barrel for Basic's ValueConverters — reusable `convert` / `convertBack`
// objects wired to bindings (in markup via the `$path << converter`
// operator, or in code through `BindingOptions.converter`).
export { AlternationConverter } from './alternation-converter.js';
export {
    GlyphGeometryConverter,
    fontGlyphSource,
    type GlyphGeometrySource,
    type GlyphGeometryOptions,
} from './glyph-geometry-converter.js';
