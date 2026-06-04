import type { SourceSpan } from './tokens.js';

// AST for µ-mural. Pure data — no methods, no behaviour. Built by
// `parser.ts` and consumed by `bind.ts` / `emit.ts` in later phases.
//
// Discriminated union conventions:
//   * Every node has a `kind: '<tag>'` field.
//   * Every node has a `span: SourceSpan` for diagnostics. (Internal
//     nodes get the span covering their full extent; atomic value
//     nodes carry the span of their literal token.)
//   * Lists of children are arrays, never linked lists.

// ── Top-level document ─────────────────────────────────────────────

export interface Document
{
    kind: 'document';
    forms: TopForm[];
    span:  SourceSpan;
}

export type TopForm = ImportForm | DefForm | ElementNode | ResourceForm;

export interface ImportForm
{
    kind:   'import';
    name:   string;            // identifier after `import`
    source: string | null;     // `from "path"` literal, or null when omitted
    span:   SourceSpan;
}

// ── Element ────────────────────────────────────────────────────────

export interface ElementNode
{
    kind:   'element';
    name:   string;            // Border, TextBlock, Application, …
    /** Scope-extension attributes (`x:key="…"`, `x:root`, …) — written
     *  BEFORE the `[ … ]` block, between the element name and the
     *  attribute list. Kept in a dedicated field so the syntactic
     *  split between extensions and properties is preserved in the
     *  AST and downstream consumers don't have to filter `attrs` to
     *  find them. */
    xAttrs: XAttr[];
    /** Named + positional property assignments from the `[ … ]` block.
     *  XAttrs are NOT included here — the parser rejects `x:foo` in
     *  bracket position. */
    attrs:  Attribute[];
    body:   BodyNode | null;
    span:   SourceSpan;
}

export type Attribute = NamedAttr | PositionalAttr;

export interface NamedAttr
{
    kind:  'named-attr';
    path:  AttrPath;
    value: ValueNode;
    span:  SourceSpan;
}

// `Background` → parts=['Background']
// `Canvas.Left` → parts=['Canvas', 'Left']  (attached property)
// Always 1 or 2 parts; deeper paths are a static error at bind time.
export interface AttrPath
{
    kind:  'attr-path';
    parts: string[];
    span:  SourceSpan;
}

export interface PositionalAttr
{
    kind:  'positional-attr';
    value: ValueNode;
    span:  SourceSpan;
}

// `x:foo = value` (or `x:foo` flag-style with no value).
export interface XAttr
{
    kind:  'x-attr';
    name:  string;             // extension name after `x:`
    value: ValueNode | null;   // null for flag-style (`x:root`)
    span:  SourceSpan;
}

// ── Body content ───────────────────────────────────────────────────

export type BodyNode = StringBody | StructuredBody;

// Text-mode body — only for string-typed slots (e.g. TextBlock.Text).
// `chunks` is a mixed sequence of literal text runs and inline-expression
// holes (`{{ … }}`). When every chunk is text the compiler lowers to a
// plain string; when an `InlineExprValue` chunk is present the slot
// becomes a computed binding (constant-folded if the expression has no
// reactive references, MultiBinding otherwise).
export interface StringBody
{
    kind:   'string-body';
    chunks: StringBodyChunk[];
    span:   SourceSpan;
}

export type StringBodyChunk = TextChunk | InlineExprValue;

export interface TextChunk
{
    kind: 'text-chunk';
    text: string;
}

// Structured body — element list + optional slot assignments + optional
// resource entries (when this is a ResourceDictionary body).
export interface StructuredBody
{
    kind:  'structured-body';
    items: BodyItem[];
    span:  SourceSpan;
}

export type BodyItem =
    | ElementNode
    | SlotAssign
    | KeyValueResource
    | ResourceForm
    | DefForm
    | MacroHoleBodyItem;

// `#1` (or `#bg`, …) appearing as a body item — only meaningful inside
// a `def` body, where it's replaced at expansion time with the items
// the caller passed as the macro's content body. The parser emits this
// shape whenever a HashBody token shows up in body position; the bind
// pass errors if the macro hole is unbound or if the surrounding
// element isn't actually a macro expansion.
export interface MacroHoleBodyItem
{
    kind: 'macro-hole-body-item';
    name: string;
    span: SourceSpan;
}

export interface SlotAssign
{
    kind:  'slot-assign';
    name:  string;
    // `Name: <plain value>`        — primitive / ident / @key / binding-expr
    // `Name: { <body> }`           — structured (used for `resources: { … }`)
    // `Name: <template> { … }`     — inline template (Template / DataTemplate
    //                                / HierarchicalDataTemplate /
    //                                ItemsPanelTemplate). The compiler emits
    //                                an anonymous template construction at
    //                                the assignment site.
    value: ValueNode | StructuredBody | ResourceForm;
    span:  SourceSpan;
}

// `@primary = #4caf50` or `@key:primary = #4caf50` — primitive resource.
// `key` is what consumers look up by; `name` is the source identifier
// (defaults to the same when no override is given).
export interface KeyValueResource
{
    kind: 'key-value-resource';
    key:  string;
    name: string;
    value: ValueNode;
    span: SourceSpan;
}

// ── Resource forms (Style, Template, DataTemplate, HierarchicalDataTemplate,
//                    ItemsPanelTemplate) ───────────────────────────────────

export interface ResourceForm
{
    kind:      'resource-form';
    keyword:   'Style' | 'Template' | 'DataTemplate' | 'HierarchicalDataTemplate' | 'ItemsPanelTemplate';
    metaAttrs: NamedAttr[];        // targettype, datatype, itemsselector, basedon, …
    xAttrs:    XAttr[];            // x:key, future x:* meta
    body:      SetterList | ElementNode | DataTemplateBody;
    span:      SourceSpan;
}

// Body of a DataTemplate / HierarchicalDataTemplate that carries
// triggers alongside its single root element. Triggers fire against
// the realized subtree at Apply time; their setters can target named
// descendants via `Name.Property = value` LHS.
export interface DataTemplateBody
{
    kind:          'data-template-body';
    root:          ElementNode;
    triggers:      TriggerGroup[];
    eventTriggers: EventTriggerGroup[];
    span:          SourceSpan;
}

export interface SetterList
{
    kind:  'setter-list';
    items: SetterItem[];
    span:  SourceSpan;
}

export type SetterItem = PropertySetter | TriggerGroup | EventTriggerGroup;

// Routed-event trigger inside a style block. Lowered to runtime
// EventTrigger + TriggerAction wiring at emit. Body is a sequence of
// trigger-action declarations — currently `BeginStoryboard { … }` is
// the only supported shape.
//
// Authoring shape:
//   on Click { BeginStoryboard { DoubleAnimation[…] } }
export interface EventTriggerGroup
{
    kind:      'event-trigger';
    eventName: string;
    actions:   TriggerActionNode[];
    span:      SourceSpan;
}

// Discriminated union covering every trigger-action shape. BeginStoryboard
// builds + starts a fresh Storyboard each fire (optionally registering
// it under a Name); the Stop / Pause / Resume variants reference a
// previously-named storyboard.
export type TriggerActionNode =
    | BeginStoryboardNode
    | StopStoryboardNode
    | PauseStoryboardNode
    | ResumeStoryboardNode
    | InvokeCommandNode;

// `BeginStoryboard [Name="fade"] { Animation[…] Animation[…] }` — bundles
// the inner animations into a single runtime Storyboard. Each animation
// declares its TargetProperty inline; the target Visual is implicit
// (the firing Visual at trigger time). When `name` is set, the firing
// Visual stores the Storyboard under that name so Stop / Pause /
// ResumeStoryboard can reference it later.
export interface BeginStoryboardNode
{
    kind:       'begin-storyboard';
    name:       string | undefined;
    animations: AnimationDecl[];
    span:       SourceSpan;
}

// `StopStoryboard [Name="fade"]` — references a previously-named
// BeginStoryboardAction on the firing Visual. No body.
export interface StopStoryboardNode
{
    kind: 'stop-storyboard';
    name: string;
    span: SourceSpan;
}

export interface PauseStoryboardNode
{
    kind: 'pause-storyboard';
    name: string;
    span: SourceSpan;
}

export interface ResumeStoryboardNode
{
    kind: 'resume-storyboard';
    name: string;
    span: SourceSpan;
}

// `InvokeCommand [Command=$SaveCommand]` — fires an ICommand at trigger
// time, passing the routed-event args as the command parameter.
// Authoring shape:
//   on Click   { InvokeCommand[Command=$SaveCommand] }
//   on Drop    { InvokeCommand[Command=$DropCommand] }
//   on KeyDown { InvokeCommand[Command=$KeyCommand] }
// The `command` attribute is the only supported attr — it MUST be an
// inline-expression resolving to an ICommand on the firing Visual's
// DataContext (typically a RelayCommand DP on the VM).
export interface InvokeCommandNode
{
    kind:    'invoke-command';
    command: ValueNode;          // expected: inline-expr to an ICommand
    span:    SourceSpan;
}

// `Ident [attr=value, …]` for animation timeline construction. The
// attribute list is identical to ElementNode.attrs in shape; the emitter
// special-cases TargetProperty (extracted as the Storyboard.Add propName,
// NOT passed to the animation constructor).
export interface AnimationDecl
{
    kind:      'animation-decl';
    className: string;            // 'DoubleAnimation' / 'ColorAnimation' / …
    attrs:     Attribute[];
    span:      SourceSpan;
}

export interface PropertySetter
{
    kind:  'property-setter';
    path:  AttrPath;
    value: ValueNode;
    span:  SourceSpan;
}

export interface TriggerGroup
{
    kind:      'trigger-group';
    condition: TriggerExpr;
    setters:   SetterList;
    span:      SourceSpan;
}

export type TriggerExpr =
    | TriggerTerm
    | TriggerAnd
    | TriggerOr;

export interface TriggerTerm
{
    kind:     'trigger-term';
    negated:  boolean;
    // Property name on the styled target (PropertyTrigger form,
    // `when( IsMouseOver )`). Mutually exclusive with `path`.
    property: string | undefined;
    // DataContext-relative dotted path (DataTrigger form,
    // `when( $IsSelected )` / `when( $foo.bar )`). Mutually exclusive
    // with `property`.
    path:     string | undefined;
    value:    ValueNode | null;     // null means implicit `= true`
    span:     SourceSpan;
}

export interface TriggerAnd
{
    kind: 'trigger-and';
    left: TriggerExpr;
    right: TriggerExpr;
    span: SourceSpan;
}

export interface TriggerOr
{
    kind: 'trigger-or';
    left: TriggerExpr;
    right: TriggerExpr;
    span: SourceSpan;
}

// ── Macros ─────────────────────────────────────────────────────────

export interface DefForm
{
    kind:   'def';
    name:   string;
    params: MacroParam[];
    body:   ElementNode;
    span:   SourceSpan;
}

export interface MacroParam
{
    kind:        'macro-param';
    holeName:    string;          // for #1 → "1"; for #bg → "bg"
    positional:  boolean;
    typeRef:     string | null;
    defaultValue: ValueNode | null;
    span:        SourceSpan;
}

// ── Values ─────────────────────────────────────────────────────────

export type ValueNode =
    | NumberValue
    | StringValue
    | IdentValue
    | ColorValue
    | TupleValue
    | SizeValue
    | ListValue
    | BindingValue
    | TemplateBindingValue
    | StaticResourceValue
    | DynamicResourceValue
    | MacroHoleValue
    | InlineExprValue
    | FlagValue;

export interface NumberValue { kind: 'number';  raw: string;        span: SourceSpan; }
export interface StringValue { kind: 'string';  value: string;       span: SourceSpan; }
// Bare identifier in a value position — enum value (Vertical, Bold,
// left), type reference (Button as targettype), named flag. The bind
// pass interprets by context (slot type, surrounding form).
export interface IdentValue  { kind: 'ident';   name: string;        span: SourceSpan; }
// `#blue` → raw='blue'; `#0d47a1` → raw='0d47a1'. The bind pass
// distinguishes by inspecting the body.
export interface ColorValue  { kind: 'color';   raw: string;         span: SourceSpan; }
export interface TupleValue  { kind: 'tuple';   values: ValueNode[]; span: SourceSpan; }
export interface SizeValue   { kind: 'size';    width: ValueNode;
                                                height: ValueNode;   span: SourceSpan; }
export interface ListValue   { kind: 'list';    values: ValueNode[]; span: SourceSpan; }
export interface BindingValue          { kind: 'binding';            path: string[];   span: SourceSpan; }
export interface TemplateBindingValue  { kind: 'template-binding';   name: string;     span: SourceSpan; }
// `@Key` → key='Key', dynamic=false.  `@@Key` → dynamic=true.
export interface StaticResourceValue   { kind: 'static-resource';    key: string;      span: SourceSpan; }
export interface DynamicResourceValue  { kind: 'dynamic-resource';   key: string;      span: SourceSpan; }
// `#1` (positional) or `#bg` (named) inside a macro body.
export interface MacroHoleValue        { kind: 'macro-hole';         name: string;     span: SourceSpan; }
// `$( … )$` — raw expression text; parsing deferred to a later phase.
export interface InlineExprValue       { kind: 'inline-expr';        raw: string;      span: SourceSpan; }
// `x:root` with no value — placeholder for "set this flag."
export interface FlagValue             { kind: 'flag';                                  span: SourceSpan; }
