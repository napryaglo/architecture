// Layout axis shared across the panels and oriented controls (StackPanel,
// WrapPanel, ScrollBar, Slider, Splitter, Line, …). Vertical runs the primary
// axis top-to-bottom; Horizontal runs it left-to-right. Matches WPF's
// System.Windows.Controls.Orientation.
//
// Lives in its own module (rather than inside a specific panel) so no consumer
// has to depend on StackPanel just to name an axis.
export enum Orientation
{
    Vertical   = 'Vertical',
    Horizontal = 'Horizontal',
}
