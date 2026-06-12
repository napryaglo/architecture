// Renderer-side visual effect applied to a Visual's painted output.
//
// Modelled after WPF's `System.Windows.Media.Effects.Effect`. The
// concrete renderer asks the effect for a CSS `filter` chunk and
// installs it on the visual's wrapper element. Effects compose with
// the regular paint pipeline — Background, Border, content draw
// normally, then the rasterised output gets the filter applied.
//
// V1 is single-effect-per-visual + CSS-filter only. WPF's
// EffectInput/EffectOutput shader pipeline is out of scope, and the
// SVG-target's existing `<filter>` machinery isn't reused either —
// CSS `filter` works across both the HtmlTarget (SVG-backed) and
// downstream raster contexts without each having to register an
// `<filter>` element. Multi-shadow stacks (M3 elevation uses two
// shadows per level) need a sibling effect class — see
// MaterialElevationEffect — but the base contract stays the same.
export abstract class Effect
{
    // Returns one or more `filter` functions (e.g.
    // "drop-shadow(2px 4px 6px rgba(0,0,0,0.3))") concatenated by spaces.
    // The renderer assigns the result directly to `element.style.filter`.
    public abstract toCssFilter(): string;
}
