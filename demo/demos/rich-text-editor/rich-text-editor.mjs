// Bootstrap for the rich-text-editor demo.
//
// The FlowDocument and toolbar are authored in rich-text-editor.mu; the
// RichTextBox handles all editing internally (caret, selection, keyboard,
// mouse). This bootstrap only bridges the toolbar buttons to the editor's
// public editing commands — a demo-local behaviour attached on mount. It
// gives each button an ICommand that invokes the matching editor command
// (which acts on the editor's persisted selection) and then returns focus
// to the editor so typing can continue.

import { Application, RelayCommand } from '@visualisation-sub/mural/runtime';
import { RichTextBox } from '@visualisation-sub/mural/basic';

import { RichTextEditorDemo } from './rich-text-editor.mu.js';
import { RichTextEditorVM } from './rich-text-editor-vm.mjs';
import { register } from '../../platform/registry.mjs';

function attachToolbar(view) {
    const editor = view.FindName('Editor');
    if (!(editor instanceof RichTextBox)) return function detach() {};

    const wire = (name, run) => {
        const btn = view.FindName(name);
        if (btn === undefined) return;
        btn.Command = new RelayCommand(() => { run(); editor.Focus(); });
    };

    wire('BoldBtn',      () => editor.ToggleBold());
    wire('ItalicBtn',    () => editor.ToggleItalic());
    wire('UnderlineBtn', () => editor.ToggleUnderline());
    wire('IndentBtn',    () => editor.Indent());
    wire('OutdentBtn',   () => editor.Outdent());

    // Buttons are GC'd with the view; nothing persistent to unwind.
    return function detach() {};
}

let resourcesMerged = false;
let vmInstance;

register({
    id:       'rich-text-editor',
    group:    'Demos',
    title:    'Rich text editor',
    subtitle: 'A FlowDocument editor — caret, selection, Ctrl+B / I / U formatting, and bulleted / numbered lists with Tab indent.',
    factory: () => {
        if (!resourcesMerged) {
            Application.current?.Resources.AddMergedDictionary(RichTextEditorDemo.Clone());
            resourcesMerged = true;
        }
        if (vmInstance === undefined) vmInstance = new RichTextEditorVM();
        vmInstance.OnViewMounted = (view) => attachToolbar(view);
        return vmInstance;
    },
});
