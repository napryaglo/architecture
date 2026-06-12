import type { TextMeasurer } from '../../runtime/index.js';

// Options for loadGoogleFont. Defaults to a single weight 400 ("normal")
// upright variant — the most common single-font use case.
export interface GoogleFontOptions
{
    // CSS-style numeric weights, e.g. [400, 700] for normal + bold.
    // Defaults to [400].
    weights?: number[];

    // When true, also fetches italic variants for each weight.
    italics?: boolean;
}

// One variant of a Google Font as fetched and ready to register with a
// TextMeasurer. weight / style are normalized to the string values the
// TextMeasurer interface expects ('normal' | 'bold', 'normal' | 'italic').
export interface LoadedGoogleFont
{
    family: string;
    weight: 'normal' | 'bold';
    style:  'normal' | 'italic';
    buffer: ArrayBuffer;
}

// Fetches one Google Font family in one or more weight / style variants
// and returns raw TTF buffers. Caller registers them with a TextMeasurer
// via measurer.LoadFont, or uses loadGoogleFontInto for the convenience
// form.
//
// Sends an old-Firefox User-Agent so Google's CSS API responds with TTF
// instead of WOFF2 — opentype.js can parse TTF / OTF / WOFF1 but not
// WOFF2. If Google ever stops honoring the UA hint, the binary fetch
// will succeed but opentype.js parsing will throw with a recognizable
// "Unsupported OpenType signature" error and the caller will know to
// switch strategies (use @fontsource packages instead, or add a
// wawoff2 decoder).
//
// Network: uses the global fetch (Node 18+ / modern browsers). One CSS
// request plus one binary request per (weight × style) variant. No
// caching — the consumer should call this once at startup.
export async function loadGoogleFont(
    family: string,
    options: GoogleFontOptions = {},
): Promise<LoadedGoogleFont[]>
{
    const weights = options.weights ?? [400];
    const italics = options.italics ?? false;

    // CSS2 family-spec format:
    //   without italics:  family=Inter:wght@400;700
    //   with italics:     family=Inter:ital,wght@0,400;0,700;1,400;1,700
    const familyQuery = encodeURIComponent(family);
    let url: string;
    if (italics)
    {
        const pairs: string[] = [];
        for (const w of weights)
        {
            pairs.push(`0,${w}`);
            pairs.push(`1,${w}`);
        }
        url = `https://fonts.googleapis.com/css2?family=${familyQuery}:ital,wght@${pairs.join(';')}`;
    }
    else
    {
        url = `https://fonts.googleapis.com/css2?family=${familyQuery}:wght@${weights.join(';')}`;
    }

    const cssResponse = await fetch(url, { headers: { 'User-Agent': OLD_FIREFOX_UA } });
    if (!cssResponse.ok)
    {
        throw new Error(`loadGoogleFont: Google Fonts API returned ${cssResponse.status} for ${family} (URL: ${url})`);
    }
    const css = await cssResponse.text();

    const faces = parseFontFaces(css);
    if (faces.length === 0)
    {
        throw new Error(`loadGoogleFont: no @font-face blocks found in CSS for ${family} — unknown family or API changed`);
    }

    return Promise.all(faces.map(async face =>
    {
        const r = await fetch(face.url);
        if (!r.ok)
        {
            throw new Error(`loadGoogleFont: font binary fetch failed (${r.status}) for ${face.url}`);
        }
        const buffer = await r.arrayBuffer();
        return { family, weight: face.weight, style: face.style, buffer } satisfies LoadedGoogleFont;
    }));
}

// Convenience: fetch a Google Font and register every variant into the
// given TextMeasurer in one call. Use when you don't need to inspect
// the loaded buffers yourself.
export async function loadGoogleFontInto(
    measurer: TextMeasurer,
    family: string,
    options?: GoogleFontOptions,
): Promise<void>
{
    const fonts = await loadGoogleFont(family, options);
    for (const f of fonts)
    {
        measurer.LoadFont(f.family, f.buffer, f.weight, f.style);
    }
}

// A pre-WOFF2-era Firefox UA. Google Fonts decides response format
// partly on UA — modern browsers get WOFF2 (which opentype.js can't
// parse), older browsers get TTF. We pretend to be Firefox 30 (2014)
// to land in the TTF bucket. If this stops working, alternatives are
// listed in the loadGoogleFont docblock.
const OLD_FIREFOX_UA = 'Mozilla/5.0 (Windows NT 6.1; rv:30.0) Gecko/20100101 Firefox/30.0';

// Public for direct testability. Extracts the variant info from a
// Google Fonts CSS response. Each variant becomes one @font-face block;
// Google sometimes emits multiple blocks per variant for different
// unicode-ranges (Latin, Cyrillic, …) — we dedupe by (weight, style,
// url) so we only fetch each unique TTF once.
export function parseFontFaces(css: string): { weight: 'normal' | 'bold'; style: 'normal' | 'italic'; url: string }[]
{
    const faces: { weight: 'normal' | 'bold'; style: 'normal' | 'italic'; url: string }[] = [];
    const seen = new Set<string>();
    const blockRe = /@font-face\s*\{([^}]+)\}/g;
    for (const match of css.matchAll(blockRe))
    {
        const body = match[1] ?? '';
        const urlMatch = body.match(/url\((['"]?)([^'")]+)\1\)/);
        if (urlMatch === null) continue;
        const url = urlMatch[2] ?? '';

        const weightMatch = body.match(/font-weight:\s*(\d+)/);
        const weight: 'normal' | 'bold' =
            weightMatch !== null && Number(weightMatch[1]) >= 600 ? 'bold' : 'normal';

        const styleMatch = body.match(/font-style:\s*(\w+)/);
        const style: 'normal' | 'italic' =
            styleMatch !== null && styleMatch[1] === 'italic' ? 'italic' : 'normal';

        const key = `${weight}|${style}|${url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        faces.push({ weight, style, url });
    }
    return faces;
}
