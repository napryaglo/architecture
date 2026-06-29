import { Control } from './control.js';

// A templated control with no consumer-supplied Content slot — Slider,
// ScrollBar, SpinEdit, Divider and friends have template parts
// (PART_Thumb, PART_Up, …) but nothing the consumer nests inside them.
//
// All template machinery — the `Template` DP, the applied instance,
// GetTemplateChild, layout delegation, target / inheritance propagation —
// lives on `Control`. This is just the bare-template flavor: Control
// minus the Content slot that `ContentControl` adds and minus the items
// machinery that `ItemsControl` adds. It exists as a named base so those
// content-free controls extend an intent-revealing type, and so existing
// `extends TemplatedControl` call sites keep working unchanged.
export class TemplatedControl extends Control { }
