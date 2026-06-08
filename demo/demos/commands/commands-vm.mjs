// CommandsVM — exercises all three command surfaces (Menu, ToolBar,
// ContextMenu) over the diagram demo's NodeVM. Extends DiagramVM with:
//
//   * Alignment commands (AlignLeft / AlignTop / AlignRight / AlignBottom)
//     operating on whichever NodeVMs have IsSelected=true.
//   * Cut / Copy / Paste / Delete / Duplicate / SelectAll / Undo /
//     Redo  — RelayCommands that update the Status string. Real
//     clipboard / undo plumbing is out of scope; the demo's job is to
//     show that one ICommand instance drives the toolbar, the menu,
//     AND each node's context menu in lockstep.
//   * HasSelection — bool DP the bootstrap writes from the Diagram's
//     SelectionChanged event. The selection-gated commands' CanExecute
//     reads it; CanExecuteChanged pulses on every flip.

import {
    MetaData,
    Model,
    RelayCommand,
} from '@visualisation-sub/mural/runtime';
import { DiagramVM, NodeVM } from '../diagram/diagram-vm.mjs';

export { NodeVM, RectNodeVM, EllipseNodeVM, NoteNodeVM, ToolboxShapeVM } from '../diagram/diagram-vm.mjs';

const NODE_W = 130;
const NODE_H = 60;

export class CommandsVM extends DiagramVM
{
    static HasSelectionKey = Model.RegisterProperty(CommandsVM, 'HasSelection', false, MetaData.None);

    constructor(storage) {
        super(storage);

        const setStatus = (msg) => this._set_property_value_by_name('Status', msg);
        const selected = () => {
            const out = [];
            const nodes = this.Nodes;
            for (let i = 0; i < nodes.Count; i++) {
                const v = nodes.Get(i);
                if (v.IsSelected) out.push(v);
            }
            return out;
        };
        const hasSel = () => this.HasSelection;

        // ── Edit commands (selection-gated) ───────────────────────────
        this.CutCommand    = new RelayCommand(() => {
            const s = selected();
            this._clipboard = s.map((n) => ({ kind: n.Kind, x: n.X, y: n.Y }));
            this.DeleteNodes(s);
            setStatus(`Cut ${s.length} node${s.length === 1 ? '' : 's'}.`);
        }, hasSel);
        this.CopyCommand   = new RelayCommand(() => {
            const s = selected();
            this._clipboard = s.map((n) => ({ kind: n.Kind, x: n.X, y: n.Y }));
            setStatus(`Copied ${s.length} node${s.length === 1 ? '' : 's'}.`);
        }, hasSel);
        this.PasteCommand  = new RelayCommand(() => {
            const c = this._clipboard ?? [];
            for (const e of c) this.CreateNode(e.kind, e.x + 20, e.y + 20);
            setStatus(`Pasted ${c.length} node${c.length === 1 ? '' : 's'}.`);
        }, () => Array.isArray(this._clipboard) && this._clipboard.length > 0);
        this.DeleteCommand = new RelayCommand(() => this.DeleteNodes(selected()), hasSel);
        this.DuplicateCommand = new RelayCommand(() => {
            const s = selected();
            for (const n of s) this.CreateNode(n.Kind, n.X + 24, n.Y + 24);
            setStatus(`Duplicated ${s.length} node${s.length === 1 ? '' : 's'}.`);
        }, hasSel);
        this.SelectAllCommand = new RelayCommand(() => {
            const nodes = this.Nodes;
            for (let i = 0; i < nodes.Count; i++) nodes.Get(i).IsSelected = true;
            this.HasSelection = nodes.Count > 0;
            this._raiseGated();
            setStatus(`Selected ${nodes.Count} node${nodes.Count === 1 ? '' : 's'}.`);
        });

        // ── Alignment commands ────────────────────────────────────────
        // X-axis alignment uses the LEFT edge for AlignLeft, the
        // CENTRE for AlignCenter, and the RIGHT edge for AlignRight.
        // Y-axis follows the same shape.
        this.AlignLeftCommand   = new RelayCommand(() => this._align('left'),   hasSel);
        this.AlignCenterCommand = new RelayCommand(() => this._align('center'), hasSel);
        this.AlignRightCommand  = new RelayCommand(() => this._align('right'),  hasSel);
        this.AlignTopCommand    = new RelayCommand(() => this._align('top'),    hasSel);
        this.AlignMiddleCommand = new RelayCommand(() => this._align('middle'), hasSel);
        this.AlignBottomCommand = new RelayCommand(() => this._align('bottom'), hasSel);

        // ── Stubs for surfaces that don't need real behaviour ─────────
        this.UndoCommand = new RelayCommand(() => setStatus('Undo — no-op stub.'));
        this.RedoCommand = new RelayCommand(() => setStatus('Redo — no-op stub.'));

        this._clipboard = [];
    }

    get HasSelection()  { return this._get_property_value_by_name('HasSelection'); }
    set HasSelection(v) { this._set_property_value_by_name('HasSelection', v); }

    /** Bootstrap calls this when the Diagram's SelectionChanged fires.
     *  Flipping HasSelection re-pulses CanExecuteChanged on every
     *  selection-gated command so toolbar / menu / context-menu chrome
     *  refreshes in lockstep. */
    PublishSelectionState(hasSelection) {
        if (this.HasSelection === hasSelection) return;
        this.HasSelection = hasSelection;
        this._raiseGated();
    }

    _raiseGated() {
        for (const name of [
            'CutCommand', 'CopyCommand', 'DeleteCommand',
            'DuplicateCommand', 'AlignLeftCommand', 'AlignCenterCommand',
            'AlignRightCommand', 'AlignTopCommand', 'AlignMiddleCommand',
            'AlignBottomCommand',
        ]) {
            this[name].RaiseCanExecuteChanged();
        }
        this.PasteCommand.RaiseCanExecuteChanged();
    }

    _align(mode) {
        const sel = [];
        const nodes = this.Nodes;
        for (let i = 0; i < nodes.Count; i++) {
            const v = nodes.Get(i);
            if (v.IsSelected) sel.push(v);
        }
        if (sel.length === 0) return;
        switch (mode) {
            case 'left':   { const min = Math.min(...sel.map((n) => n.X)); for (const n of sel) n.X = min; break; }
            case 'right':  { const max = Math.max(...sel.map((n) => n.X + NODE_W)); for (const n of sel) n.X = max - NODE_W; break; }
            case 'center': { const avg = sel.reduce((s, n) => s + n.X + NODE_W / 2, 0) / sel.length; for (const n of sel) n.X = avg - NODE_W / 2; break; }
            case 'top':    { const min = Math.min(...sel.map((n) => n.Y)); for (const n of sel) n.Y = min; break; }
            case 'bottom': { const max = Math.max(...sel.map((n) => n.Y + NODE_H)); for (const n of sel) n.Y = max - NODE_H; break; }
            case 'middle': { const avg = sel.reduce((s, n) => s + n.Y + NODE_H / 2, 0) / sel.length; for (const n of sel) n.Y = avg - NODE_H / 2; break; }
        }
        this._set_property_value_by_name('Status', `Align ${mode}: ${sel.length} node${sel.length === 1 ? '' : 's'}.`);
    }
}
