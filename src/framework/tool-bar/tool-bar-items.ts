import {
    MetaData,
    Model,
    Rect,
    Size,
    Thickness,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { Brush } from '../../visual-engine/index.js';
import { Button } from '../button.js';
import { Orientation, StackPanel } from '../../Basic/stack-panel.js';
import { TextBlock } from '../../Basic/text-block.js';
import { Theme } from '../../Basic/theme.js';
import { ToggleButton } from '../toggle-button.js';

// ToolBarButton — Button shaped for use inside a ToolBar. Adds two DPs
// over plain Button:
//
//   * Icon     — a Visual rendered to the left of (or instead of) the
//                 text content. Typically a TextBlock with a glyph or
//                 a small vector graphic. Optional.
//   * ShowText — when false (default), only the Icon is shown; when
//                 true, both Icon and Content (text) are shown
//                 side-by-side.
//
// The button itself uses Button's default chrome (theme background,
// hover / pressed visuals). The Icon + text layout is composed into
// `Content` as a horizontal StackPanel.
//
// Note: changing Icon, Content, or ShowText after construction does
// NOT auto-rebuild the inline layout — these DPs are read on the
// ergonomic `create()` factory path. Authors who flip them later
// should re-run their layout (typically by re-creating the button).
// The simpler shape kept the v1 footprint low; a smarter
// "OnPropertyChanged → re-stack the children" path is an obvious
// follow-up if real-world usage demands dynamic icon swaps.
export class ToolBarButton extends Button
{
    public static readonly IconKey     = Model.RegisterProperty<Visual | undefined>(
        ToolBarButton, 'Icon', undefined, MetaData.Measure,
    );
    public static readonly ShowTextKey = Model.RegisterProperty<boolean>(
        ToolBarButton, 'ShowText', false, MetaData.Measure,
    );

    public get Icon():  Visual | undefined { return this.get_property_value(ToolBarButton.IconKey); }
    public set Icon(v: Visual | undefined) { this.set_property_value(ToolBarButton.IconKey, v); }

    public get ShowText():  boolean { return this.get_property_value(ToolBarButton.ShowTextKey); }
    public set ShowText(v: boolean) { this.set_property_value(ToolBarButton.ShowTextKey, v); }

    public static create(opts: ToolBarButtonOptions): ToolBarButton
    {
        const btn = new ToolBarButton();
        applyOpts(btn, opts);
        return btn;
    }
}

// ToolBarToggleButton — same shape as ToolBarButton but extends
// ToggleButton. Click toggles IsChecked; consumers can wire a styled
// trigger on IsChecked to switch the background to a "pressed-stays"
// look.
export class ToolBarToggleButton extends ToggleButton
{
    public static readonly IconKey     = Model.RegisterProperty<Visual | undefined>(
        ToolBarToggleButton, 'Icon', undefined, MetaData.Measure,
    );
    public static readonly ShowTextKey = Model.RegisterProperty<boolean>(
        ToolBarToggleButton, 'ShowText', false, MetaData.Measure,
    );

    public get Icon():  Visual | undefined { return this.get_property_value(ToolBarToggleButton.IconKey); }
    public set Icon(v: Visual | undefined) { this.set_property_value(ToolBarToggleButton.IconKey, v); }

    public get ShowText():  boolean { return this.get_property_value(ToolBarToggleButton.ShowTextKey); }
    public set ShowText(v: boolean) { this.set_property_value(ToolBarToggleButton.ShowTextKey, v); }

    public static create(opts: ToolBarButtonOptions): ToolBarToggleButton
    {
        const btn = new ToolBarToggleButton();
        applyOpts(btn, opts);
        return btn;
    }
}

// ToolBarSeparator — thin vertical line between toolbar item groups.
// Renders as a 1px-wide rectangle centred horizontally on the visual,
// inset 2px from top + bottom so it doesn't touch the toolbar's edges.
export class ToolBarSeparator extends Visual
{
    public static readonly LineBrushKey = Model.RegisterProperty<Brush | undefined>(
        ToolBarSeparator, 'LineBrush', undefined, MetaData.Render,
    );

    constructor()
    {
        super();
        this.Width = 9;        // 4px padding | 1px line | 4px padding
        this.MinHeight = 16;
    }

    public get LineBrush():  Brush | undefined { return this.get_property_value(ToolBarSeparator.LineBrushKey); }
    public set LineBrush(v: Brush | undefined) { this.set_property_value(ToolBarSeparator.LineBrushKey, v); }

    protected override MeasureOverride(availableSize: Size): Size
    {
        return new Size(
            this.Width,
            Number.isFinite(availableSize.Height) ? availableSize.Height : this.MinHeight,
        );
    }

    protected override ArrangeOverride(finalSize: Size): Size { return finalSize; }

    protected override RenderOverride(dc: DrawingContext): void
    {
        const rect = this.ArrangedRect;
        const brush = this.LineBrush ?? Theme.fieldBorder;
        const x = Math.floor(rect.Width / 2);
        const yTop = 2;
        const yBot = Math.max(2, rect.Height - 2);
        // 1px-wide rect from yTop..yBot — simpler than a Pen-stroked
        // LineGeometry (which adds vertex-rounding artefacts at 1px).
        dc.DrawRectangle(brush, undefined, new Rect(x, yTop, 1, yBot - yTop));
    }
}

// Shared options bag + applier — keeps the factories DRY. Authors
// passing a string for `icon` get a TextBlock; passing a Visual gets
// it directly.
export interface ToolBarButtonOptions
{
    icon?:             string | Visual;
    text?:             string;
    showText?:         boolean;
    command?:          import('../../runtime/command.js').ICommand;
    commandParameter?: unknown;
}

function applyOpts(btn: ToolBarButton | ToolBarToggleButton, opts: ToolBarButtonOptions): void
{
    const iconV = resolveIcon(opts.icon);
    const showText = opts.showText === true;
    btn.Icon     = iconV;
    btn.ShowText = showText;
    if (opts.command !== undefined)          btn.Command          = opts.command;
    if (opts.commandParameter !== undefined) btn.CommandParameter = opts.commandParameter;

    // Compose Content = horizontal stack of [icon, text] depending on
    // ShowText. Slotted into Button's default ContentPresenter — no
    // template override needed; Button's chrome (hover / pressed
    // backgrounds, padding) stays intact.
    const stack = new StackPanel();
    stack.Orientation = Orientation.Horizontal;
    if (iconV !== undefined) stack.AddChild(iconV);
    if (opts.text !== undefined && (showText || iconV === undefined))
    {
        const label = new TextBlock(opts.text);
        label.Foreground = Theme.primaryInk;
        if (iconV !== undefined) label.Margin = new Thickness(6, 0, 0, 0);
        stack.AddChild(label);
    }
    btn.Content = stack;
}

function resolveIcon(icon: string | Visual | undefined): Visual | undefined
{
    if (icon === undefined) return undefined;
    if (typeof icon === 'string')
    {
        const tb = new TextBlock(icon);
        tb.Foreground = Theme.primaryInk;
        return tb;
    }
    return icon;
}
