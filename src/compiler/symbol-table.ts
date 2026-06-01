// Symbol-table: maps unqualified PascalCase identifiers used in `.mu`
// source to the module they come from. Used by the emitter to build the
// `import { … } from "…"` header at the top of compiled JS, and to
// recognise legal references during bind.
//
// Pluggable: callers can wrap or replace `DEFAULT_SYMBOLS` to handle
// custom control libraries.

export type SymbolMap = Map<string, string>;

const ENTRIES: ReadonlyArray<readonly [string, string]> = [
    // ── runtime ─────────────────────────────────────────────────────
    ['Application',         '@visualisation-sub/mural/runtime'],
    ['Visual',              '@visualisation-sub/mural/runtime'],
    ['Single',              '@visualisation-sub/mural/runtime'],
    ['Panel',               '@visualisation-sub/mural/runtime'],
    ['ResourceDictionary',  '@visualisation-sub/mural/runtime'],
    ['Style',               '@visualisation-sub/mural/runtime'],
    ['Setter',              '@visualisation-sub/mural/runtime'],
    ['SetterFactory',       '@visualisation-sub/mural/runtime'],
    ['PropertyTrigger',     '@visualisation-sub/mural/runtime'],
    ['Binding',             '@visualisation-sub/mural/runtime'],
    ['BindingMode',         '@visualisation-sub/mural/runtime'],
    ['DynamicResource',     '@visualisation-sub/mural/runtime'],
    ['DataContextBinding',  '@visualisation-sub/mural/runtime'],
    ['MultiBinding',        '@visualisation-sub/mural/runtime'],
    ['TemplateBinding',     '@visualisation-sub/mural/runtime'],
    ['MultiTrigger',        '@visualisation-sub/mural/runtime'],
    ['HorizontalAlignment', '@visualisation-sub/mural/runtime'],
    ['VerticalAlignment',   '@visualisation-sub/mural/runtime'],
    ['Point',               '@visualisation-sub/mural/runtime'],
    ['Size',                '@visualisation-sub/mural/runtime'],
    ['Rect',                '@visualisation-sub/mural/runtime'],
    ['Color',               '@visualisation-sub/mural/runtime'],
    ['Matrix',              '@visualisation-sub/mural/runtime'],
    ['Thickness',           '@visualisation-sub/mural/runtime'],

    // ── Controls ────────────────────────────────────────────────────
    ['Border',                  '@visualisation-sub/mural/Controls'],
    ['Button',                  '@visualisation-sub/mural/Controls'],
    ['ClickMode',               '@visualisation-sub/mural/Controls'],
    ['TextBlock',               '@visualisation-sub/mural/Controls'],
    ['Canvas',                  '@visualisation-sub/mural/Controls'],
    ['ComboBox',                '@visualisation-sub/mural/Controls'],
    ['StackPanel',              '@visualisation-sub/mural/Controls'],
    ['Orientation',             '@visualisation-sub/mural/Controls'],
    ['ContentControl',          '@visualisation-sub/mural/Controls'],
    ['ContentPresenter',        '@visualisation-sub/mural/Controls'],
    ['ControlTemplate',         '@visualisation-sub/mural/Controls'],
    ['DataTemplate',            '@visualisation-sub/mural/Controls'],
    ['ItemsControl',            '@visualisation-sub/mural/Controls'],
    ['ItemContainerGenerator',  '@visualisation-sub/mural/Controls'],
    ['ItemsPresenter',          '@visualisation-sub/mural/Controls'],
    ['ScrollViewer',            '@visualisation-sub/mural/Controls'],
    ['VirtualizingPanel',       '@visualisation-sub/mural/Controls'],
    ['VirtualizingStackPanel',  '@visualisation-sub/mural/Controls'],
    ['TextWrapping',            '@visualisation-sub/mural/Controls'],

    // ── visual-engine ───────────────────────────────────────────────
    ['SolidColorBrush',     '@visualisation-sub/mural/visual-engine'],
    ['Brush',               '@visualisation-sub/mural/visual-engine'],
    ['Pen',                 '@visualisation-sub/mural/visual-engine'],
    ['FontWeight',          '@visualisation-sub/mural/visual-engine'],
    ['FontStyle',           '@visualisation-sub/mural/visual-engine'],
    ['Stretch',             '@visualisation-sub/mural/visual-engine'],
    ['AlignmentX',          '@visualisation-sub/mural/visual-engine'],
    ['AlignmentY',          '@visualisation-sub/mural/visual-engine'],
    ['GradientSpreadMethod', '@visualisation-sub/mural/visual-engine'],
    ['LineCap',             '@visualisation-sub/mural/visual-engine'],
    ['LineJoin',            '@visualisation-sub/mural/visual-engine'],
    ['FillRule',            '@visualisation-sub/mural/visual-engine'],
    ['SweepDirection',      '@visualisation-sub/mural/visual-engine'],
];

export const DEFAULT_SYMBOLS: SymbolMap = new Map(ENTRIES);

// Set of enum class names — used by the emitter to decide whether to
// emit `Orientation.Vertical` (when the property name happens to match
// an enum class) or fall back to a string literal. All runtime enums
// listed here MUST also appear in DEFAULT_SYMBOLS so the emitter can
// pull them in via an import.
export const ENUM_CLASSES: ReadonlySet<string> = new Set([
    'HorizontalAlignment',
    'VerticalAlignment',
    'FontWeight',
    'FontStyle',
    'Stretch',
    'AlignmentX',
    'AlignmentY',
    'BindingMode',
    'GradientSpreadMethod',
    'LineCap',
    'LineJoin',
    'FillRule',
    'SweepDirection',
    'TextWrapping',
    'ClickMode',
    'Orientation',
]);

// Meta-attr names whose RHS is a type reference (compiled as a bare
// class name, not a string). Used by resource forms.
export const TYPE_REF_META_ATTRS: ReadonlySet<string> = new Set([
    'targettype',
    'datatype',
]);

// Per-control default-slot info. Used by the emitter to translate
// `Border{ TextBlock{…} }` → `_border.Child = _text` vs
// `Canvas{ A B C }` → `_canvas.Children.push(_a/_b/_c)`.
//
// The `kind` controls how body elements are assigned:
//   'single'   — body must have exactly one element; assigned via slot
//   'list'     — body elements appended to a collection
//   'string'   — body parsed as text mode (deferred — not in phase 3)
//   'object'   — body is one element OR a literal (ContentControl-ish)
export interface SlotInfo
{
    name: string;
    kind: 'single' | 'list' | 'string' | 'object';
}

// One entry per known control. Unknown controls fall back to 'single'
// + 'Child' with an emit-time error if the body doesn't match.
export const DEFAULT_SLOT_INFO: ReadonlyMap<string, SlotInfo> = new Map<string, SlotInfo>([
    ['Border',                  { name: 'Child',    kind: 'single' }],
    ['Button',                  { name: 'Content',  kind: 'object' }],
    ['TextBlock',               { name: 'Text',     kind: 'string' }],
    ['Canvas',                  { name: 'Children', kind: 'list'   }],
    ['StackPanel',              { name: 'Children', kind: 'list'   }],
    ['ContentControl',          { name: 'Content',  kind: 'object' }],
    ['ContentPresenter',        { name: 'Content',  kind: 'object' }],
    ['ItemsControl',            { name: 'Items',    kind: 'list'   }],
    ['VirtualizingStackPanel',  { name: 'Children', kind: 'list'   }],
    ['ScrollViewer',            { name: 'Content',  kind: 'object' }],
]);
