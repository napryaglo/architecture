// Document formatting — reformats a whole .mu buffer to canonical style.
// Backs Shift+Alt+F and editor.formatOnSave. Delegates to the compiler's
// `format`, so the editor and the `npm run format` CLI produce byte-for-
// byte identical output.

import { Range, TextEdit } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { format } from '@pragmatic-lab/mural/compiler';

export function formatting(doc: TextDocument): TextEdit[]
{
    const src = doc.getText();
    let out: string;
    try
    {
        // `verify` makes format() re-parse its own output and throw if it
        // doesn't round-trip — so a printer gap (an unhandled node kind that
        // prints to nothing) can never silently wipe the buffer on save.
        out = format(src, { verify: true });
    }
    catch
    {
        // Unparseable buffer (mid-edit), or output failed the round-trip
        // check — leave it untouched rather than throwing away the user's
        // text.
        return [];
    }
    if (out === src) return [];
    const whole = Range.create(doc.positionAt(0), doc.positionAt(src.length));
    return [TextEdit.replace(whole, out)];
}
