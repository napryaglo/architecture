import { MetaData, Model, type ICommand } from '../../runtime/index.js';
import { TextDecorations } from '../../visual-engine/index.js';
import { type RunProps } from './text-element.js';
import { Span } from './inlines.js';

// Hyperlink — a Span with interactivity. Its content reads as a link
// (underlined, accent-tinted) and, when the hosting TextBlock detects a
// click over any of its runs, it activates: fires the Click callback and
// executes Command (with CommandParameter). NavigateUri is informational
// (a consumer/behaviour can open it); the control itself is host-agnostic
// and does not touch `window`.
//
// Kept in `basic` (no framework CommandSourceHelper) — it drives ICommand
// from `runtime` directly. The default link chrome (underline + accent)
// is applied through applyToContext so it composes with any explicit
// Foreground / TextDecorations the author sets.
export class Hyperlink extends Span
{
    public static readonly NavigateUriKey = Model.RegisterProperty<string | undefined>(
        Hyperlink, 'NavigateUri', undefined, MetaData.None);
    public static readonly CommandKey = Model.RegisterProperty<ICommand | undefined>(
        Hyperlink, 'Command', undefined, MetaData.None);
    public static readonly CommandParameterKey = Model.RegisterProperty<unknown>(
        Hyperlink, 'CommandParameter', undefined, MetaData.None);

    /** Fired on activation (click / Enter), before the Command runs.
     *  Consumers set this to open the NavigateUri or run side effects. */
    public Click: (() => void) | undefined;

    public get NavigateUri(): string | undefined  { return this.get_property_value(Hyperlink.NavigateUriKey); }
    public set NavigateUri(v: string | undefined) { this.set_property_value(Hyperlink.NavigateUriKey, v); }
    public get Command(): ICommand | undefined  { return this.get_property_value(Hyperlink.CommandKey); }
    public set Command(v: ICommand | undefined) { this.set_property_value(Hyperlink.CommandKey, v); }
    public get CommandParameter(): unknown  { return this.get_property_value(Hyperlink.CommandParameterKey); }
    public set CommandParameter(v: unknown) { this.set_property_value(Hyperlink.CommandParameterKey, v); }

    // Invoked by the host TextBlock's hit-test on click.
    public Activate(): void
    {
        this.Click?.();
        const cmd = this.Command;
        const param = this.CommandParameter;
        if (cmd !== undefined && cmd.CanExecute(param)) cmd.Execute(param);
    }

    // Link chrome + click target. Underline is added (not replacing any
    // accumulated decorations); the accent foreground only applies when
    // the author didn't set an explicit Foreground on/under the link.
    public override applyToContext(ctx: RunProps): void
    {
        ctx.decorations |= TextDecorations.Underline;
        ctx.link = { activate: (): void => this.Activate() };
    }
}
