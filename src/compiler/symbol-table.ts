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
    ['EventTrigger',           '@visualisation-sub/mural/runtime'],
    ['BeginStoryboardAction',  '@visualisation-sub/mural/runtime'],
    ['InvokeCommandAction',    '@visualisation-sub/mural/runtime'],
    ['StopStoryboardAction',   '@visualisation-sub/mural/runtime'],
    ['PauseStoryboardAction',  '@visualisation-sub/mural/runtime'],
    ['ResumeStoryboardAction', '@visualisation-sub/mural/runtime'],
    ['Storyboard',             '@visualisation-sub/mural/runtime'],
    ['DoubleAnimation',        '@visualisation-sub/mural/runtime'],
    ['ColorAnimation',         '@visualisation-sub/mural/runtime'],
    ['ThicknessAnimation',     '@visualisation-sub/mural/runtime'],
    ['Binding',             '@visualisation-sub/mural/runtime'],
    ['BindingMode',         '@visualisation-sub/mural/runtime'],
    ['DynamicResource',     '@visualisation-sub/mural/runtime'],
    ['DataContextBinding',  '@visualisation-sub/mural/runtime'],
    ['ElementNameBinding',  '@visualisation-sub/mural/runtime'],
    ['MultiBinding',        '@visualisation-sub/mural/runtime'],
    ['TemplateBinding',     '@visualisation-sub/mural/runtime'],
    ['MultiTrigger',        '@visualisation-sub/mural/runtime'],
    ['DataTrigger',         '@visualisation-sub/mural/runtime'],
    ['HorizontalAlignment', '@visualisation-sub/mural/runtime'],
    ['VerticalAlignment',   '@visualisation-sub/mural/runtime'],
    ['Point',               '@visualisation-sub/mural/runtime'],
    ['Size',                '@visualisation-sub/mural/runtime'],
    ['Rect',                '@visualisation-sub/mural/runtime'],
    ['Color',               '@visualisation-sub/mural/runtime'],
    ['Matrix',              '@visualisation-sub/mural/runtime'],
    ['Thickness',           '@visualisation-sub/mural/runtime'],
    ['DataObject',          '@visualisation-sub/mural/runtime'],
    ['DragDropEffects',     '@visualisation-sub/mural/runtime'],
    ['DragDrop',            '@visualisation-sub/mural/runtime'],

    // ── Controls ────────────────────────────────────────────────────
    ['Border',                  '@visualisation-sub/mural/Controls'],
    ['Button',                  '@visualisation-sub/mural/Controls'],
    ['ClickMode',               '@visualisation-sub/mural/Controls'],
    ['TextBlock',               '@visualisation-sub/mural/Controls'],
    ['Canvas',                  '@visualisation-sub/mural/Controls'],
    ['Ellipse',                 '@visualisation-sub/mural/Controls'],
    ['Line',                    '@visualisation-sub/mural/Controls'],
    ['ComboBox',                '@visualisation-sub/mural/Controls'],
    ['DockPanel',               '@visualisation-sub/mural/Controls'],
    ['Dock',                    '@visualisation-sub/mural/Controls'],
    ['Drawer',                  '@visualisation-sub/mural/Controls'],
    ['DrawerVariant',           '@visualisation-sub/mural/Controls'],
    ['TreeView',                '@visualisation-sub/mural/Controls'],
    ['TreeViewItem',            '@visualisation-sub/mural/Controls'],
    ['ListBox',                 '@visualisation-sub/mural/Controls'],
    ['ListBoxItem',             '@visualisation-sub/mural/Controls'],
    ['SelectionMode',           '@visualisation-sub/mural/Controls'],
    ['TextBox',                 '@visualisation-sub/mural/Controls'],
    ['SpinEdit',                '@visualisation-sub/mural/Controls'],
    ['Slider',                  '@visualisation-sub/mural/Controls'],
    ['PageView',                '@visualisation-sub/mural/Controls'],

    // Runtime types that the emitter may reference even when the
    // consumer's source doesn't name them directly — added on demand
    // by the emit pass.
    ['NameScope',               '@visualisation-sub/mural/runtime'],
    ['StackPanel',              '@visualisation-sub/mural/Controls'],
    ['UniformGrid',             '@visualisation-sub/mural/Controls'],
    ['Orientation',             '@visualisation-sub/mural/Controls'],
    ['ContentControl',          '@visualisation-sub/mural/Controls'],
    ['ContentPresenter',        '@visualisation-sub/mural/Controls'],
    ['DiagramNode',             '@visualisation-sub/mural/Controls'],
    ['Diagram',                 '@visualisation-sub/mural/Controls'],
    ['Grid',                    '@visualisation-sub/mural/Controls'],
    ['GridLength',              '@visualisation-sub/mural/Controls'],
    ['ColumnDefinition',        '@visualisation-sub/mural/Controls'],
    ['RowDefinition',           '@visualisation-sub/mural/Controls'],
    ['ControlTemplate',         '@visualisation-sub/mural/Controls'],
    ['DataTemplate',            '@visualisation-sub/mural/Controls'],
    ['TargetedSetter',          '@visualisation-sub/mural/Controls'],
    ['TemplatePropertyTrigger', '@visualisation-sub/mural/Controls'],
    ['TemplateDataTrigger',     '@visualisation-sub/mural/Controls'],
    ['ItemsControl',            '@visualisation-sub/mural/Controls'],
    ['ListReorderBehavior',     '@visualisation-sub/mural/Controls'],
    ['Selector',                '@visualisation-sub/mural/Controls'],
    ['ItemContainerGenerator',  '@visualisation-sub/mural/Controls'],
    ['ItemsPresenter',          '@visualisation-sub/mural/Controls'],
    ['HierarchicalDataTemplate','@visualisation-sub/mural/Controls'],
    ['ItemsPanelTemplate',      '@visualisation-sub/mural/Controls'],
    ['CollectionView',          '@visualisation-sub/mural/Controls'],
    ['SortDescription',         '@visualisation-sub/mural/Controls'],
    ['GroupDescription',        '@visualisation-sub/mural/Controls'],
    ['ScrollViewer',            '@visualisation-sub/mural/Controls'],
    ['ScrollBar',               '@visualisation-sub/mural/Controls'],
    ['VirtualizingPanel',       '@visualisation-sub/mural/Controls'],
    ['VirtualizingStackPanel',  '@visualisation-sub/mural/Controls'],
    ['TextWrapping',            '@visualisation-sub/mural/Controls'],

    // ── Internal helper classes ────────────────────────────────────
    // Layout / behaviour primitives owned by individual controls but
    // exported from their files (and re-exported from the Controls
    // barrel) so the controls' bundled `.template.mu` defaults can
    // reference them by name. Registered here as well so the LSP /
    // analyzer accepts them when an in-tree template is opened — the
    // build-control-templates script overrides these entries with
    // direct relative file paths at compile time.
    ['ClickableBorder',         '@visualisation-sub/mural/Controls'],
    ['ClickAwayScrim',          '@visualisation-sub/mural/Controls'],
    ['SplitRow',                '@visualisation-sub/mural/Controls'],
    ['ComboBoxPopupHost',       '@visualisation-sub/mural/Controls'],
    ['ComboBoxItemList',        '@visualisation-sub/mural/Controls'],
    ['ScrimSurface',            '@visualisation-sub/mural/Controls'],
    ['TemporaryOverlayHost',    '@visualisation-sub/mural/Controls'],
    ['ClickableRow',            '@visualisation-sub/mural/Controls'],
    ['ChevronTarget',           '@visualisation-sub/mural/Controls'],
    ['CollapsibleStack',        '@visualisation-sub/mural/Controls'],
    ['ScrollBarLayout',         '@visualisation-sub/mural/Controls'],
    ['SliderLayout',            '@visualisation-sub/mural/Controls'],
    ['TextEditorSurface',       '@visualisation-sub/mural/Controls'],

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

// Enum class name → set of valid PascalCase members. Used by the
// emitter to decide whether to emit `Orientation.Vertical` (when the
// property name happens to match an enum class) AND to validate the
// member name. An ident in enum position that isn't in the member set
// is a compile error — silently emitting `Orientation.foo` would
// resolve to `undefined` at runtime and cascade into NaN through any
// layout math that touches the value.
//
// All runtime enums listed here MUST also appear in DEFAULT_SYMBOLS so
// the emitter can pull them in via an import. The member sets MUST
// stay in sync with the runtime declarations (src/runtime/visual.ts,
// src/visual-engine/*, src/Controls/*) — there's no compile-time link
// between this table and the actual enum declarations, so adding a
// member to the runtime without updating this table makes the new
// member unusable from markup until the table is updated.
export const ENUM_MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map<string, ReadonlySet<string>>([
    ['HorizontalAlignment',   new Set(['Left', 'Center', 'Right', 'Stretch'])],
    ['VerticalAlignment',     new Set(['Top', 'Center', 'Bottom', 'Stretch'])],
    ['FontWeight',            new Set(['Normal', 'Bold'])],
    ['FontStyle',             new Set(['Normal', 'Italic'])],
    ['Stretch',               new Set(['None', 'Fill', 'Uniform', 'UniformToFill'])],
    ['AlignmentX',            new Set(['Left', 'Center', 'Right'])],
    ['AlignmentY',            new Set(['Top', 'Center', 'Bottom'])],
    ['BindingMode',           new Set(['OneWay', 'TwoWay', 'OneTime', 'OneWayToSource'])],
    ['GradientSpreadMethod',  new Set(['Pad', 'Reflect', 'Repeat'])],
    ['LineCap',               new Set(['Flat', 'Round', 'Square'])],
    ['LineJoin',              new Set(['Miter', 'Round', 'Bevel'])],
    ['FillRule',              new Set(['EvenOdd', 'Nonzero'])],
    ['SweepDirection',        new Set(['Counterclockwise', 'Clockwise'])],
    ['TextWrapping',          new Set(['NoWrap', 'Wrap'])],
    ['ClickMode',             new Set(['Release', 'Press', 'Hover'])],
    ['Orientation',           new Set(['Vertical', 'Horizontal'])],
    ['SelectionMode',         new Set(['Single', 'Multiple', 'Extended'])],
    ['Dock',                  new Set(['Left', 'Top', 'Right', 'Bottom'])],
    ['DrawerVariant',         new Set(['Permanent', 'Persistent', 'Temporary'])],
]);

// Property-name → enum class. Used when the markup property name does
// not equal the enum class name (`Variant: DrawerVariant`,
// `Anchor: Dock`, …). The compiler consults this map before falling
// through to "unresolved identifier" — that way a markup author
// writing `Variant=Persistent` gets the same strict member-validation
// a `HorizontalAlignment=Center` site does.
//
// Entries here MUST point at an enum class that's also in ENUM_MEMBERS.
export const PROPERTY_TO_ENUM: ReadonlyMap<string, string> = new Map<string, string>([
    ['Variant', 'DrawerVariant'],
    ['Anchor',  'Dock'],
]);

// Meta-attr names whose RHS is a type reference (compiled as a bare
// class name, not a string). Used by resource forms.
export const TYPE_REF_META_ATTRS: ReadonlySet<string> = new Set([
    'TargetType',
    'DataType',
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
    ['UniformGrid',             { name: 'Children', kind: 'list'   }],
    ['Grid',                    { name: 'Children', kind: 'list'   }],
    ['DockPanel',               { name: 'Children', kind: 'list'   }],
    ['Drawer',                  { name: 'Content',  kind: 'object' }],
    ['TreeView',                { name: 'Items',    kind: 'list'   }],
    ['TreeViewItem',            { name: 'Items',    kind: 'list'   }],
    ['ListBox',                 { name: 'Items',    kind: 'list'   }],
    ['ListBoxItem',             { name: 'Content',  kind: 'object' }],
    ['TextBox',                 { name: 'Text',     kind: 'string' }],
    ['PageView',                { name: 'Content',  kind: 'object' }],
    ['ContentControl',          { name: 'Content',  kind: 'object' }],
    ['ContentPresenter',        { name: 'Content',  kind: 'object' }],
    ['DiagramNode',             { name: 'Content',  kind: 'object' }],
    ['ItemsControl',            { name: 'Items',    kind: 'list'   }],
    ['Selector',                { name: 'Items',    kind: 'list'   }],
    ['Diagram',                 { name: 'Items',    kind: 'list'   }],
    ['VirtualizingStackPanel',  { name: 'Children', kind: 'list'   }],
    ['ScrollViewer',            { name: 'Content',  kind: 'object' }],

    // Internal helper classes (see DEFAULT_SYMBOLS comment above).
    ['ClickableBorder',         { name: 'Child',    kind: 'single' }],
    ['ClickAwayScrim',          { name: 'Child',    kind: 'single' }],
    ['SplitRow',                { name: 'Children', kind: 'list'   }],
    ['ComboBoxPopupHost',       { name: 'Children', kind: 'list'   }],
    ['ScrimSurface',            { name: 'Child',    kind: 'single' }],
    ['TemporaryOverlayHost',    { name: 'Children', kind: 'list'   }],
    ['ClickableRow',            { name: 'Child',    kind: 'single' }],
    ['ChevronTarget',           { name: 'Child',    kind: 'single' }],
    ['CollapsibleStack',        { name: 'Children', kind: 'list'   }],
    ['ScrollBarLayout',         { name: 'Children', kind: 'list'   }],
    ['SliderLayout',            { name: 'Children', kind: 'list'   }],
    ['TextEditorSurface',       { name: 'Children', kind: 'list'   }],
]);
