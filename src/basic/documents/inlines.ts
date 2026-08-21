import { MetaData, MuralBase, Visual } from '../../runtime/index.js';
import { FontStyle, FontWeight, TextDecorations } from '../../visual-engine/index.js';
import { Inline, type InlineHost } from './text-element.js';
import { InlineCollection } from './inline-collection.js';

// ─────────────────────────────────────────────────────────────────────
// Run — the only inline that carries literal characters. Every other
// inline either groups Runs (Span) or is a non-text atom (LineBreak,
// InlineUIContainer). Setting TextBlock.Text is sugar for a single Run.
export class Run extends Inline
{
    public static readonly TextKey = MuralBase.RegisterProperty<string>(Run, 'Text', '', MetaData.None);

    constructor(text = '')
    {
        super();
        if (text !== '') this.Text = text;
    }

    public get Text(): string { return this.get_property_value(Run.TextKey); }
    public set Text(v: string) { this.set_property_value(Run.TextKey, v); }
}

// ─────────────────────────────────────────────────────────────────────
// Span — a grouping inline. Its own set character-format properties
// override the inherited context for everything in its Inlines subtree;
// its TextDecorations accumulate onto that subtree. Bold / Italic /
// Underline are Spans that preset one property. Hyperlink (its own file)
// is a Span with interactivity.
export class Span extends Inline implements InlineHost
{
    private readonly _inlines: InlineCollection;

    constructor()
    {
        super();
        this._inlines = new InlineCollection(this);
    }

    public get Inlines(): InlineCollection { return this._inlines; }

    // Markup default-slot target — `Bold { "hi" Run{…} }` lowers to
    // `.Inlines.Add(child)`. A bare string content node compiles to a Run.
    public AddChild(child: Inline): void { this._inlines.Add(child); }

    // Bubble a nested-collection change up toward the hosting TextBlock.
    public onInlineTreeChanged(): void { this.invalidateTree(); }
}

// Convenience spans — Office/WPF parity. Each just presets one property
// in the ctor; the flatten applies it like any other Span override.
export class Bold extends Span
{
    constructor() { super(); this.FontWeight = FontWeight.Bold; }
}

export class Italic extends Span
{
    constructor() { super(); this.FontStyle = FontStyle.Italic; }
}

export class Underline extends Span
{
    constructor() { super(); this.TextDecorations = TextDecorations.Underline; }
}

// ─────────────────────────────────────────────────────────────────────
// LineBreak — forces the line to end. No text, no children.
export class LineBreak extends Inline {}

// ─────────────────────────────────────────────────────────────────────
// InlineUIContainer — embeds an arbitrary Visual inline within the text
// flow (a Button, Image, icon, …). The hosting TextBlock attaches Child
// as a real visual child, measures it, and arranges it at the container's
// computed position on the line (baseline-bottom aligned by default). The
// content model just holds the reference; all layout is the host's job.
export class InlineUIContainer extends Inline
{
    public static readonly ChildKey = MuralBase.RegisterProperty<Visual | undefined>(
        InlineUIContainer, 'Child', undefined, MetaData.None);

    constructor(child?: Visual)
    {
        super();
        if (child !== undefined) this.Child = child;
    }

    public get Child(): Visual | undefined  { return this.get_property_value(InlineUIContainer.ChildKey); }
    public set Child(v: Visual | undefined) { this.set_property_value(InlineUIContainer.ChildKey, v); }

    // Markup default slot — `InlineUIContainer { SomeVisual }`.
    public AddChild(child: Visual): void { this.Child = child; }
}
