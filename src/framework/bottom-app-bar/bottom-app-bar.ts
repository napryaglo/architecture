import {
    MetaData,
    MuralBase,
    ObservableCollection,
    Element, Visual,
    type CollectionChange,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { Border } from '../../basic/border.js';
import { StackPanel } from '../../basic/panels/stack-panel.js';
import { TemplatedControl } from '../../basic/templated-control.js';

// Material 3 Bottom App Bar — the action strip anchored to the bottom of
// a screen. Carries a leading row of icon-button actions and an optional
// trailing floating action button (FAB). The companion to TopAppBar for
// mobile-shaped chromes (§18.9).
//
// BottomAppBar extends TemplatedControl (like TopAppBar): the chrome
// lives entirely inside a single ControlTemplate and the class manages
// two named parts (PART_ActionsStack / PART_FabSlot), syncing the public
// DPs into them on change. There is no size-variant set — M3 defines one
// bottom-bar shape.
//
// Slot model:
//   * Actions        — ObservableCollection<Visual>. The class observes
//     CollectionChanged and mirrors adds / removes into
//     PART_ActionsStack.Children. ALSO the default markup slot (kind
//     'list' in DEFAULT_SLOT_INFO), so
//
//         BottomAppBar { IconButton; IconButton }
//
//     is the same as bottomAppBar.Actions.Add(iconButton) twice.
//   * FloatingAction — single Visual. The ctor sets it as the child of
//     PART_FabSlot; clearing the DP detaches the previous child.
//     Typically a FloatingActionButton pinned to the trailing edge.
export class BottomAppBar extends TemplatedControl
{
    public static readonly ActionsKey = MuralBase.RegisterProperty<ObservableCollection<Visual>>(
        BottomAppBar, 'Actions', undefined as unknown as ObservableCollection<Visual>,
        MetaData.None,
    );
    public static readonly FloatingActionKey = MuralBase.RegisterProperty<Visual | undefined>(
        BottomAppBar, 'FloatingAction', undefined, MetaData.None,
    );

    static
    {
        MuralBase.OverrideMetadata(
            BottomAppBar, Element.DefaultStyleKeyKey,
            { default_value: BottomAppBar },
        );
    }

    private _actionsStack: StackPanel | undefined;
    private _fabSlot:      Border     | undefined;
    private _actionsSubscription: (() => void) | undefined;

    constructor()
    {
        super();
        // Auto-instantiate the Actions collection per-instance so the
        // markup body `BottomAppBar { … }` always has a target to push into.
        this.set_property_value(BottomAppBar.ActionsKey, new ObservableCollection<Visual>());

        // applyDefaultStyle → Template DP → rebuildTemplate materialises
        // the template tree before we FindName the parts and seed them.
        this.applyDefaultStyle();
        this.adoptTemplateParts();
        this.attachActionsSubscription();
        this.syncActions();
        this.syncFloatingAction();
    }

    public get Actions(): ObservableCollection<Visual>
    {
        return this.get_property_value(BottomAppBar.ActionsKey);
    }

    public get FloatingAction():  Visual | undefined { return this.get_property_value(BottomAppBar.FloatingActionKey); }
    public set FloatingAction(v: Visual | undefined) { this.set_property_value(BottomAppBar.FloatingActionKey, v); }

    // Markup default-slot routing — `BottomAppBar { IconButton }` lands
    // here via the compiler's `parent.AddChild(child)` emit for the
    // 'list' slot. Pushes the child into Actions; the CollectionChanged
    // listener mirrors it into PART_ActionsStack.
    public AddChild(child: Visual): void
    {
        this.Actions.Add(child);
    }

    // ── Template-part management ───────────────────────────────────

    private releaseFromOldParts(): void
    {
        if (this._fabSlot !== undefined) this._fabSlot.SetChild(undefined);
        if (this._actionsStack !== undefined)
        {
            for (const c of [...this._actionsStack.visualChildren])
            {
                this._actionsStack.RemoveChild(c);
            }
        }
    }

    private adoptTemplateParts(): void
    {
        const root = this.templateRoot;
        if (root === undefined)
        {
            throw new Error(
                'BottomAppBar template did not materialise. Did the default ' +
                'Style in framework.resources.mu set `Template = ' +
                '@DefaultBottomAppBar`?');
        }
        this._actionsStack = root.FindName('PART_ActionsStack') as StackPanel | undefined;
        this._fabSlot      = root.FindName('PART_FabSlot')      as Border     | undefined;
        if (this._actionsStack === undefined) throw new Error('BottomAppBar template missing PART_ActionsStack');
        if (this._fabSlot      === undefined) throw new Error('BottomAppBar template missing PART_FabSlot');
    }

    private syncFloatingAction(): void
    {
        const slot = this._fabSlot;
        if (slot === undefined) return;
        slot.SetChild(this.FloatingAction);
    }

    private attachActionsSubscription(): void
    {
        this._actionsSubscription?.();
        const col = this.Actions;
        this._actionsSubscription = col.Subscribe((ev: CollectionChange<Visual>) =>
        {
            this.handleActionsChange(ev);
        });
    }

    private syncActions(): void
    {
        const stack = this._actionsStack;
        if (stack === undefined) return;
        for (const c of [...stack.visualChildren]) stack.RemoveChild(c);
        for (const v of this.Actions) stack.AddChild(v);
    }

    private handleActionsChange(ev: CollectionChange<Visual>): void
    {
        const stack = this._actionsStack;
        if (stack === undefined) return;
        switch (ev.kind)
        {
            case 'inserted':
                for (const v of ev.items) stack.AddChild(v);
                return;
            case 'removed':
                for (const v of ev.items) stack.RemoveChild(v);
                return;
            case 'replaced':
                stack.RemoveChild(ev.oldItem);
                stack.AddChild(ev.newItem);
                return;
            case 'moved':
                stack.RemoveChild(ev.item);
                stack.AddChild(ev.item);
                return;
            case 'cleared':
                this.syncActions();
                return;
        }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        const name = descriptor.Name;
        if (name === 'Template' && newValue !== oldValue)
        {
            // TemplatedControl.rebuildTemplate already swapped the root;
            // release slotted children from the old parts before we
            // re-point at the new template's parts (else re-AddChild trips
            // the single-parent guard), then re-seed from the DPs.
            this.releaseFromOldParts();
            this.adoptTemplateParts();
            this.syncActions();
            this.syncFloatingAction();
            return;
        }
        if (name === 'FloatingAction')
        {
            this.syncFloatingAction();
            return;
        }
    }
}
