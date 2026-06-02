// spin-edit demo — numeric up/down fields exercising Value range,
// DecimalPlaces formatting, SmallChange / LargeChange stepping, and
// IsReadOnly. The factory hands back the compiled root; all interaction
// (button click, ArrowUp/Down, PageUp/Down, Enter / blur commit) flows
// through SpinEdit's own handlers — no platform-side wiring needed.
import { app } from '../../spin-edit.mu.js';
import { register } from '../registry.mjs';

register({
    id:       'spin-edit',
    group:    'Controls',
    title:    'SpinEdit',
    subtitle: 'Numeric up/down with clamping, decimal precision, and small/large step keys (Arrow, PageUp/Down).',
    factory:  () => app.Root,
});
