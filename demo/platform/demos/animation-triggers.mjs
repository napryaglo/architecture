// animation-triggers demo — markup-only showcase of the advanced
// trigger-action shapes: PropertyTrigger enter/exit, `on Loaded`, and
// `Storyboard.TargetName` cross-target animation. Like its sibling
// `animation-declarative`, this demo has zero host-side wiring — the
// imported app.Root carries everything in its style block.
import { app } from '../../animation-triggers.mu.js';
import { register } from '../registry.mjs';

register({
    id:       'animation-triggers',
    group:    'Animation',
    title:    'Trigger actions',
    subtitle: '`when(){ on enter/exit }`, `on Loaded`, `TargetName=banner` — all-markup, zero host JS.',
    factory:  () => app.Root,
});
