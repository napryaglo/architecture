import type opentype from 'opentype.js';

import type { ValueConverter } from '../../runtime/index.js';
import { PathGeometry, fontGlyphRunToGeometry } from '../../visual-engine/index.js';

// Converter: a string of characters → the PathGeometry of their glyph
// outlines in a configured font. Pairs with a Shape so an icon-font
// glyph (or any text run) renders as vector geometry:
//
//   Shape[Geometry=$Icon << glyph_geo, Fill=@OnSurface, Width=24, Height=24]
//
// where the host authors a configured instance, e.g.
//
//   const glyph_geo = new GlyphGeometryConverter(measurer,
//       { fontFamily: 'Material Symbols Outlined', fontSize: 24 });
//
// Shape's uniform fit-transform scales the run into its slot, so
// `fontSize` only sets the geometry's coordinate scale, not final px.
//
// IMPORTANT — no ligatures. The underlying lowering walks glyphs per
// character (charToGlyph) and skips GSUB, so icon-font ligature names
// like "home" do NOT resolve; bind the raw codepoint character
// ('') instead. See `fontGlyphRunToGeometry`.
//
// Font-load timing: `convert` is synchronous. If no matching font is
// loaded yet it returns an empty geometry (nothing drawn) and the
// binding won't re-fire when the font later arrives — load the font
// into the source before the bound property is set.

// What the converter needs from a font provider: turn a run of text in
// a named family/size/variant into a PathGeometry. `FontMetricsMeasurer`
// satisfies this structurally; `fontGlyphSource` adapts a bare parsed
// opentype.Font to it.
export interface GlyphGeometrySource
{
    BuildGeometry(
        text: string,
        fontFamily: string,
        fontSize: number,
        fontWeight: string,
        fontStyle: string,
    ): PathGeometry;
}

export interface GlyphGeometryOptions
{
    /** Family key as loaded into the source. Ignored by a single-font source. */
    fontFamily?: string;
    /** Em size driving the geometry's coordinate scale. Default 24. */
    fontSize?:   number;
    fontWeight?: string;
    fontStyle?:  string;
}

export class GlyphGeometryConverter implements ValueConverter
{
    constructor(
        private readonly source: GlyphGeometrySource,
        private readonly opts: GlyphGeometryOptions = {},
    ) {}

    public convert(value: unknown): PathGeometry
    {
        const text = typeof value === 'string' ? value : '';
        if (text === '') return new PathGeometry([]);
        return this.source.BuildGeometry(
            text,
            this.opts.fontFamily ?? '',
            this.opts.fontSize   ?? 24,
            this.opts.fontWeight ?? 'normal',
            this.opts.fontStyle  ?? 'normal',
        );
    }

    // One-way — geometry → glyph isn't meaningful, so no convertBack.
}

// Adapter: wrap a single parsed opentype.Font as a GlyphGeometrySource.
// The family / weight / style arguments are ignored (one font, one
// variant); only `size` matters.
export function fontGlyphSource(font: opentype.Font): GlyphGeometrySource
{
    return {
        BuildGeometry(text, _family, size, _weight, _style)
        {
            return fontGlyphRunToGeometry(font, text, size);
        },
    };
}
