import { type PointerEventArgs } from '../runtime/index.js';
import { Border } from './border.js';

// Invisible outside-click absorber used by popup hosts (ComboBox,
// ContextMenu, MenuPopupHost, BrushPicker / ColorPicker triggers,
// ToolBar overflow, SplitButton, …). Same press-here-release-here gate
// as the Drawer scrim; fully transparent so the painted popup remains
// visually unobscured. Both PointerDown and PointerUp are marked
// Handled so a click-outside-popup never reaches an underlying visual
// in the main tree. Exported for the compiled-`.mu` templates; not
// part of the public package surface.
export class ClickAwayScrim extends Border
{
    public onClick: (() => void) | undefined;
    private _pressOriginatedHere = false;

    protected override OnPointerDown(args: PointerEventArgs): void
    {
        this._pressOriginatedHere = true;
        args.Handled = true;
    }

    protected override OnPointerUp(args: PointerEventArgs): void
    {
        const fire = this._pressOriginatedHere && this.IsMouseOver;
        this._pressOriginatedHere = false;
        args.Handled = true;
        if (fire) this.onClick?.();
    }

    protected override OnPointerLeave(_args: PointerEventArgs): void
    {
        this._pressOriginatedHere = false;
    }
}
