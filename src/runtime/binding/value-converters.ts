import type { ValueConverter } from './binding.js';

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
