// dashboard demo — Style + when() triggers on Border. No view-model,
// no host-side wiring; the factory just hands back the compiled root.
import { app } from '../../dashboard.mu.js';
import { register } from '../registry.mjs';

register({
    id:       'dashboard',
    group:    'Styles & Triggers',
    title:    'Dashboard',
    subtitle: 'Three Border styles with property triggers (IsMouseOver / IsPressed).',
    factory:  () => app.Root,
});
