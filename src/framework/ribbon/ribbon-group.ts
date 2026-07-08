import {
    Element,
    MetaData,
    Model,
    Visual,
    type ICommand,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { Button } from '../buttons/button.js';
import { HeaderedItemsControl } from '../base/headered-items-control.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';
import { Orientation } from '../../basic/panels/orientation.js';
import { RibbonButton, RibbonToggleButton, RibbonButtonSize } from './ribbon-buttons.js';

// RibbonGroup — a bordered box inside a RibbonTab body. Hosts a row of
// invokers (RibbonButtons, RibbonSmallButtonColumns, RibbonSplitButtons,
// RibbonGalleries) with a Header label centred at the bottom and an
// optional `↘` dialog-launcher in the bottom-right corner.
//
//   ┌────────────────────────┐
//   │ [invokers row …]       │
//   │        Header        ↘ │
//   └────────────────────────┘
//
// LaunchCommand drives the launcher: when set, PART_Launcher becomes
// visible and its click invokes the command (typically opens a dialog).
// Visibility is managed imperatively because a Style trigger can't test
// "command is set" — same reason ToolBar toggles its chevron width in code.
export class RibbonGroup extends HeaderedItemsControl
{
    public static readonly LaunchCommandKey = Model.RegisterProperty<ICommand | undefined>(
        RibbonGroup, 'LaunchCommand', undefined, MetaData.None);

    static
    {
        Model.OverrideMetadata(RibbonGroup, Element.DefaultStyleKeyKey, { default_value: RibbonGroup });
    }

    private _launcher: Button | undefined;

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.adoptLauncher();
    }

    public get LaunchCommand(): ICommand | undefined  { return this.get_property_value(RibbonGroup.LaunchCommandKey); }
    public set LaunchCommand(v: ICommand | undefined) { this.set_property_value(RibbonGroup.LaunchCommandKey, v); }

    // Find PART_Launcher in the materialised template, wire its click to
    // the LaunchCommand, and set its initial visibility from whether a
    // command is present.
    private adoptLauncher(): void
    {
        const root = this.visualChildren[0];
        const launcher = root?.FindName('PART_Launcher');
        if (launcher instanceof Button)
        {
            this._launcher = launcher;
            launcher.AddClickHandler(() =>
            {
                const cmd   = this.LaunchCommand;
                const param = undefined;
                if (cmd !== undefined && cmd.CanExecute(param)) cmd.Execute(param);
            });
        }
        this.applyLauncherVisibility();
    }

    // Collapse the launcher (Width=0) when no command is set; restore to
    // auto (NaN) when one is. Same width-toggle trick ToolBar's chevron uses.
    private applyLauncherVisibility(): void
    {
        if (this._launcher === undefined) return;
        this._launcher.Width = this.LaunchCommand !== undefined ? Number.NaN : 0;
    }

    protected override validateDeclarativeChild(_child: Visual): void { }

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof Visual;
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'LaunchCommand') this.applyLauncherVisibility();
    }
}

// RibbonSmallButtonColumn — a vertical stack of up to three small
// invokers (the standard Office layout). Any RibbonButton /
// RibbonToggleButton added is coerced to Size=Small so authors don't have
// to set it on each child. A plain vertical StackPanel underneath — the
// count cap is advisory (not enforced) since Office lays out exactly three
// but a shorter column is legal.
export class RibbonSmallButtonColumn extends StackPanel
{
    constructor()
    {
        super();
        this.Orientation = Orientation.Vertical;
    }

    public override AddChild(child: Visual): void
    {
        if (child instanceof RibbonButton || child instanceof RibbonToggleButton)
        {
            child.Size = RibbonButtonSize.Small;
        }
        super.AddChild(child);
    }
}
