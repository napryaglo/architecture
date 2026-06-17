import opentype from 'opentype.js';
import type {
    TextMeasurer,
    TextMetrics,
} from '../../runtime/index.js';
import { ApproximateTextMeasurer } from '../../runtime/index.js';
import { PathFigure, PathGeometry } from '../geometry/geometry.js';
import { glyphToFigures } from './glyph-to-geometry.js';

// TextMeasurer backed by opentype.js. Parses real TTF/OTF/WOFF font
// files and computes per-glyph advance widths + kerning, plus ascent /
// descent from the font's OS/2 table. Works in both Node and browser
// — opentype.js is pure JS once a buffer is in hand.
//
// Storage: Map<family, Map<weight|style key, parsed Font>>. LoadFont
// auto-detects weight (OS/2 usWeightClass — anything ≥ 600 is bold) and
// style (OS/2 fsSelection bit 0 — italic flag) from the font itself;
// explicit weight / style args override the detection (useful when the
// font's metadata is wrong or when you want to alias a variant).
//
// Measure walks the comma-separated family list ("Inter, sans-serif")
// and uses the first match. If no exact weight + style match is found
// within a family, it falls back to that family's normal|normal. If the
// family itself isn't loaded, the entire measurement falls back to the
// shared ApproximateTextMeasurer so callers always get sensible output
// (matching what they'd see before the measurer was wired in).
export class FontMetricsMeasurer implements TextMeasurer
{
    private readonly fonts: Map<string, Map<string, opentype.Font>> = new Map();
    private readonly approximate = new ApproximateTextMeasurer();

    public LoadFont(
        family: string,
        source: ArrayBuffer | Uint8Array,
        weight?: string,
        style?: string,
    ): void
    {
        const buffer = source instanceof Uint8Array
            ? source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
            : source;
        const font = opentype.parse(buffer);

        const resolvedWeight = weight ?? FontMetricsMeasurer.detectWeight(font);
        const resolvedStyle  = style  ?? FontMetricsMeasurer.detectStyle(font);
        const variantKey = `${resolvedWeight}|${resolvedStyle}`;

        let familyMap = this.fonts.get(family);
        if (familyMap === undefined)
        {
            familyMap = new Map();
            this.fonts.set(family, familyMap);
        }
        familyMap.set(variantKey, font);
    }

    public Measure(
        text: string,
        fontFamily: string,
        fontSize: number,
        fontWeight: string,
        fontStyle: string,
    ): TextMetrics
    {
        if (text === '')
        {
            return { Width: 0, Height: 0, Ascent: 0, Descent: 0 };
        }

        const font = this.resolveFont(fontFamily, fontWeight, fontStyle);
        if (font === undefined)
        {
            // No loaded font for any family in the stack — fall back so
            // callers still get reasonable layout instead of zeros.
            return this.approximate.Measure(text, fontFamily, fontSize, fontWeight, fontStyle);
        }

        const scale = fontSize / font.unitsPerEm;
        const width   = FontMetricsMeasurer.measureWidth(font, text, scale);
        const ascent  =  font.ascender  * scale;
        const descent = -font.descender * scale;
        return {
            Width:   width,
            Height:  ascent + descent,
            Ascent:  ascent,
            Descent: descent,
        };
    }

    // §19-deferred #4. Convert a text run to a filled PathGeometry by
    // concatenating each glyph's outline. The result is positioned with
    // its baseline at y = 0 and the left edge at x = 0 (caller can
    // Geometry.Transform their way to any other placement). Glyph
    // outlines come from opentype.js's parsed font; advance widths +
    // pairwise kerning drive the horizontal layout (same as Measure).
    //
    // No line breaks, no bidi, no text shaping (ligatures /
    // contextual alternates dropped — same tradeoff as Measure for the
    // same reason: opentype.js's full layout throws on common modern
    // fonts).
    //
    // Returns an empty PathGeometry when:
    //   * `text` is empty;
    //   * the font family stack has no loaded match (caller can detect
    //     via Measure returning the approximation fallback).
    public BuildGeometry(
        text: string,
        fontFamily: string,
        fontSize: number,
        fontWeight: string,
        fontStyle: string,
    ): PathGeometry
    {
        if (text === '') return new PathGeometry([]);
        const font = this.resolveFont(fontFamily, fontWeight, fontStyle);
        if (font === undefined) return new PathGeometry([]);

        const scale = fontSize / font.unitsPerEm;
        const figures: PathFigure[] = [];
        let cursor = 0;
        let prev: opentype.Glyph | undefined;
        for (const ch of Array.from(text))
        {
            const glyph = font.charToGlyph(ch);
            if (prev !== undefined)
            {
                cursor += font.getKerningValue(prev, glyph) * scale;
            }
            const lowering = glyphToFigures(glyph, scale, cursor, 0);
            for (const f of lowering.figures) figures.push(f);
            cursor += lowering.advance;
            prev = glyph;
        }
        return new PathGeometry(figures);
    }

    // Sum per-glyph advance widths plus pairwise kerning. We don't use
    // font.getAdvanceWidth because that routes through opentype.js's
    // full layout pipeline (bidi + ccmp + GSUB substitutions), which
    // throws on common modern fonts whose tables use lookup formats the
    // library doesn't yet implement (e.g. Inter's GSUB lookupType 6
    // substFormat 2). Going glyph-by-glyph via charToGlyph avoids the
    // substitution pipeline entirely. Tradeoff: we lose ligature
    // substitution and contextual alternates (fi → ﬁ etc.) but keep
    // pairwise kerning, which is enough for accurate UI text widths.
    // Iterates code points (Array.from) so surrogate pairs like emoji
    // count as one glyph.
    private static measureWidth(font: opentype.Font, text: string, scale: number): number
    {
        let width = 0;
        let prev: opentype.Glyph | undefined;
        for (const ch of Array.from(text))
        {
            const glyph = font.charToGlyph(ch);
            if (prev !== undefined)
            {
                width += font.getKerningValue(prev, glyph) * scale;
            }
            width += (glyph.advanceWidth ?? 0) * scale;
            prev = glyph;
        }
        return width;
    }

    // §19-deferred #4 — exposed for `textOnPath`, which needs the
    // resolved opentype.Font directly to walk glyphs along an arclength
    // sample table. Returns undefined when no loaded family matches.
    public ResolveFont(family: string, weight: string = 'normal', style: string = 'normal'): opentype.Font | undefined
    {
        return this.resolveFont(family, weight, style);
    }

    // Walk the CSS-style family stack and find the first loaded family.
    // Within that family, prefer an exact weight+style match; fall back
    // to normal|normal if the exact variant isn't loaded; fall back to
    // any loaded variant as a last resort so we at least use the right
    // family.
    private resolveFont(family: string, weight: string, style: string): opentype.Font | undefined
    {
        const families = family.split(',').map(f => f.trim());
        const wantedKey = `${weight}|${style}`;
        for (const fam of families)
        {
            const familyMap = this.fonts.get(fam);
            if (familyMap === undefined) continue;
            const exact = familyMap.get(wantedKey);
            if (exact !== undefined) return exact;
            const normal = familyMap.get('normal|normal');
            if (normal !== undefined) return normal;
            // Any variant beats no variant.
            const first = familyMap.values().next().value;
            if (first !== undefined) return first;
        }
        return undefined;
    }

    // OS/2 usWeightClass: 100..900, where 400 is Regular and 700 is Bold.
    // We collapse to the two values our FontWeight enum supports today
    // (Normal / Bold) — numeric weights would need broader enum support.
    private static detectWeight(font: opentype.Font): string
    {
        const os2 = font.tables['os2'] as { usWeightClass?: number } | undefined;
        const wc = os2?.usWeightClass ?? 400;
        return wc >= 600 ? 'bold' : 'normal';
    }

    // OS/2 fsSelection bit 0 = italic flag.
    private static detectStyle(font: opentype.Font): string
    {
        const os2 = font.tables['os2'] as { fsSelection?: number } | undefined;
        const fs = os2?.fsSelection ?? 0;
        return (fs & 1) !== 0 ? 'italic' : 'normal';
    }
}
