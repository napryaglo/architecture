// list-box demo — declarative ListBox on the left, Items-driven on the
// right. The factory just hands back the compiled root; selection is
// already visible via row highlighting. The platform host doesn't need
// to wire a SelectionChangedListener because the demo body has no
// status strip — visual feedback IS the highlight.
import { app } from '../../list-box.mu.js';
import { register } from '../registry.mjs';

register({
    id:       'list-box',
    group:    'Controls',
    title:    'ListBox',
    subtitle: 'Declarative ListBoxItems vs. Items=[…] convenience. Extended-mode multi-select on the left (Ctrl / Shift).',
    factory:  () => app.Root,
});
