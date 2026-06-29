// Document formatting — reformats a whole .mu buffer to canonical style.
// Backs Shift+Alt+F and editor.formatOnSave. Delegates to the compiler's
// `format`, so the editor and the `npm run format` CLI produce byte-for-
// byte identical output.

import { Range, TextEdit } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { format } from '@visualisation-sub/mural/compiler';

export function formatting(doc: TextDocument): TextEdit[]
{
    const src = doc.getText();
    let out: string;
    try
    {
        out = format(src);
    }
    catch
    {
        // Unparseable buffer (mid-edit) — leave it untouched rather than
        // throwing away the user's text.
        return [];
    }
    if (out === src) return [];
    const whole = Range.create(doc.positionAt(0), doc.positionAt(src.length));
    return [TextEdit.replace(whole, out)];
}
