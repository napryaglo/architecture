// animation-declarative demo — purely markup-driven. Zero host-side
// wiring: the imported app.Root already carries the implicit style
// with `on Click { BeginStoryboard { ... } }` baked in. Buttons start
// animating on first click without any JS plumbing.
import { app } from '../../animation-declarative.mu.js';
import { register } from '../registry.mjs';

register({
    id:       'animation-declarative',
    group:    'Animation',
    title:    'Declarative trigger actions',
    subtitle: '`on Click { BeginStoryboard { DoubleAnimation[...] } }` inside a style — no host-side JS.',
    factory:  () => app.Root,
});
