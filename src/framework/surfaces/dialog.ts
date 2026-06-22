import { MetaData, Model, Element, Visual } from '../../runtime/index.js';
import { ContentControl } from '../content-control.js';

// M3 Dialog — modal surface with title + content + actions, anchored
// over a scrim that absorbs outside clicks.
//
// mural ships the surface DPs here. The modal-mount behaviour (open
// onto the PresentationTarget's OverlayLayer with the scrim Below,
// trap focus inside the dialog until close, run Cancel-on-Escape)
// follows the Drawer Temporary variant pattern — Drawer's OverlayHost
// + ScrimSurface are already in src/framework/drawer.ts; Dialog
// reuses the same overlay infrastructure once the wiring lands as a
// follow-up Behaviour or class-level method.
//
// API parity with WPF's MessageDialog: open via a static `Show()`
// (not added here) that returns a Promise of the user's chosen
// action; consumer-supplied actions surface back through the action
// button's Command / ClickHandler bound at the consumer site.
//
// Slots — Title (string DP for the headline), Content (inherited
// from ContentControl) for the body, Actions for the trailing action
// row (typically Text Buttons per M3 spec).
export class Dialog extends ContentControl
{
    public static readonly TitleKey = Model.RegisterProperty<string>(
        Dialog, 'Title', '', MetaData.Render);
    public static readonly ActionsKey = Model.RegisterProperty<Visual | undefined>(
        Dialog, 'Actions', undefined, MetaData.Render);

    public get Title(): string { return this.get_property_value(Dialog.TitleKey); }
    public set Title(v: string) { this.set_property_value(Dialog.TitleKey, v); }

    public get Actions(): Visual | undefined { return this.get_property_value(Dialog.ActionsKey); }
    public set Actions(v: Visual | undefined) { this.set_property_value(Dialog.ActionsKey, v); }

    static {
        Model.OverrideMetadata(
            Dialog, Element.DefaultStyleKeyKey,
            { default_value: Dialog });
    }
}
