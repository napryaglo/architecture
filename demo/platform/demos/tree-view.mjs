// tree-view demo — composed-markup tree with multi-select. No VM
// needed; the factory just hands back the compiled root. Visual
// feedback for selection is the row highlighting itself, the standalone
// demo's external status strip lives outside the visual tree and
// doesn't translate into a platform-hosted body.
import { app } from '../../tree-view.mu.js';
import { register } from '../registry.mjs';

register({
    id:       'tree-view',
    group:    'Controls',
    title:    'TreeView',
    subtitle: 'Composed markup, chevron expand/collapse, Ctrl/Shift multi-select.',
    factory:  () => app.Root,
});
