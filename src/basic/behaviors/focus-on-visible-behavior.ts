import {
    Behavior,
    MetaData,
    Model,
    Visibility,
    Visual,
    type PropertyChangeCallback,
} from '../../runtime/index.js';

// FocusOnVisibleBehavior — moves keyboard focus to its host the instant the
// host becomes visible, and (by default) selects the host's text if it is an
// editor. Purpose: declarative auto-focus for an inline editor that lives in
// the tree permanently but toggles Visibility — e.g. a rename TextBox revealed
// by an `IsEditing` binding. Without it the editor appears unfocused and the
// user has to click before typing.
//
// It focuses the host if the host itself is focusable, otherwise its first
// focusable descendant — so it can attach either directly to a focusable editor
// or to a non-focusable wrapper that toggles visibility (e.g. a Border around an
// inline TextBox, since a TextBox has no content model to host a Behaviors block):
//   Border [ Visibility = $IsEditing << ToVisibility ] {
//       Behaviors { FocusOnVisibleBehavior }
//       TextBox [ Text = $EditingName, Variant = Plain ]
//   }
//
// It watches the host's Visibility DP; every transition to Visible re-focuses
// (and re-selects), so re-entering edit mode on the same row works too. The
// initial OnAttached also focuses when the host is already visible at attach.
//
// SelectAll (default true) selects the whole text on focus so the first
// keystroke replaces it — the standard rename-field behaviour. It is a no-op
// on targets that expose no SelectAll() method.
export class FocusOnVisibleBehavior extends Behavior
{
    public static readonly SelectAllKey = Model.RegisterProperty<boolean>(
        FocusOnVisibleBehavior, 'SelectAll', true, MetaData.None);

    public get SelectAll(): boolean { return this.get_property_value(FocusOnVisibleBehavior.SelectAllKey); }
    public set SelectAll(v: boolean) { this.set_property_value(FocusOnVisibleBehavior.SelectAllKey, v); }

    private _visual:   Visual | undefined;
    private _listener: PropertyChangeCallback | undefined;

    public override OnAttached(visual: Visual): void
    {
        this._visual = visual;
        const listener: PropertyChangeCallback = () => this.focusIfVisible();
        this._listener = listener;
        visual.AddPropertyChangedListener(Visual.VisibilityKey, listener);
        // Cover the case where the host is already visible at attach time.
        this.focusIfVisible();
    }

    public override OnDetached(visual: Visual): void
    {
        if (this._listener !== undefined)
        {
            visual.RemovePropertyChangedListener(Visual.VisibilityKey, this._listener);
        }
        this._listener = undefined;
        this._visual   = undefined;
    }

    private focusIfVisible(): void
    {
        const host = this._visual;
        if (host === undefined || host.Visibility !== Visibility.Visible) return;
        const target = firstFocusable(host);
        if (target === undefined) return;
        // Visual.Focus() routes through the element's own InputManager bridge —
        // exactly what Keyboard.Focus(target) does, minus the Element-typed param.
        target.Focus();
        if (this.SelectAll)
        {
            // Duck-typed so the behavior stays decoupled from TextBox — any
            // editor exposing SelectAll() (TextBox, RichTextBox) is selected.
            const editor = target as unknown as { SelectAll?: () => void };
            if (typeof editor.SelectAll === 'function') editor.SelectAll();
        }
    }
}

// The host if it's focusable, else the first focusable Visual in its subtree
// (depth-first). Lets the behavior attach to a non-focusable wrapper around the
// real editor.
function firstFocusable(v: Visual): Visual | undefined
{
    if (v.Focusable) return v;
    for (const child of v.visualChildren)
    {
        const found = firstFocusable(child);
        if (found !== undefined) return found;
    }
    return undefined;
}
