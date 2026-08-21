import {
    Element,
    MetaData,
    MuralBase,
    Thickness,
    Visual,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { Button } from '../buttons/button.js';
import { ToggleButton } from '../buttons/toggle-button.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';
import { Orientation } from '../../basic/panels/orientation.js';
import { TextBlock, TextWrapping } from '../../basic/text-block.js';

// Ribbon button footprint. A ribbon group is built from two sizes of
// invoker (Office parity):
//
//   * Large — 32px icon centred on top, label below (wraps to two lines).
//             The prominent single-column button that anchors a group.
//   * Small — 16-20px icon at the left, label to its right; three stack
//             vertically inside a RibbonSmallButtonColumn.
//
// The size drives the content composition (vertical vs. horizontal
// stack) AND the default Style's per-size chrome (min width / padding).
export enum RibbonButtonSize
{
    // Large — the group anchor: a big icon stacked over a wrapping label
    // (vertical), spanning the group body height.
    Large = 'Large',
    // Medium — an icon beside a label (horizontal); three stack per
    // RibbonSmallButtonColumn, the standard Office mid-tier button.
    Medium = 'Medium',
    // Small — icon only, no label (horizontal): the most compact tier,
    // for dense command clusters where the glyph carries the meaning.
    Small = 'Small',
}

// Compose a ribbon button's `Content` from the live LargeIcon / SmallIcon
// / Text / Size DPs. Shared by RibbonButton and RibbonToggleButton (they
// can't share a base past Button / ToggleButton, so the layout logic is a
// free function both call from OnPropertyChanged — same shape as
// tool-bar-items.ts rebuildContent).
//
// ONE StackPanel is reused per button (held in a side-channel slot) so an
// icon Visual the consumer owns keeps a single stable parent across
// rebuilds — allocating a fresh stack each time would leave the icon
// parented to the previous stack and trip the single-parent guard.
function rebuildRibbonContent(btn: RibbonButton | RibbonToggleButton): void
{
    // Reuse ONE StackPanel per button (held in a side-channel slot) so a
    // consumer-owned icon Visual keeps a single stable parent across
    // rebuilds — a fresh stack each time would leave the icon parented to
    // the previous stack and trip the single-parent guard.
    const slot = btn as unknown as { _ribbonStack?: StackPanel };
    if (slot._ribbonStack === undefined)
    {
        slot._ribbonStack = new StackPanel();
        btn.Content = slot._ribbonStack;
    }
    fillRibbonStack(btn, slot._ribbonStack);
}

// Shared icon/label composition contract — the invoker families
// (RibbonButton, RibbonToggleButton, and the RibbonPopupButton trigger)
// all lay out the same way, differing only in where the host stack lives.
// They expose the same DPs (Size / LargeIcon / SmallIcon / Text).
export interface RibbonContentSource
{
    readonly Size: RibbonButtonSize;
    readonly LargeIcon: Visual | undefined;
    readonly SmallIcon: Visual | undefined;
    readonly Text: string | undefined;
}

// Fill a host stack from a ribbon invoker's live Size / icon / Text DPs.
// Three tiers:
//   * Large  — vertical: big icon over a wrapping label (the group anchor).
//   * Medium — horizontal: icon beside a label.
//   * Small  — horizontal: icon only (no label). A label-only Small (no
//              icon set) still shows its text so the button isn't empty.
// The caller owns the stack's lifecycle (RibbonButton reuses its Content
// stack; the popup trigger reuses its PART_ContentHost).
export function fillRibbonStack(src: RibbonContentSource, stack: StackPanel): void
{
    const size  = src.Size;
    const large = size === RibbonButtonSize.Large;
    // Fall back to whichever icon is set when the size-specific one is
    // absent — authors commonly set a single icon for all layouts.
    const icon  = (large ? src.LargeIcon : src.SmallIcon) ?? src.SmallIcon ?? src.LargeIcon;
    const text  = src.Text;
    // Small is icon-only — unless there's no icon, in which case fall back
    // to the label so the button still reads.
    const showLabel = size !== RibbonButtonSize.Small || icon === undefined;

    stack.Orientation = large ? Orientation.Vertical : Orientation.Horizontal;

    // Clear without disturbing visuals we're about to re-add. Snapshot
    // first — RemoveChild mutates visualChildren mid-iteration.
    for (const c of [...stack.visualChildren]) stack.RemoveChild(c);

    if (icon !== undefined) stack.AddChild(icon);
    if (text !== undefined && showLabel)
    {
        const label = new TextBlock(text);
        if (large)
        {
            // Wraps to two lines under the icon; label ink rides the
            // inherited TextBlock.Foreground from the theme Style.
            label.TextWrapping = TextWrapping.Wrap;
            if (icon !== undefined) label.Margin = new Thickness(0, 4, 0, 0);
        }
        else if (icon !== undefined)
        {
            label.Margin = new Thickness(6, 0, 0, 0);
        }
        stack.AddChild(label);
    }
}

// RibbonButton — Button shaped for a RibbonGroup. Adds LargeIcon /
// SmallIcon / Text / Size over plain Button; inherits Command /
// CommandParameter (ICommandSource) from Button. A direct child in
// markup (`RibbonButton { TextBlock }`) sets Content directly and bypasses
// the icon/text composition — same escape hatch ToolBarButton offers.
export class RibbonButton extends Button
{
    public static readonly LargeIconKey = MuralBase.RegisterProperty<Visual | undefined>(
        RibbonButton, 'LargeIcon', undefined, MetaData.Measure);
    public static readonly SmallIconKey = MuralBase.RegisterProperty<Visual | undefined>(
        RibbonButton, 'SmallIcon', undefined, MetaData.Measure);
    public static readonly TextKey      = MuralBase.RegisterProperty<string | undefined>(
        RibbonButton, 'Text', undefined, MetaData.Measure | MetaData.Render);
    public static readonly SizeKey      = MuralBase.RegisterProperty<RibbonButtonSize>(
        RibbonButton, 'Size', RibbonButtonSize.Large, MetaData.Measure);

    static
    {
        MuralBase.OverrideMetadata(RibbonButton, Element.DefaultStyleKeyKey, { default_value: RibbonButton });
    }

    public get LargeIcon(): Visual | undefined  { return this.get_property_value(RibbonButton.LargeIconKey); }
    public set LargeIcon(v: Visual | undefined) { this.set_property_value(RibbonButton.LargeIconKey, v); }

    public get SmallIcon(): Visual | undefined  { return this.get_property_value(RibbonButton.SmallIconKey); }
    public set SmallIcon(v: Visual | undefined) { this.set_property_value(RibbonButton.SmallIconKey, v); }

    public get Text(): string | undefined  { return this.get_property_value(RibbonButton.TextKey); }
    public set Text(v: string | undefined) { this.set_property_value(RibbonButton.TextKey, v); }

    public get Size(): RibbonButtonSize  { return this.get_property_value(RibbonButton.SizeKey); }
    public set Size(v: RibbonButtonSize) { this.set_property_value(RibbonButton.SizeKey, v); }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'LargeIcon' || name === 'SmallIcon' || name === 'Text' || name === 'Size')
        {
            rebuildRibbonContent(this);
        }
    }
}

// RibbonToggleButton — same DPs as RibbonButton but IsChecked-tracking
// (extends ToggleButton). The default Style's IsChecked trigger swaps to
// a filled-tonal chrome so a sticky toggle stays visible in a group.
export class RibbonToggleButton extends ToggleButton
{
    public static readonly LargeIconKey = MuralBase.RegisterProperty<Visual | undefined>(
        RibbonToggleButton, 'LargeIcon', undefined, MetaData.Measure);
    public static readonly SmallIconKey = MuralBase.RegisterProperty<Visual | undefined>(
        RibbonToggleButton, 'SmallIcon', undefined, MetaData.Measure);
    public static readonly TextKey      = MuralBase.RegisterProperty<string | undefined>(
        RibbonToggleButton, 'Text', undefined, MetaData.Measure | MetaData.Render);
    public static readonly SizeKey      = MuralBase.RegisterProperty<RibbonButtonSize>(
        RibbonToggleButton, 'Size', RibbonButtonSize.Large, MetaData.Measure);

    static
    {
        MuralBase.OverrideMetadata(RibbonToggleButton, Element.DefaultStyleKeyKey, { default_value: RibbonToggleButton });
    }

    public get LargeIcon(): Visual | undefined  { return this.get_property_value(RibbonToggleButton.LargeIconKey); }
    public set LargeIcon(v: Visual | undefined) { this.set_property_value(RibbonToggleButton.LargeIconKey, v); }

    public get SmallIcon(): Visual | undefined  { return this.get_property_value(RibbonToggleButton.SmallIconKey); }
    public set SmallIcon(v: Visual | undefined) { this.set_property_value(RibbonToggleButton.SmallIconKey, v); }

    public get Text(): string | undefined  { return this.get_property_value(RibbonToggleButton.TextKey); }
    public set Text(v: string | undefined) { this.set_property_value(RibbonToggleButton.TextKey, v); }

    public get Size(): RibbonButtonSize  { return this.get_property_value(RibbonToggleButton.SizeKey); }
    public set Size(v: RibbonButtonSize) { this.set_property_value(RibbonToggleButton.SizeKey, v); }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'LargeIcon' || name === 'SmallIcon' || name === 'Text' || name === 'Size')
        {
            rebuildRibbonContent(this);
        }
    }
}
