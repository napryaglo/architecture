// slider demo — single-thumb Slider in two horizontal layouts and a
// vertical one. The factory hands back the compiled root; all
// interaction (thumb drag, track-click jump-to-point, ArrowKeys,
// PageUp/Down, Home/End) flows through Slider's own handlers — no
// platform-side wiring needed.
import { app } from '../../slider.mu.js';
import { register } from '../registry.mjs';

register({
    id:       'slider',
    group:    'Controls',
    title:    'Slider',
    subtitle: 'Single-thumb range with horizontal + vertical orientation, keyboard nudges, and track-click jump-to-point.',
    factory:  () => app.Root,
});
