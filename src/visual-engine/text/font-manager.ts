import { FontStyle, FontWeight } from './formatted-text.js';

// Where a registered font's bytes come from. A URL is fetched lazily (and
// is also what an @font-face `src` points at for rendering); an in-memory
// buffer is used directly (e.g. a font already loaded by other means).
export enum FontSourceKind
{
    Url    = 'url',
    Buffer = 'buffer',
}

export type FontSource =
    | { kind: FontSourceKind.Url;    url: string }
    | { kind: FontSourceKind.Buffer; data: ArrayBuffer };

export interface FontRegistration
{
    weight?: FontWeight;
    style?:  FontStyle;
}

// One registered face: a family name in one weight/style backed by a
// source. The unit the FontManager stores and hands to consumers.
export class RegisteredFont
{
    constructor(
        public readonly Family: string,
        public readonly Weight: FontWeight,
        public readonly Style:  FontStyle,
        public readonly Source: FontSource,
    ) {}

    /** Stable identity key (family|weight|style) for dedup. */
    public get Key(): string
    {
        return `${this.Family}|${this.Weight}|${this.Style}`;
    }
}

// A render/measure target that wants to be told about registered fonts.
// On Subscribe it is replayed every already-registered face, then gets
// each new one as it lands. Implementations load the font into their
// TextMeasurer (metrics) and inject it for rendering (@font-face /
// FontFace) — see PresentationTarget / HtmlTarget.
export interface FontConsumer
{
    ReceiveFont(font: RegisteredFont): void;
}

// Central font registry. The single hub between font declarations (a
// `.mu` `fonts { … }` block, or a TS Register call) and everyone who
// needs the font: TextMeasurers (for metrics) and render targets (for
// painting). Singleton — `FontManager.Current`.
//
// Lazily fetches URL sources to ArrayBuffers (cached) so a font declared
// once is fetched at most once even across several targets / measurers.
export class FontManager
{
    private static _current: FontManager | undefined;

    public static get Current(): FontManager
    {
        return (this._current ??= new FontManager());
    }

    private readonly faces     = new Map<string, RegisteredFont>();
    private readonly consumers = new Set<FontConsumer>();
    private readonly buffers   = new Map<string, Promise<ArrayBuffer>>();

    /** Register a font face. Idempotent per (family, weight, style) — a
     *  later registration of the same key replaces the source and re-
     *  notifies consumers. */
    public Register(
        family: string,
        source: FontSource,
        opts: FontRegistration = {},
    ): RegisteredFont
    {
        const font = new RegisteredFont(
            family,
            opts.weight ?? FontWeight.Normal,
            opts.style  ?? FontStyle.Normal,
            source,
        );
        this.faces.set(font.Key, font);
        this.buffers.delete(font.Key);   // drop any stale fetch for this key
        for (const c of this.consumers) c.ReceiveFont(font);
        return font;
    }

    /** Every registered face, in registration order. */
    public get Faces(): readonly RegisteredFont[]
    {
        return [...this.faces.values()];
    }

    public Has(family: string): boolean
    {
        for (const f of this.faces.values())
        {
            if (f.Family === family) return true;
        }
        return false;
    }

    /** Subscribe a consumer; it is immediately replayed every registered
     *  face. Returns an unsubscribe thunk. */
    public Subscribe(consumer: FontConsumer): () => void
    {
        this.consumers.add(consumer);
        for (const f of this.faces.values()) consumer.ReceiveFont(f);
        return () => { this.consumers.delete(consumer); };
    }

    /** Resolve a face's bytes — fetching a URL source once and caching the
     *  promise. Buffer sources resolve immediately. */
    public LoadBuffer(font: RegisteredFont): Promise<ArrayBuffer>
    {
        const cached = this.buffers.get(font.Key);
        if (cached !== undefined) return cached;

        const p = font.Source.kind === FontSourceKind.Buffer
            ? Promise.resolve(font.Source.data)
            : fetch(font.Source.url).then(r =>
            {
                if (!r.ok)
                {
                    throw new Error(
                        `FontManager: fetch failed (${r.status}) for ${font.Family} `
                        + `at ${(font.Source as { url: string }).url}`);
                }
                return r.arrayBuffer();
            });
        this.buffers.set(font.Key, p);
        return p;
    }

    /** The render-side `src` URL for a face, when it has one (URL source).
     *  Buffer sources return undefined — a consumer that needs a URL for
     *  @font-face should fall back to a blob/data URL built from the
     *  buffer. */
    public SourceUrl(font: RegisteredFont): string | undefined
    {
        return font.Source.kind === FontSourceKind.Url ? font.Source.url : undefined;
    }

    /** Test seam — drop all state. */
    public Clear(): void
    {
        this.faces.clear();
        this.consumers.clear();
        this.buffers.clear();
    }
}
