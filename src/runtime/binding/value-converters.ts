import type { ValueConverter } from './binding.js';
import { Visibility } from '../../visual-engine/visual.js';

// General-purpose value converters usable on the `<<` binding pipe. Unlike
// the colour modifiers, these are type-agnostic and carry a `convertBack`
// so they work on TwoWay bindings.

// `Is(x)` — a value-reflection converter for radio-style toggles.
//
//   convert(v)  → v === x   (the bound target reads "checked" when the
//                            source currently equals x)
//   convertBack → x         (on writeback the source becomes x — clicking a
//                            toggle always SELECTS x, so clicking the already-
//                            active option writes x again, an idempotent
//                            no-op rather than clearing the selection)
//
// The canonical use is `IsChecked = $Enum << Is(SomeEnum.Member)` across a row
// of ToolBarToggleButtons: exactly one shows checked, and clicking one sets
// the bound enum to that member (which re-reflects the whole row).
export function Is(expected: unknown): ValueConverter
{
    return {
        convert:     (value: unknown): boolean => value === expected,
        convertBack: (): unknown => expected,
    };
}

// `ToVisibility` — a boolean → Visibility converter OBJECT for reactive show/hide
// bindings: `Visibility = $path << ToVisibility`. Truthy → Visible; falsy →
// Collapsed (the element leaves layout entirely). A bare converter, not a factory
// (referenced without parens, like an imported ValueConverter) — OneWay, since a
// Visibility isn't written back to a boolean source.
//
// Canonical use is collapsing a whole region off a service flag, e.g. the shell
// inspector column: `Visibility = $service(InspectorService).HasInspectors <<
// ToVisibility` drops the pane (and its resize splitter) when nothing is hosted.
export const ToVisibility: ValueConverter = {
    convert: (value: unknown): Visibility => value ? Visibility.Visible : Visibility.Collapsed,
};
