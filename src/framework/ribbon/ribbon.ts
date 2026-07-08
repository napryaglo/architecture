import {
    Element,
    MetaData,
    Model,
    ObservableCollection,
    Visual,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { Visibility } from '../../visual-engine/index.js';
import { Brush } from '../../visual-engine/index.js';
import { Control } from '../base/control.js';
import { Border } from '../../basic/border.js';
import { Button } from '../buttons/button.js';
import { ContentPresenter } from '../../basic/templates/content-presenter.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';
import { TextBlock } from '../../basic/text-block.js';
import { RibbonTab, RibbonContextualGroup } from './ribbon-tab.js';

// ─────────────────────────────────────────────────────────────────────
// RibbonTabHeader — one clickable header in the Ribbon's tab strip. A
// Button (not ToggleButton — the Ribbon owns selection state, so the
// header must NOT auto-flip on click). `IsCurrent` drives the selected
// chrome; `AccentBrush` tints a contextual tab's header background (the
// inline-badge look). The Ribbon builds one per visible tab and wires
// its click to select the tab.
export class RibbonTabHeader extends Button
{
    public static readonly IsCurrentKey   = Model.RegisterProperty<boolean>(
        RibbonTabHeader, 'IsCurrent', false, MetaData.Render);
    public static readonly AccentBrushKey = Model.RegisterProperty<Brush | undefined>(
        RibbonTabHeader, 'AccentBrush', undefined, MetaData.Render);

    static
    {
        Model.OverrideMetadata(RibbonTabHeader, Element.DefaultStyleKeyKey, { default_value: RibbonTabHeader });
    }

    public get IsCurrent(): boolean  { return this.get_property_value(RibbonTabHeader.IsCurrentKey); }
    public set IsCurrent(v: boolean) { this.set_property_value(RibbonTabHeader.IsCurrentKey, v); }

    public get AccentBrush(): Brush | undefined  { return this.get_property_value(RibbonTabHeader.AccentBrushKey); }
    public set AccentBrush(v: Brush | undefined) { this.set_property_value(RibbonTabHeader.AccentBrushKey, v); }
}

// One visible entry in the tab strip: the tab plus the accent brush its
// header should paint (undefined for a stable tab).
interface VisibleTab { tab: RibbonTab; accent: Brush | undefined; }

// ─────────────────────────────────────────────────────────────────────
// Ribbon — tabbed grouped command chrome (Office parity, single-row tab
// strip). Composed of:
//
//   * A Quick Access Toolbar (QAT) row of always-visible invokers.
//   * A tab strip of stable + active-contextual tab headers, plus a
//     minimize chevron.
//   * A body area showing the selected tab's RibbonGroups.
//
// Two authored collections beyond the default (stable) Tabs:
//   * ContextualGroups — RibbonContextualGroups whose IsActive predicate
//     (typically VM-bound) reveals their child contextual tabs with an
//     accent colour.
//   * QuickAccessItems — invokers for the QAT.
//
// Selection is tracked by REFERENCE (SelectedTab), not index, because the
// visible-tab set changes as contextual tabs appear / disappear. Tabs are
// logical children (of the Ribbon for stable tabs, of their group for
// contextual tabs) so their groups' bindings resolve against the
// inherited DataContext; the selected tab is slotted into PART_Body
// visually. IsMinimized collapses the body to a strip-only ribbon; a tab
// click re-expands it.
export class Ribbon extends Control
{
    public static readonly SelectedTabKey = Model.RegisterProperty<RibbonTab | undefined>(
        Ribbon, 'SelectedTab', undefined, MetaData.Measure | MetaData.Render);
    public static readonly IsMinimizedKey = Model.RegisterProperty<boolean>(
        Ribbon, 'IsMinimized', false, MetaData.None);

    static
    {
        Model.OverrideMetadata(Ribbon, Element.DefaultStyleKeyKey, { default_value: Ribbon });
    }

    private readonly _tabs             = new ObservableCollection<RibbonTab>([]);
    private readonly _contextualGroups = new ObservableCollection<RibbonContextualGroup>([]);
    private readonly _qatItems         = new ObservableCollection<Visual>([]);

    // Reused header per tab so click handlers persist across rebuilds.
    private readonly _headers = new Map<RibbonTab, RibbonTabHeader>();

    private _tabStrip:      StackPanel       | undefined;
    private _bodyPresenter: ContentPresenter | undefined;
    private _bodyContainer: Border           | undefined;
    private _qatHost:       StackPanel       | undefined;
    private _minimizeButton: Button          | undefined;

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.adoptParts();

        // Contextual groups + QAT items arrive via property-element `.Add`
        // (the compiler emits `ribbon.ContextualGroups.Add(g)` etc.) — react
        // on each mutation.
        this._contextualGroups.Subscribe((c) =>
        {
            if (c.kind === 'inserted') for (const g of c.items) this.onGroupAdded(g);
            this.rebuildVisibleTabs();
        });
        this._qatItems.Subscribe((c) =>
        {
            if (c.kind === 'inserted') for (const it of c.items) this.onQatItemAdded(it);
        });

        this.rebuildVisibleTabs();
        this.applyMinimizedState();
    }

    // ── Authored collections (compiler .Add targets) ────────────────────
    public get Tabs():             ObservableCollection<RibbonTab>             { return this._tabs; }
    public get ContextualGroups(): ObservableCollection<RibbonContextualGroup> { return this._contextualGroups; }
    public get QuickAccessItems(): ObservableCollection<Visual>                { return this._qatItems; }

    public get SelectedTab(): RibbonTab | undefined  { return this.get_property_value(Ribbon.SelectedTabKey); }
    public set SelectedTab(v: RibbonTab | undefined) { this.set_property_value(Ribbon.SelectedTabKey, v); }

    public get IsMinimized(): boolean  { return this.get_property_value(Ribbon.IsMinimizedKey); }
    public set IsMinimized(v: boolean) { this.set_property_value(Ribbon.IsMinimizedKey, v); }

    // Stable tabs arrive as default-slot children → AddChild. Attach each
    // logically (for DataContext) and hook its IsActive/Color changes.
    public AddChild(child: Visual): void
    {
        if (!(child instanceof RibbonTab))
        {
            throw new Error('Ribbon only accepts RibbonTab children (put contextual tabs in a '
                + 'ContextualGroups { … } block and QAT invokers in a QuickAccessItems { … } block).');
        }
        this._tabs.Add(child);
        this.AttachLogical(child);
        child._onTabChanged = (): void => this.rebuildVisibleTabs();
        this.rebuildVisibleTabs();
    }

    public override get logicalChildren(): readonly Visual[]
    {
        // Stable tabs + contextual groups + QAT invokers all inherit
        // DataContext / resources through the logical chain. Contextual
        // tabs inherit transitively via their group's logicalChildren.
        return [
            ...this._tabs.ToArray(),
            ...this._contextualGroups.ToArray(),
            ...this._qatItems.ToArray(),
        ];
    }

    private adoptParts(): void
    {
        const strip = this.GetTemplateChild('PART_TabStrip');
        const body  = this.GetTemplateChild('PART_Body');
        const bodyC = this.GetTemplateChild('PART_BodyContainer');
        const qat   = this.GetTemplateChild('PART_Qat');
        const mini  = this.GetTemplateChild('PART_MinimizeButton');
        if (strip instanceof StackPanel)       this._tabStrip       = strip;
        if (body  instanceof ContentPresenter) this._bodyPresenter  = body;
        if (bodyC instanceof Border)           this._bodyContainer  = bodyC;
        if (qat   instanceof StackPanel)       this._qatHost        = qat;
        if (mini  instanceof Button)
        {
            this._minimizeButton = mini;
            mini.AddClickHandler(() => { this.IsMinimized = !this.IsMinimized; });
        }
    }

    private onGroupAdded(group: RibbonContextualGroup): void
    {
        this.AttachLogical(group);
        group._onIsActiveChanged = (): void => this.rebuildVisibleTabs();
        for (const t of group.Tabs.ToArray()) t._onTabChanged = (): void => this.rebuildVisibleTabs();
    }

    private onQatItemAdded(item: Visual): void
    {
        this._qatHost?.AddChild(item);
    }

    // Recompute the visible tab set (stable + active-contextual), sync the
    // header strip, and keep SelectedTab pointing at a still-visible tab.
    private rebuildVisibleTabs(): void
    {
        if (this._tabStrip === undefined) return;
        const visible: VisibleTab[] = [];
        for (const tab of this._tabs.ToArray())
        {
            if (tab.IsActive) visible.push({ tab, accent: tab.Color });
        }
        for (const group of this._contextualGroups.ToArray())
        {
            if (!group.IsActive) continue;
            for (const tab of group.Tabs.ToArray())
            {
                if (tab.IsActive) visible.push({ tab, accent: tab.Color ?? group.Color });
            }
        }

        // Rebuild the strip children in visible order, reusing header
        // instances so wired click handlers persist.
        for (const c of [...this._tabStrip.visualChildren]) this._tabStrip.RemoveChild(c);
        for (const v of visible)
        {
            const header = this.headerFor(v.tab);
            header.AccentBrush = v.accent;
            this._tabStrip.AddChild(header);
        }

        // Keep selection valid: if the current SelectedTab dropped out of
        // the visible set (or none is selected), select the first visible.
        const cur = this.SelectedTab;
        const stillVisible = cur !== undefined && visible.some((v) => v.tab === cur);
        if (!stillVisible)
        {
            this.SelectedTab = visible.length > 0 ? visible[0]!.tab : undefined;
        }
        else
        {
            // Selection unchanged — still refresh header IsCurrent flags.
            this.syncSelectionChrome();
        }
    }

    private headerFor(tab: RibbonTab): RibbonTabHeader
    {
        let header = this._headers.get(tab);
        if (header === undefined)
        {
            header = new RibbonTabHeader();
            header.Content = new TextBlock(tab.Header === undefined ? '' : String(tab.Header));
            header.AddClickHandler(() =>
            {
                this.SelectedTab = tab;
                if (this.IsMinimized) this.IsMinimized = false;
            });
            this._headers.set(tab, header);
        }
        return header;
    }

    // Reflect SelectedTab into the body presenter + header IsCurrent flags.
    private applySelection(): void
    {
        const sel = this.SelectedTab;
        if (this._bodyPresenter !== undefined) this._bodyPresenter.Content = sel;
        this.syncSelectionChrome();
    }

    private syncSelectionChrome(): void
    {
        const sel = this.SelectedTab;
        for (const [tab, header] of this._headers) header.IsCurrent = tab === sel;
    }

    private applyMinimizedState(): void
    {
        if (this._bodyContainer !== undefined)
        {
            this._bodyContainer.Visibility = this.IsMinimized ? Visibility.Collapsed : Visibility.Visible;
        }
        if (this._minimizeButton !== undefined)
        {
            // Chevron points down when expanded (click to collapse), up when
            // minimized (click to expand).
            this._minimizeButton.Content = new TextBlock(this.IsMinimized ? '⌄' : '⌃');
        }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'SelectedTab') this.applySelection();
        else if (descriptor.Name === 'IsMinimized') this.applyMinimizedState();
    }
}
