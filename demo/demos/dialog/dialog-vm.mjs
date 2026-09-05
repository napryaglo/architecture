// DialogDemoVM — backs the Dialog demo. The demo renders a Dialog surface
// INLINE in the example area (not on the OverlayLayer), so this VM only owns
// the interaction state the view binds to: whether the dialog is showing, and
// the last action the user chose. Derives from Observable (the lightweight INPC
// root) — no dependency properties are needed here, just bindable state.
import { Observable, RelayCommand } from '@pragmatic-tech-ai/mural/runtime';
import { DialogAction } from '@pragmatic-tech-ai/mural/framework';
import { ButtonVariant } from '@pragmatic-tech-ai/mural/framework';
export class DialogDemoVM extends Observable {
    // Backing fields — plain state, surfaced through notifying accessors below.
    _isOpen = true;
    _result = 'No choice yet — the dialog is open.';
    // The dialog's trailing actions — one DialogAction VM each. The Dialog
    // template's ItemsControl stamps a Button per action; Delete is the primary
    // (Filled) action, Cancel the secondary (Text). Built once in the ctor.
    _actions;
    _showCommand;
    constructor() {
        super();
        const cancel = new RelayCommand(() => { this.Result = 'Cancelled — nothing was deleted.'; this.IsOpen = false; });
        const del = new RelayCommand(() => { this.Result = 'Deleted report.pdf.'; this.IsOpen = false; });
        this._actions = [
            new DialogAction('Cancel', cancel, ButtonVariant.Text),
            new DialogAction('Delete', del, ButtonVariant.Filled),
        ];
        this._showCommand = new RelayCommand(() => { this.Result = 'No choice yet — the dialog is open.'; this.IsOpen = true; });
    }
    // Drives the inline Dialog's (and its backdrop's) Visibility through
    // `$IsOpen << ToVisibility`. Dismissing an action collapses both; "Show
    // dialog" brings them back — all without any popup / overlay mount.
    get IsOpen() { return this._isOpen; }
    set IsOpen(v) {
        if (this._isOpen === v)
            return;
        const old = this._isOpen;
        this._isOpen = v;
        this.RaisePropertyChanged('IsOpen', old, v);
    }
    // The last action the user took, shown in a read-out beneath the stage.
    get Result() { return this._result; }
    set Result(v) {
        if (this._result === v)
            return;
        const old = this._result;
        this._result = v;
        this.RaisePropertyChanged('Result', old, v);
    }
    // The Dialog binds Actions to this array; the template renders one Button
    // per DialogAction through its DataTemplate.
    get Actions() { return this._actions; }
    get ShowCommand() { return this._showCommand; }
}
