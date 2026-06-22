import {
    Element,
    MetaData,
    Model,
    Rect,
    Size,
    Thickness,
    Visual,
    type DrawingContext,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { Brush } from '../../visual-engine/index.js';
import { Button } from '../buttons/button.js';
import { Orientation, StackPanel } from '../../basic/panels/stack-panel.js';
import { TextBlock } from '../../basic/text-block.js';
import { ToggleButton } from '../buttons/toggle-button.js';

// Where a button sits inside the inline ToolBar strip's connected-bar
// chrome. ToolBar's panel updates the Position DP on each inline
// ToolBarButton / ToolBarToggleButton after every layout pass; the
// default Style's triggers swap the button's CornerRadius accordingly:
//
//   * Only   — alone in its group (or the only inline button overall):
//              fully pill-rounded (@ShapeFull) on both ends.
//   * First  — left-edge of a group: outer-left corners rounded, inner
//              right corners square. Connects flush to the next button.
//   * Middle — interior of a group: every corner square.
//   * Last   — right-edge of a group: inner left corners square, outer
//              right corners rounded.
//   * None   — not inside a ToolBar (the button is being used
//              standalone), or sits in the overflow popup where the
//              connected-bar look doesn't apply. Square corners.
//
// Groups are delimited by ToolBarSeparator children: each contiguous
// run of non-separator children is its own group with its own
// First/Middle/Last assignment, so authors get visible group segments
// out of the box.
export enum ToolBarPosition
{
    None   = 'None',
    Only   = 'Only',
    First  = 'First',
    Middle = 'Middle',
    Last   = 'Last',
}

// ToolBarButton — Button shaped for use inside a ToolBar. Adds three
// DPs over plain Button:
//
//   * Icon     — a Visual rendered to the left of (or instead of) the
//                 text label. Typically a TextBlock with a glyph or
//                 a small vector graphic. Optional.
//   * Text     — string label rendered beside the Icon when ShowText
//                 is true (or instead of the Icon when no Icon is set).
//   * ShowText — when false (default), only the Icon is shown; when
//                 true, both Icon and Text are shown side-by-side.
//
// Flipping any of these DPs at runtime re-stacks `Content` via
// rebuildContent() (wired through OnPropertyChanged). Authors can
// drive Icon / Text / ShowText with bindings or imperative writes and
// the inline layout updates without recreating the button.
//
// The button itself uses Button's default chrome (theme background,
// hover / pressed visuals). The Icon + text layout is composed into
// `Content` as a horizontal StackPanel.
export class ToolBarButton extends Button
{
    public static readonly IconKey     = Model.RegisterProperty<Visual | undefined>(
        ToolBarButton, 'Icon', undefined, MetaData.Measure,
    );
    public static readonly TextKey     = Model.RegisterProperty<string | undefined>(
        ToolBarButton, 'Text', undefined, MetaData.Measure | MetaData.Render,
    );
    public static readonly ShowTextKey = Model.RegisterProperty<boolean>(
        ToolBarButton, 'ShowText', false, MetaData.Measure,
    );
    // Written by the owning ToolBar's panel after each Arrange pass;
    // read by the default Style's triggers to pick the per-corner
    // CornerRadius (see framework.resources.mu, DefaultToolBarButton).
    // Default `None` so a ToolBarButton used standalone (outside a
    // ToolBar) gets square corners — `Only` is reserved for the case
    // where a ToolBar actively reports "you are the sole inline item".
    public static readonly PositionKey = Model.RegisterProperty<ToolBarPosition>(
        ToolBarButton, 'Position', ToolBarPosition.None, MetaData.None,
    );

    static
    {
        // Theme lookup uses ToolBarButton as the key — the default Style
        // in framework.resources.mu is keyed `[TargetType=ToolBarButton]`.
        // Without this override, applyDefaultStyle would walk up to
        // Button's key and pick up the pill chrome, defeating the
        // connected-bar look.
        Model.OverrideMetadata(ToolBarButton, Element.DefaultStyleKeyKey, { default_value: ToolBarButton });
        // Surface theme owns the default Style; this registers the
        // bundle's factory with Application on first ToolBarButton load.
    }

    public get Icon():  Visual | undefined { return this.get_property_value(ToolBarButton.IconKey); }
    public set Icon(v: Visual | undefined) { this.set_property_value(ToolBarButton.IconKey, v); }

    public get Text():  string | undefined { return this.get_property_value(ToolBarButton.TextKey); }
    public set Text(v: string | undefined) { this.set_property_value(ToolBarButton.TextKey, v); }

    public get ShowText():  boolean { return this.get_property_value(ToolBarButton.ShowTextKey); }
    public set ShowText(v: boolean) { this.set_property_value(ToolBarButton.ShowTextKey, v); }

    public get Position():  ToolBarPosition { return this.get_property_value(ToolBarButton.PositionKey); }
    public set Position(v: ToolBarPosition) { this.set_property_value(ToolBarButton.PositionKey, v); }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'Icon' || name === 'Text' || name === 'ShowText')
        {
            rebuildContent(this);
        }
    }

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
    public static readonly TextKey     = Model.RegisterProperty<string | undefined>(
        ToolBarToggleButton, 'Text', undefined, MetaData.Measure | MetaData.Render,
    );
    public static readonly ShowTextKey = Model.RegisterProperty<boolean>(
        ToolBarToggleButton, 'ShowText', false, MetaData.Measure,
    );
    // Same connected-bar Position protocol as ToolBarButton — see the
    // PositionKey docstring on ToolBarButton above.
    public static readonly PositionKey = Model.RegisterProperty<ToolBarPosition>(
        ToolBarToggleButton, 'Position', ToolBarPosition.None, MetaData.None,
    );

    static
    {
        Model.OverrideMetadata(ToolBarToggleButton, Element.DefaultStyleKeyKey, { default_value: ToolBarToggleButton });
    }

    public get Icon():  Visual | undefined { return this.get_property_value(ToolBarToggleButton.IconKey); }
    public set Icon(v: Visual | undefined) { this.set_property_value(ToolBarToggleButton.IconKey, v); }

    public get Text():  string | undefined { return this.get_property_value(ToolBarToggleButton.TextKey); }
    public set Text(v: string | undefined) { this.set_property_value(ToolBarToggleButton.TextKey, v); }

    public get ShowText():  boolean { return this.get_property_value(ToolBarToggleButton.ShowTextKey); }
    public set ShowText(v: boolean) { this.set_property_value(ToolBarToggleButton.ShowTextKey, v); }

    public get Position():  ToolBarPosition { return this.get_property_value(ToolBarToggleButton.PositionKey); }
    public set Position(v: ToolBarPosition) { this.set_property_value(ToolBarToggleButton.PositionKey, v); }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'Icon' || name === 'Text' || name === 'ShowText')
        {
            rebuildContent(this);
        }
    }

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
export class ToolBarSeparator extends Element
{
    public static readonly LineBrushKey = Model.RegisterProperty<Brush | undefined>(
        ToolBarSeparator, 'LineBrush', undefined, MetaData.Render,
    );

    static
    {
        // Default Style supplies Width / MinHeight / LineBrush via
        // DynamicResource so the divider tints follow the active theme
        // palette without an imperative `?? Theme.fieldBorder` fallback
        // in RenderOverride.
        Model.OverrideMetadata(ToolBarSeparator, Element.DefaultStyleKeyKey, { default_value: ToolBarSeparator });
    }

    constructor()
    {
        super();
        this.applyDefaultStyle();
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
        const brush = this.LineBrush;
        if (brush === undefined) return;
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
    // Write DPs; rebuildContent fires for each via OnPropertyChanged.
    // Ordering: Text + Icon + ShowText together would produce three
    // rebuilds; cheap enough at construction time (one StackPanel
    // allocation each), and the dynamic-update path uses the same
    // pipeline so we don't fork the logic.
    btn.Icon     = resolveIcon(opts.icon);
    btn.Text     = opts.text;
    btn.ShowText = opts.showText === true;
    if (opts.command !== undefined)          btn.Command          = opts.command;
    if (opts.commandParameter !== undefined) btn.CommandParameter = opts.commandParameter;
}

// (Re-)compose Button.Content from the live values of the Icon / Text /
// ShowText DPs. Reuses ONE StackPanel per button (lazily allocated on
// first rebuild and held in a private side-channel) so the Icon Visual
// — which the consumer owns and may keep a reference to — has exactly
// one stable parent across rebuilds. Allocating a fresh stack each
// time would leave the Icon parented to the previous stack and trip
// the single-parent check on the next AddChild.
//
// Called from the ctor (via applyOpts → DP writes → OnPropertyChanged)
// and from every later DP flip on Icon / Text / ShowText.
function rebuildContent(btn: ToolBarButton | ToolBarToggleButton): void
{
    const iconV    = btn.Icon;
    const text     = btn.Text;
    const showText = btn.ShowText;

    const slot = btn as unknown as { _toolbarStack?: StackPanel };
    let stack = slot._toolbarStack;
    if (stack === undefined)
    {
        stack = new StackPanel();
        stack.Orientation = Orientation.Horizontal;
        slot._toolbarStack = stack;
        btn.Content = stack;
    }
    // Clear without disturbing visuals we're about to re-add. Snapshot
    // first because RemoveChild mutates visualChildren mid-iteration.
    for (const c of [...stack.visualChildren]) stack.RemoveChild(c);

    if (iconV !== undefined) stack.AddChild(iconV);
    if (text !== undefined && (showText || iconV === undefined))
    {
        const label = new TextBlock(text);
        // Foreground rides the TextBlock default Style — @OnSurface
        // via DynamicResource so theme switches re-tint live.
        if (iconV !== undefined) label.Margin = new Thickness(6, 0, 0, 0);
        stack.AddChild(label);
    }
}

function resolveIcon(icon: string | Visual | undefined): Visual | undefined
{
    if (icon === undefined) return undefined;
    if (typeof icon === 'string')
    {
        return new TextBlock(icon);
    }
    return icon;
}
