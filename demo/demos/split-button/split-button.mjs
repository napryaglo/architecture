// split-button demo — M3 SplitButton primary + chevron menu trigger.
//
// The popup body is constructed here (the bootstrap, where Visual
// construction is permitted) and handed to the VM as MenuPopup. The
// view binds SplitButton.MenuContent = $MenuPopup; the SplitButton
// class mounts / unmounts it on the OverlayLayer when IsOpen flips.
import { Application, Color, Thickness, CornerRadius } from '@visualisation-sub/mural/runtime';
import { Border, StackPanel, TextBlock, Orientation }   from '@visualisation-sub/mural/basic';
import { Button, ButtonVariant }                        from '@visualisation-sub/mural/framework';
import { SolidColorBrush }                              from '@visualisation-sub/mural/visual-engine';
import { SplitButtonDemo } from './split-button.mu.js';
import { SplitButtonVM } from './split-button-vm.mjs';
import { register } from '../../platform/registry.mjs';

let resourcesMerged = false;
let vmInstance;

function buildMenuPopup(vm) {
    // M3 dropdown chrome — SurfaceContainerHigh fill, OutlineVariant
    // border, ShapeMedium corner. Items are Text-variant buttons so
    // they render flat against the popup background.
    const stack = new StackPanel();
    stack.Orientation = Orientation.Vertical;

    const addItem = (label, command) => {
        const btn = new Button();
        btn.Variant = ButtonVariant.Text;
        btn.Command = command;
        const tb = new TextBlock();
        tb.Text = label;
        btn.Content = tb;
        stack.AddChild(btn);
    };
    addItem('Send now',      vm.SendNowCommand);
    addItem('Schedule send', vm.ScheduleSendCommand);
    addItem('Save draft',    vm.SaveDraftCommand);

    const border = new Border();
    // Resolve M3 brushes through the active theme — same path the .mu
    // tokens use under the hood, but ad-hoc here because this Border
    // lives outside markup.
    const surface  = Application.current?.TryFindResource('SurfaceContainerHigh');
    const outline  = Application.current?.TryFindResource('OutlineVariant');
    border.Background     = surface  ?? new SolidColorBrush(Color.White);
    border.BorderBrush    = outline  ?? new SolidColorBrush(Color.LightGray);
    border.BorderThickness = new Thickness(1);
    border.CornerRadius    = new CornerRadius(12);
    border.Padding         = new Thickness(4);
    border.SetChild(stack);
    return border;
}

register({
    id:       'split-button',
    group:    'Controls',
    title:    'SplitButton',
    subtitle: 'M3 SplitButton — primary action + chevron menu trigger.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(SplitButtonDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) {
            vmInstance = new SplitButtonVM();
            vmInstance.MenuPopup = buildMenuPopup(vmInstance);
        }
        return vmInstance;
    },
});
