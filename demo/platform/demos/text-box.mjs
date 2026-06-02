// text-box demo — single-line + multi-line TextBoxes in a left-right
// split. No view-model needed; the factory hands back the compiled
// root. The runtime keyboard pipeline (HtmlTarget keydown → InputManager
// → focused TextBox) is what powers caret movement, selection, and
// clipboard — clicking inside a field focuses it, then editing works
// the same way native text inputs do.
import { app } from '../../text-box.mu.js';
import { register } from '../registry.mjs';

register({
    id:       'text-box',
    group:    'Controls',
    title:    'TextBox',
    subtitle: 'Single-line + multi-line text editing with selection, navigation, and clipboard (Ctrl+A/C/X/V).',
    factory:  () => app.Root,
});
