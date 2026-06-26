import type { ValueConverter } from '../../runtime/index.js';

// Converter that picks a value from a list by AlternationIndex
// (or any integer input). Mirrors WPF's
// System.Windows.Controls.AlternationConverter.
//
// Typical use:
//   * Style targeting ListBoxItem (etc.) sets
//     `Background = SetterFactory(t => Binding(t, '(ItemsControl.AlternationIndex)', { converter: brushAlt })`
//     where `brushAlt = new AlternationConverter([whiteBrush, lightGrayBrush])`.
//   * Per-row alternation flips between `Values[0]` and `Values[1]` for
//     AlternationCount=2 (even and odd rows). With longer Values
//     arrays and AlternationCount=N, every N-th row picks a different
//     entry; the converter wraps via modulo so out-of-range inputs
//     still produce a value.
//
// Indexing is round-robin: `Values[index % Values.length]`. Negative or
// non-integer inputs are clamped to a sensible default (Values[0]).
export class AlternationConverter implements ValueConverter
{
    constructor(public readonly Values: readonly unknown[] = []) {}

    public convert(value: unknown): unknown
    {
        if (this.Values.length === 0) return undefined;
        const n = typeof value === 'number' && Number.isFinite(value) && value >= 0
            ? Math.floor(value)
            : 0;
        return this.Values[n % this.Values.length];
    }
}
