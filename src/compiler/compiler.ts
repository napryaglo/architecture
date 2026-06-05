import type {
    AnimationDecl,
    Attribute,
    AttrPath,
    BeginStoryboardNode,
    BodyItem,
    InvokeCommandNode,
    PauseStoryboardNode,
    ResumeStoryboardNode,
    StopStoryboardNode,
    ColorValue,
    DefForm,
    Document,
    ElementNode,
    EventTriggerGroup,
    IdentValue,
    InlineExprValue,
    KeyValueResource,
    PropertySetter,
    ResourceForm,
    SlotAssign,
    StringBody,
    StructuredBody,
    TriggerActionNode,
    TriggerExpr,
    TriggerGroup,
    TupleValue,
    ValueNode,
    XAttr,
} from './ast.js';
import {
    lowerInlineExpr,
    lowerInlineExprWithPaths,
    InlineExprError,
} from './inline-expr.js';

// Format a JS value as a literal expression string for emission. JSON
// covers numbers, strings, booleans, null, arrays, and plain objects;
// the special-cases below handle the few values JSON.stringify
// mis-renders (or refuses to round-trip).
function formatJsLiteral(value: unknown, span: SourceSpan): string
{
    if (value === undefined)               return 'undefined';
    if (typeof value === 'number')
    {
        if (Number.isNaN(value))           return 'NaN';
        if (value === Infinity)            return 'Infinity';
        if (value === -Infinity)           return '-Infinity';
    }
    try { return JSON.stringify(value); }
    catch
    {
        throw new EmitError(
            `inline expression evaluated to a non-serialisable value of type ${typeof value}`,
            span);
    }
}
// Local shape — a flattened disjunct from `flattenOr()`. Reduces a
// TriggerOr / TriggerTerm tree into a list of (property | path, value,
// negated) records. Single-term conjuncts emit as PropertyTrigger or
// DataTrigger depending on which of property / path is set. Multi-term
// conjuncts emit as MultiTrigger (PropertyTrigger-only — mixing
// data-paths in is a follow-up).
interface TriggerTermLite
{
    property: string | undefined;
    path:     string | undefined;
    value:    ValueNode | null;
    negated:  boolean;
    span:     SourceSpan;
}

// Macro substitution map. A hole is bound either to a ValueNode (named
// parameter, substituted in value positions like `Background=#bg`) or
// to a list of BodyItems (positional `#1` content slot, substituted
// where the macro body says `#1` as a body item).
type MacroSubst = Map<
    string,
    | { kind: 'value'; value: ValueNode }
    | { kind: 'body';  items: BodyItem[] }
>;
import {
    DEFAULT_SYMBOLS,
    DEFAULT_SLOT_INFO,
    ENUM_MEMBERS,
    PROPERTY_TO_ENUM,
    type SymbolMap,
    type SlotInfo,
} from './symbol-table.js';
import type { SourceSpan } from './tokens.js';

// Lifted to top level so callers can `instanceof EmitError` without
// importing the Compiler class.
export class EmitError extends Error
{
    public readonly span: SourceSpan | undefined;
    constructor(message: string, span?: SourceSpan)
    {
        const suffix = span
            ? ` (at ${span.start.line}:${span.start.column})`
            : '';
        super(message + suffix);
        this.span = span;
    }
}

export interface CompilerOptions
{
    /** Override or augment the default name → module map. */
    symbols?: SymbolMap;
    /** Override or augment the default per-control slot info. */
    slots?:   ReadonlyMap<string, SlotInfo>;
}

export interface CompilerOutput
{
    /** JS source — the body of the IIFE / factory (no imports). */
    body:           string;
    /** Module → set of symbol names that should be imported. */
    imports:        Map<string, Set<string>>;
    /** True when the root form is `Application{…}` and the export shape
     *  is an eager `export const app`. False for fragment factories. */
    isApplication:  boolean;
    /** Suggested export name — 'app' for Applications, 'create' for fragments. */
    exportName:     'app' | 'create';
}

// ── Internal value-emission context ─────────────────────────────────

interface ValueCtx
{
    /** The unqualified property name being assigned (used to pick an
     *  enum class on PascalIdent values, etc.). */
    propertyName?: string;
    /** The JS expression that holds the target Visual; non-undefined
     *  means we're in a direct-attribute context (DynamicResource can
     *  bind to this target). Undefined means we're inside a Style
     *  setter and need a per-target SetterFactory wrap. */
    targetExpr?: string;
}

// Visits the AST and produces JS source. Single-pass; bind and emit
// happen together. State carried on the instance: import set, output
// buffer, fresh-var counter. One Compiler instance per source file —
// state is not designed to be reused across compiles.
export class Compiler
{
    private readonly symbols: SymbolMap;
    private readonly slots:   ReadonlyMap<string, SlotInfo>;
    private readonly imports: Map<string, Set<string>> = new Map();
    private readonly lines:   string[] = [];
    // Macros collected during Compile() — keyed by macro name. Lookup
    // happens in compileElement before normal class-name dispatch, so
    // macros shadow controls of the same name.
    private macros: Map<string, DefForm> = new Map();
    private varCounter = 0;
    // Variable name of the element that owns the active NameScope —
    // populated when an element carries `x:root` and consumed by every
    // x:name'd descendant to emit a Register() call. NameScopes are
    // emitter-time bookkeeping; the runtime side already supports
    // multi-scope lookups (templates have their own), so this is
    // intentionally limited to the single application-root scope.
    private nameScopeOwnerVar: string | undefined;
    // Inside a DataTemplate body these track x:names declared on
    // descendants of the template root: `templateNameScope` is the
    // set of registered names, and `templateNameOwners` maps each to
    // the element's runtime class. Used by `when()` setter lowering
    // to route `targetName.Property = value` through TargetedSetter
    // instead of treating the first segment as an attached-property
    // owner type. Reset to undefined when not inside a DataTemplate
    // body so Style-side setter compilation is unaffected.
    private templateNameScope:  Set<string>           | undefined;
    private templateNameOwners: Map<string, string>   | undefined;
    // x:name → emitted variable name. Distinct from templateNameOwners
    // (which maps name → element type, used for setter type-checking).
    // Consulted by the `$binding` lowering to detect ElementName-style
    // bindings: when the first path segment matches an entry here, the
    // binding source becomes the named element directly rather than the
    // target's DataContext. The map is populated as elements are emitted
    // in source order — a forward reference (`$foo.Prop` before
    // `Border x:name="foo"`) won't match and falls through to the
    // DataContext path, matching the natural top-down read order of
    // markup.
    private templateNameVars:   Map<string, string>   | undefined;
    // Current indent prefix (multiples of 4 spaces) — incremented when
    // we open a nested scope (template factory body, future macro
    // expansions, etc.), decremented at close. Cosmetic for the emitted
    // JS; the JS engine ignores leading whitespace.
    private indent = 0;
    // Tracks whether we're currently inside a template factory body
    // (ControlTemplate or DataTemplate). The `$$Property` sigil
    // (TemplateBinding) is only valid when this is true; the emitted
    // factory closes over `_templatedParent` which the binding
    // references.
    private inTemplateBody = false;

    constructor(opts: CompilerOptions = {})
    {
        // Per-compilation copy — `import Name from "path"` directives at
        // the top of a .mu source extend THIS map only, so user-defined
        // types declared in one file don't leak into the next file
        // compiled by another Compiler instance.
        this.symbols = new Map(opts.symbols ?? DEFAULT_SYMBOLS);
        this.slots   = opts.slots ?? DEFAULT_SLOT_INFO;
    }

    public Compile(doc: Document): CompilerOutput
    {
        // Pass 0: ingest top-level `import Name from "path"` directives
        // into the per-compilation symbol table. After this pass, any
        // `ensureImport(Name)` call resolves Name through the same
        // path the .mu source declared, so user-defined VM / DTO
        // classes are first-class type references — `[DataType=NodeVM]`
        // and `[TargetType=MyCustomBorder]` produce real Function
        // identifiers, not strings, end-to-end.
        for (const form of doc.forms)
        {
            if (form.kind !== 'import') continue;
            if (form.source === null)
            {
                throw new EmitError(
                    `import '${form.name}' requires \`from "path"\` — bare imports are reserved and not supported`,
                    form.span);
            }
            const existing = this.symbols.get(form.name);
            if (existing !== undefined && existing !== form.source)
            {
                throw new EmitError(
                    `import '${form.name}' conflicts with an existing symbol bound to '${existing}'`,
                    form.span);
            }
            this.symbols.set(form.name, form.source);
        }

        // Pass 1: collect every top-level `def` form into the macro
        // table. Macros can call each other so this is a flat pre-walk
        // before any emit happens.
        for (const form of doc.forms)
        {
            if (form.kind === 'def')
            {
                if (this.macros.has(form.name))
                {
                    throw new EmitError(
                        `duplicate macro '${form.name}'`, form.span);
                }
                this.macros.set(form.name, form);
            }
        }

        // Pass 2: locate the single root element. Bare top-level
        // resource forms (`Template`, `Style`, `DataTemplate`) are
        // rejected — author them inside an explicit
        // `ResourceDictionary { … }` element so the dictionary wrapper
        // is visible in the source (matches the WPF
        // `<ResourceDictionary>` authoring pattern). imports are
        // silently ignored.
        let root: ElementNode | undefined;
        for (const form of doc.forms)
        {
            if (form.kind === 'element')
            {
                if (root !== undefined)
                {
                    throw new EmitError(
                        'compile: more than one top-level element form', form.span);
                }
                root = form;
            }
            else if (form.kind === 'resource-form')
            {
                throw new EmitError(
                    `compile: top-level '${form.keyword}' is not allowed — ` +
                    `wrap it inside an explicit \`ResourceDictionary { … }\` element ` +
                    `so the dictionary wrapper appears in the source.`,
                    form.span);
            }
            // import / def silently consumed.
        }

        if (root === undefined)
        {
            throw new EmitError(
                'compile: source has no top-level element to emit', doc.span);
        }

        // Three recognised top-level roots: Application (with a
        // resources slot), ResourceDictionary (bare dictionary that
        // emits a factory), or a plain Visual (fragment).
        const isApp = (root.name === 'Application');
        const isRD  = (root.name === 'ResourceDictionary');
        if (isRD)
        {
            const rdVar = this.compileResourceDictionaryRoot(root);
            this.line(`return ${rdVar};`);
            return {
                body:          this.lines.join('\n'),
                imports:       this.imports,
                isApplication: false,
                exportName:    'create',
            };
        }
        const rootVar = isApp
            ? this.compileApplication(root)
            : this.compileElement(root);
        this.line(`return ${rootVar};`);

        return {
            body:          this.lines.join('\n'),
            imports:       this.imports,
            isApplication: isApp,
            exportName:    isApp ? 'app' : 'create',
        };
    }

    // ── ResourceDictionary root ─────────────────────────────────────
    //
    // `ResourceDictionary { template x:key="…"[TargetType=…]{ … } … }`
    // emits a `create()` factory returning a populated ResourceDictionary.
    // Body items are the same shape the `resources:` slot of an
    // Application accepts: keyed key-value resources (`@name = value`),
    // resource forms (`Template` / `Style` / `DataTemplate`), or x:key /
    // x:root-marked element entries.
    private compileResourceDictionaryRoot(elem: ElementNode): string
    {
        if (elem.attrs.length > 0)
        {
            throw new EmitError(
                'ResourceDictionary: attributes are not supported at the root ' +
                '(only a body block of resource entries)',
                elem.span);
        }
        if (elem.xAttrs.length > 0)
        {
            throw new EmitError(
                'ResourceDictionary: x:* attributes are not supported at the root',
                elem.span);
        }
        if (elem.body === null || elem.body.kind !== 'structured-body')
        {
            throw new EmitError(
                'ResourceDictionary: expected a `{ … }` body block of resource entries',
                elem.span);
        }
        this.ensureImport('ResourceDictionary');
        const rdVar = this.fresh('rd');
        this.line(`const ${rdVar} = new ResourceDictionary();`);
        this.compileResourcesBody(rdVar, elem.body);
        return rdVar;
    }

    // ── Application root ────────────────────────────────────────────

    private compileApplication(elem: ElementNode): string
    {
        if (elem.attrs.length > 0)
        {
            throw new EmitError(
                'Application: attributes are not supported (only a body block)',
                elem.span);
        }
        if (elem.body === null || elem.body.kind !== 'structured-body')
        {
            throw new EmitError(
                'Application: expected a `{ resources: { … } }` body block',
                elem.span);
        }
        this.ensureImport('Application');
        const appVar = this.fresh('app');
        this.line(`const ${appVar} = new Application();`);

        for (const item of elem.body.items)
        {
            if (item.kind === 'slot-assign' && item.name === 'resources')
            {
                this.compileResourcesSlot(`${appVar}.Resources`, item);
                continue;
            }
            throw new EmitError(
                `Application: only the 'resources:' slot is supported in v0 ` +
                `(got ${item.kind === 'slot-assign' ? `'${item.name}:'` : item.kind})`,
                item.kind === 'slot-assign' ? item.span : elem.span);
        }
        return appVar;
    }

    // ── ResourceDictionary contents ─────────────────────────────────

    private compileResourcesSlot(rdExpr: string, slot: SlotAssign): void
    {
        if (typeof slot.value !== 'object' || !('kind' in slot.value)
            || slot.value.kind !== 'structured-body')
        {
            throw new EmitError(
                'resources: requires a body block', slot.span);
        }
        // Local handle — keeps emit short.
        const rdVar = this.fresh('rd');
        this.line(`const ${rdVar} = ${rdExpr};`);
        this.compileResourcesBody(rdVar, slot.value);
    }

    private compileResourcesBody(rdVar: string, body: StructuredBody): void
    {
        for (const item of body.items)
        {
            switch (item.kind)
            {
                case 'key-value-resource':
                    this.compileKeyValueResource(rdVar, item);
                    continue;
                case 'resource-form':
                    this.compileResourceForm(rdVar, item);
                    continue;
                case 'element':
                    this.compileResourceElement(rdVar, item);
                    continue;
                default:
                    throw new EmitError(
                        `resources: ${item.kind} is not allowed here`,
                        'span' in item ? item.span : body.span);
            }
        }
    }

    private compileKeyValueResource(rdVar: string, kv: KeyValueResource): void
    {
        const expr = this.compileValue(kv.value, {});
        this.line(`${rdVar}.Set(${JSON.stringify(kv.key)}, ${expr});`);
    }

    private compileResourceForm(rdVar: string, rf: ResourceForm): void
    {
        if (rf.keyword === 'Style')
        {
            const styleVar = this.compileStyleForm(rf);
            this.registerResourceFormVar(rdVar, rf, styleVar, /*allowImplicit*/ true);
            return;
        }
        if (rf.keyword === 'Template')
        {
            const tmplVar = this.compileControlTemplateForm(rf);
            // x:key path: registers the Template directly (no wrapping).
            const xKey = this.findXAttr(rf.xAttrs, 'key');
            if (xKey !== null)
            {
                this.registerResourceFormVar(rdVar, rf, tmplVar, /*allowImplicit*/ true);
                return;
            }
            // Implicit path: wrap the Template in a Style so Function
            // keys in the resource chain hold Styles only — same key
            // space as user-side `Style [TargetType=X]` entries and the
            // resolve_implicit_style / resolve_theme_style walkers. The
            // Style carries a single Setter that drives the matching
            // control's Template DP when the Style applies.
            //
            // `Application.ResolveDefaultResource(Klass)` now returns a
            // Style; defaultTemplate(Klass) on the runtime side reads the
            // Template setter's value to get the ControlTemplate for
            // eager constructor-time use.
            const tt = this.requireTargetType(rf);
            this.ensureImport(tt);
            this.ensureImport('Setter');
            this.ensureImport('Style');
            const setterVar = this.fresh('setter');
            const styleVar  = this.fresh('style');
            this.line(
                `const ${setterVar} = new Setter(${tt}, "Template", ${tmplVar});`);
            this.line(
                `const ${styleVar} = new Style(${tt}, [${setterVar}], undefined, [], []);`);
            this.line(`${rdVar}.Set(${tt}, ${styleVar});`);
            return;
        }
        if (rf.keyword === 'DataTemplate')
        {
            const tmplVar = this.compileDataTemplateForm(rf);
            this.registerResourceFormVar(rdVar, rf, tmplVar, /*allowImplicit*/ true);
            return;
        }
        if (rf.keyword === 'HierarchicalDataTemplate')
        {
            const tmplVar = this.compileHierarchicalDataTemplateForm(rf);
            this.registerResourceFormVar(rdVar, rf, tmplVar, /*allowImplicit*/ true);
            return;
        }
        if (rf.keyword === 'ItemsPanelTemplate')
        {
            const tmplVar = this.compileItemsPanelTemplateForm(rf);
            this.registerResourceFormVar(rdVar, rf, tmplVar, /*allowImplicit*/ false);
            return;
        }
        throw new EmitError(
            `unknown resource form '${rf.keyword}'`, rf.span);
    }

    // Helper: register a freshly-built resource (Style / Template /
    // DataTemplate) in the dictionary by x:key (string) or, when the
    // form supports implicit registration, by its type-attribute as a
    // real Function reference. The TargetType / DataType identifier
    // is `ensureImport`-ed, so user-defined VM classes used in
    // `[DataType=NodeVM]` must be brought into scope by a top-level
    // `import NodeVM from "./node-vm.mjs"` directive.
    //
    // Template / ItemsPanelTemplate stay opt-out (implicit not enabled);
    // their theme migration will land them inside Style.Setters instead.
    private registerResourceFormVar(
        rdVar: string, rf: ResourceForm, valueVar: string,
        allowImplicit: boolean,
    ): void
    {
        const xKey = this.findXAttr(rf.xAttrs, 'key');
        if (xKey !== null)
        {
            if (xKey.value === null || xKey.value.kind !== 'string')
            {
                throw new EmitError(
                    'x:key requires a string literal value', xKey.span);
            }
            this.line(
                `${rdVar}.Set(${JSON.stringify(xKey.value.value)}, ${valueVar});`);
            return;
        }
        if (!allowImplicit)
        {
            throw new EmitError(
                `${rf.keyword} without x:key is not supported (implicit ${rf.keyword} ` +
                `desugaring requires a Style.Template setter — not in v0)`,
                rf.span);
        }
        const tt = this.requireTargetType(rf);
        this.ensureImport(tt);
        this.line(`${rdVar}.Set(${tt}, ${valueVar});`);
    }

    private compileControlTemplateForm(rf: ResourceForm): string
    {
        if (rf.body.kind !== 'element')
        {
            throw new EmitError(
                'template body must be a single element', rf.span);
        }
        // TargetType is conceptually meaningful (the control class this
        // template targets), but the runtime ControlTemplate doesn't
        // carry it — it's purely a factory. We still parse and validate
        // it so authors can't omit the meta-attr.
        this.requireTargetType(rf);

        this.ensureImport('ControlTemplate');
        const tmplVar = this.fresh('tmpl');
        this.line(`const ${tmplVar} = new ControlTemplate((_templatedParent) => {`);
        this.indent += 4;
        const wasInTemplate = this.inTemplateBody;
        this.inTemplateBody = true;
        // Stash the surrounding DataTemplate's name scope (if any) so
        // x:names declared inside a nested ControlTemplate body don't
        // pollute the data-template-scope used by TargetedSetter
        // lowering above this control template.
        const savedTNS = this.templateNameScope;
        const savedTNO = this.templateNameOwners;
        const savedTNV = this.templateNameVars;
        this.templateNameScope  = undefined;
        this.templateNameOwners = undefined;
        this.templateNameVars   = undefined;
        const rootVar = this.compileElement(rf.body);
        this.templateNameScope  = savedTNS;
        this.templateNameOwners = savedTNO;
        this.templateNameVars   = savedTNV;
        this.inTemplateBody = wasInTemplate;
        this.line(`return ${rootVar};`);
        this.indent -= 4;
        this.line(`});`);
        return tmplVar;
    }

    private compileDataTemplateForm(rf: ResourceForm): string
    {
        if (rf.body.kind !== 'element' && rf.body.kind !== 'data-template-body')
        {
            throw new EmitError(
                'DataTemplate body must be a single element (optionally followed by `when()` triggers)',
                rf.span);
        }
        // `DataType=Foo` resolves to a real Function reference — the
        // identifier is `ensureImport`-ed so user-defined VM classes
        // brought in by a top-level `import Foo from "./foo-vm.mjs"`
        // are linkable end-to-end. ContentPresenter / PageView /
        // ItemsControl resolve templates via Function-identity match
        // against `content.constructor`, matching WPF's `{x:Type}`
        // shape rather than name-string lookup.
        const dataType = this.requireTargetType(rf);
        this.ensureImport(dataType);
        const rootElement = rf.body.kind === 'element' ? rf.body : rf.body.root;
        const triggers      = rf.body.kind === 'data-template-body' ? rf.body.triggers      : [];
        const eventTriggers = rf.body.kind === 'data-template-body' ? rf.body.eventTriggers : [];

        this.ensureImport('DataTemplate');
        const tmplVar = this.fresh('tmpl');
        // Open a fresh template-local name scope for this DataTemplate
        // body so x:names declared inside register here (without
        // colliding with another DataTemplate in the same file or the
        // application-root scope). Restored on the way out.
        const savedTNS         = this.templateNameScope;
        const savedTNO         = this.templateNameOwners;
        const savedTNV         = this.templateNameVars;
        const savedInTemplate  = this.inTemplateBody;
        const savedScopeOwner  = this.nameScopeOwnerVar;
        this.templateNameScope  = new Set<string>();
        this.templateNameOwners = new Map<string, string>();
        this.templateNameVars   = new Map<string, string>();
        // Mark "inside a template body" so x:name handling SKIPS the
        // per-name Register emit (Apply walks the subtree at runtime and
        // registers names into the fresh per-instance NameScope). Also
        // clear nameScopeOwnerVar — otherwise an x:name inside this
        // factory would emit Register() against whatever x:root the
        // PREVIOUS template (or the enclosing application root) had,
        // resulting in `<wrong>.nameScope.Register(...)` at runtime and
        // a ReferenceError when the variable isn't in scope.
        this.inTemplateBody    = true;
        this.nameScopeOwnerVar = undefined;
        if (triggers.length === 0 && eventTriggers.length === 0)
        {
            // Trigger-free path: preserve the historical 2-arg emit
            // shape so existing snapshot tests keep matching.
            this.line(`const ${tmplVar} = new DataTemplate((_data) => {`);
            this.indent += 4;
            const rootVar = this.compileElement(rootElement);
            this.line(`return ${rootVar};`);
            this.indent -= 4;
            this.line(`}, ${dataType});`);
        }
        else
        {
            // Triggers reference x:names declared inside the factory
            // body, so they MUST be compiled after the factory walk
            // (which populates templateNameScope) — but their `const`
            // declarations must SYNTACTICALLY precede the
            // `new DataTemplate(...)` call. Wrapping the whole
            // construction in an IIFE keeps the declaration order
            // legal while letting the factory body run first inside a
            // local scope. Adds one closure per DataTemplate; cheap.
            this.line(`const ${tmplVar} = (() => {`);
            this.indent += 4;
            this.line(`const _factory = (_data) => {`);
            this.indent += 4;
            const rootVar = this.compileElement(rootElement);
            this.line(`return ${rootVar};`);
            this.indent -= 4;
            this.line(`};`);
            const { propertyTriggers, dataTriggers } =
                this.compileDataTemplateTriggers(triggers);
            // EventTrigger lowering reuses the same compile helper the
            // Style.EventTrigger path uses — the runtime EventTrigger
            // shape is identical (RoutedEvent + Actions[]); only the
            // attach surface differs (Visual.AddEventTrigger on the
            // template root vs Style.OnApply on the styled visual).
            const eventTriggerVars: string[] = [];
            for (const et of eventTriggers)
            {
                eventTriggerVars.push(this.compileEventTriggerGroup('', et));
            }
            const propsArr  = `[${propertyTriggers.join(', ')}]`;
            const dataArr   = `[${dataTriggers.join(', ')}]`;
            // Only emit the eventTriggers argument when there's at
            // least one — keeps the 4-arg constructor call shape stable
            // for templates that only carry when()-style triggers and
            // avoids churn in existing snapshot tests.
            if (eventTriggerVars.length === 0)
            {
                this.line(
                    `return new DataTemplate(_factory, ${dataType}, ${propsArr}, ${dataArr});`);
            }
            else
            {
                const eventsArr = `[${eventTriggerVars.join(', ')}]`;
                this.line(
                    `return new DataTemplate(_factory, ${dataType}, ${propsArr}, ${dataArr}, ${eventsArr});`);
            }
            this.indent -= 4;
            this.line(`})();`);
        }
        this.templateNameScope  = savedTNS;
        this.templateNameOwners = savedTNO;
        this.templateNameVars   = savedTNV;
        this.inTemplateBody     = savedInTemplate;
        this.nameScopeOwnerVar  = savedScopeOwner;
        return tmplVar;
    }

    // Emit a TemplatePropertyTrigger / TemplateDataTrigger per `when()`
    // block in a DataTemplate body. Setter LHS resolution: when the
    // first segment matches an x:name registered in the surrounding
    // template scope, it becomes the setter's `targetName`; otherwise
    // it's an attached-property owner type (unchanged behaviour). The
    // condition itself reuses the same DNF + `evaluateTermValue`
    // pipeline as Style triggers.
    private compileDataTemplateTriggers(
        triggers: readonly TriggerGroup[],
    ): { propertyTriggers: string[]; dataTriggers: string[] }
    {
        const propertyTriggers: string[] = [];
        const dataTriggers:     string[] = [];
        for (const tg of triggers)
        {
            const disjuncts = this.flattenToDNF(tg.condition);
            if (disjuncts.length !== 1 || disjuncts[0]!.length !== 1)
            {
                throw new EmitError(
                    "DataTemplate triggers currently support only a single-term `when( … )` condition",
                    tg.span);
            }
            const term = disjuncts[0]![0]!;
            if (term.negated)
            {
                throw new EmitError(
                    "DataTemplate triggers do not support `not` — write `$path = false` instead",
                    term.span);
            }
            // Setters: each setter LHS may be `Property = …`,
            // `TargetName.Property = …`, or `Owner.Property = …`
            // (attached). The compiler routes the second form through
            // TargetedSetter; the others stay regular Setters.
            const settersArrVar = this.fresh('tplSet');
            const setterExprs:  string[] = [];
            for (const item of tg.setters.items)
            {
                if (item.kind !== 'property-setter')
                {
                    throw new EmitError(
                        "only property setters are allowed inside DataTemplate `when()` blocks",
                        item.span);
                }
                setterExprs.push(this.compileTemplateSetter(item));
            }
            this.line(`const ${settersArrVar} = [${setterExprs.join(', ')}];`);

            const valueExpr = this.evaluateTermValue(term);
            if (term.path !== undefined)
            {
                this.ensureImport('TemplateDataTrigger');
                const v = this.fresh('tplDataTrig');
                this.line(
                    `const ${v} = new TemplateDataTrigger(${JSON.stringify(term.path)}, ${valueExpr}, ${settersArrVar});`);
                dataTriggers.push(v);
            }
            else
            {
                // Property-trigger form needs an owner type to scope
                // the watched DP. The current DSL doesn't carry an
                // explicit owner on the trigger condition, so we hand
                // the runtime `undefined` for the owner — and the
                // runtime resolves the property name against the
                // source visual's own class. That mirrors how WPF's
                // Trigger.Property looks up by DependencyProperty
                // identity rather than owner-class.
                throw new EmitError(
                    "property-trigger `when( PropertyName )` inside DataTemplate bodies is not supported yet — use `when( $path )` against the data context",
                    term.span);
            }
        }
        return { propertyTriggers, dataTriggers };
    }

    // Lower one DataTemplate-body setter into either a TargetedSetter
    // (when the LHS first segment matches a registered x:name in the
    // current template scope) or a plain Setter (attached-property
    // form). Stays close in shape to compileSetter so the value-side
    // emission is reused.
    private compileTemplateSetter(item: PropertySetter): string
    {
        this.ensureImport('TargetedSetter');
        const parts = item.path.parts;
        if (parts.length === 1)
        {
            // Bare `Property = value;` — owner defaults to the template
            // root's runtime class. We can't statically know that
            // class, so emit a TargetedSetter with targetName=undefined
            // and look up the descriptor by name on the resolved
            // target at apply time. The runtime takes (owner,
            // property, value, targetName) so we still need an owner
            // class. Reject for now until the root-class inference
            // story is solid.
            throw new EmitError(
                "bare `Property = value;` in DataTemplate triggers is not supported yet — write `Owner.Property = value` (e.g. `Border.Background = …`) or `targetName.Property = value`",
                item.span);
        }
        const first  = parts[0]!;
        const second = parts[1]!;
        const valueExpr = this.compileValue(item.value, {
            propertyName: second,
            targetExpr:   undefined,
        });
        const isName = this.templateNameScope?.has(first) ?? false;
        if (isName)
        {
            // TargetedSetter(owner=undefined?  No — runtime needs an
            // owner class for descriptor lookup. We require a third
            // path segment: TargetName.OwnerClass.Property = value.
            // That's verbose. Pragmatic alternative: infer owner from
            // first segment's recorded class.
            const ownerType = this.templateNameOwners?.get(first);
            if (ownerType === undefined)
            {
                throw new EmitError(
                    `cannot resolve owner class for target '${first}' — ensure the named element is declared earlier in the template body`,
                    item.span);
            }
            this.ensureImport(ownerType);
            return `new TargetedSetter(${ownerType}, ${JSON.stringify(second)}, ${valueExpr}, ${JSON.stringify(first)})`;
        }
        // Attached-property form: `Owner.Property = value` targets the
        // template root. Same shape the Style compiler uses.
        this.ensureImport(first);
        return `new TargetedSetter(${first}, ${JSON.stringify(second)}, ${valueExpr})`;
    }

    // ── HierarchicalDataTemplate ────────────────────────────────────
    //
    // `HierarchicalDataTemplate x:key="…" [DataType=Foo, itemsselector=Bar] { … }`
    // emits a HierarchicalDataTemplate whose itemsSelector pulls `data.Bar`
    // off each parent data item, returning undefined for items without
    // that property (TreeView treats undefined-children as a leaf row).
    // Used by TreeView (and other hierarchical ItemsControls) to walk
    // a recursive data structure with one template per level.
    private compileHierarchicalDataTemplateForm(rf: ResourceForm): string
    {
        // Parser wraps both DataTemplate and HierarchicalDataTemplate
        // bodies in `data-template-body` since both can carry trailing
        // triggers. Trailing triggers aren't wired up here yet — we
        // accept the wrap but only consume the root element.
        if (rf.body.kind !== 'element' && rf.body.kind !== 'data-template-body')
        {
            throw new EmitError(
                'HierarchicalDataTemplate body must be a single element',
                rf.span);
        }
        const rootElement = rf.body.kind === 'element' ? rf.body : rf.body.root;
        const dataType = this.requireTargetType(rf);
        this.ensureImport(dataType);
        const selector = this.findIdentMetaAttr(rf, 'itemsselector');
        if (selector === undefined)
        {
            throw new EmitError(
                'HierarchicalDataTemplate requires `itemsselector=<PropertyName>` — names the children property on the data',
                rf.span);
        }

        this.ensureImport('HierarchicalDataTemplate');
        const tmplVar = this.fresh('tmpl');
        this.line(`const ${tmplVar} = new HierarchicalDataTemplate((_data) => {`);
        this.indent += 4;
        const rootVar = this.compileElement(rootElement);
        this.line(`return ${rootVar};`);
        this.indent -= 4;
        // Selector reads `data?.<selector>`. Optional chain → returns
        // undefined when the data has no children property (leaf row),
        // which HierarchicalDataTemplate.ItemsOf treats as an empty
        // iterable.
        this.line(
            `}, (data) => data?.${selector}, undefined, undefined, ${dataType});`);
        return tmplVar;
    }

    // Inline-template emission shared between the resource-form path
    // (registered in a ResourceDictionary by x:key) and the inline
    // slot-assign path (anonymous, assigned directly to a property).
    // The two paths differ only in how the produced template var is
    // consumed downstream; the construction itself is identical, so
    // this helper just dispatches to the keyword-specific compiler
    // method and returns the emitted variable name. Style is rejected
    // here — styles only ever live as keyed dictionary entries.
    private compileInlineTemplateValue(rf: ResourceForm): string
    {
        if (rf.keyword === 'Template')                  return this.compileControlTemplateForm(rf);
        if (rf.keyword === 'DataTemplate')              return this.compileDataTemplateForm(rf);
        if (rf.keyword === 'HierarchicalDataTemplate')  return this.compileHierarchicalDataTemplateForm(rf);
        if (rf.keyword === 'ItemsPanelTemplate')        return this.compileItemsPanelTemplateForm(rf);
        throw new EmitError(
            `'${rf.keyword}' is not allowed inline as a slot-assign value (only template forms are)`,
            rf.span);
    }

    // ── ItemsPanelTemplate ──────────────────────────────────────────
    //
    // `ItemsPanelTemplate x:key="…" { Panel … }` emits an
    // ItemsPanelTemplate whose Apply() produces a fresh Panel each call.
    // No required meta-attrs — the produced Visual just has to be a
    // Panel-derived class (validated at runtime by the consumer, not at
    // compile time, since the compiler doesn't track Visual subclass
    // hierarchies). Used by ItemsControl.ItemsPanel as the markup-side
    // analog of the JS `() => Panel` factory closure.
    private compileItemsPanelTemplateForm(rf: ResourceForm): string
    {
        if (rf.body.kind !== 'element')
        {
            throw new EmitError(
                'ItemsPanelTemplate body must be a single element', rf.span);
        }
        this.ensureImport('ItemsPanelTemplate');
        const tmplVar = this.fresh('tmpl');
        this.line(`const ${tmplVar} = new ItemsPanelTemplate(() => {`);
        this.indent += 4;
        const rootVar = this.compileElement(rf.body);
        this.line(`return ${rootVar};`);
        this.indent -= 4;
        this.line(`});`);
        return tmplVar;
    }

    private compileResourceElement(rdVar: string, elem: ElementNode): void
    {
        // Macro invocation? Expand first so the x:key / x:root check
        // below sees the post-expansion attrs (macro authors can put
        // `x:key` on the macro's outer element via the expansion body).
        const macro = this.macros.get(elem.name);
        if (macro !== undefined)
        {
            const expanded = this.expandMacro(elem, macro);
            // Forward x:* attrs from the invocation onto the expanded
            // root so `card x:key="X" { ... }` still keys the result.
            const merged: ElementNode = elem.xAttrs.length === 0
                ? expanded
                : { ...expanded, xAttrs: [...expanded.xAttrs, ...elem.xAttrs] };
            this.compileResourceElement(rdVar, merged);
            return;
        }

        const xKey  = this.findXAttr(elem.xAttrs, 'key');
        const xRoot = this.findXAttr(elem.xAttrs, 'root');
        if (xKey === null && xRoot === null)
        {
            throw new EmitError(
                `${elem.name} inside resources requires x:key or x:root`,
                elem.span);
        }
        const elemVar = this.compileElement(elem);
        if (xRoot !== null)
        {
            this.line(`${rdVar}.Root = ${elemVar};`);
        }
        if (xKey !== null)
        {
            if (xKey.value === null || xKey.value.kind !== 'string')
            {
                throw new EmitError(
                    'x:key requires a string literal value', xKey.span);
            }
            this.line(
                `${rdVar}.Set(${JSON.stringify(xKey.value.value)}, ${elemVar});`);
        }
    }

    // ── Style + Setter + PropertyTrigger emission ──────────────────

    private compileStyleForm(rf: ResourceForm): string
    {
        if (rf.body.kind !== 'setter-list')
        {
            throw new EmitError('style body must be a setter list', rf.span);
        }
        this.ensureImport('Style');

        const tt = this.requireTargetType(rf);
        this.ensureImport(tt);

        const setterVars:       string[] = [];
        const triggerVars:      string[] = [];
        const multiTriggerVars: string[] = [];
        const dataTriggerVars:  string[] = [];
        const eventTriggerVars: string[] = [];
        for (const item of rf.body.items)
        {
            if (item.kind === 'property-setter')
            {
                setterVars.push(this.compileSetter(tt, item));
            }
            else if (item.kind === 'event-trigger')
            {
                eventTriggerVars.push(this.compileEventTriggerGroup(tt, item));
            }
            else
            {
                const out = this.compileTriggerGroup(tt, item);
                triggerVars.push(...out.propertyTriggers);
                multiTriggerVars.push(...out.multiTriggers);
                dataTriggerVars.push(...out.dataTriggers);
            }
        }
        const settersArr       = `[${setterVars.join(', ')}]`;
        const triggersArr      = `[${triggerVars.join(', ')}]`;
        const multiTriggersArr = `[${multiTriggerVars.join(', ')}]`;
        const dataTriggersArr  = `[${dataTriggerVars.join(', ')}]`;
        const eventTriggersArr = `[${eventTriggerVars.join(', ')}]`;

        const styleVar = this.fresh('style');
        // Style(targetType, setters, basedOn, triggers, multiTriggers,
        //       eventTriggers, dataTriggers). Trailing arguments are
        // omitted from the emit when empty so existing snapshot tests
        // of the legacy 5- and 6-arg forms keep matching — a Style
        // with no event triggers and no data triggers reproduces the
        // historical 5-arg call.
        if (eventTriggerVars.length === 0 && dataTriggerVars.length === 0)
        {
            this.line(
                `const ${styleVar} = new Style(${tt}, ${settersArr}, undefined, ${triggersArr}, ${multiTriggersArr});`);
        }
        else if (dataTriggerVars.length === 0)
        {
            this.line(
                `const ${styleVar} = new Style(${tt}, ${settersArr}, undefined, ${triggersArr}, ${multiTriggersArr}, ${eventTriggersArr});`);
        }
        else
        {
            this.line(
                `const ${styleVar} = new Style(${tt}, ${settersArr}, undefined, ${triggersArr}, ${multiTriggersArr}, ${eventTriggersArr}, ${dataTriggersArr});`);
        }
        return styleVar;
    }

    // ── EventTrigger emission ──────────────────────────────────────────
    //
    // Each `on Click { BeginStoryboard { Animation[...] } }` lowers to:
    //
    //   const _evt0 = new EventTrigger('Click', [
    //       new BeginStoryboardAction((_target) => {
    //           const _sb1 = new Storyboard();
    //           _sb1.Add(_target, 'Width', new DoubleAnimation({...}));
    //           return _sb1;
    //       }),
    //   ]);
    //
    // The Storyboard is built inside the BeginStoryboardAction's
    // factory so each Visual carrying the style gets a fresh Storyboard
    // instance per fire (a shared Storyboard would stomp itself when
    // multiple Buttons clicked simultaneously).
    private compileEventTriggerGroup(
        _targetType: string, et: EventTriggerGroup,
    ): string
    {
        this.ensureImport('EventTrigger');
        this.ensureImport('BeginStoryboardAction');
        this.ensureImport('Storyboard');

        const actionVars: string[] = [];
        for (const action of et.actions)
        {
            actionVars.push(this.compileTriggerAction(action));
        }
        const evtVar = this.fresh('evt');
        const actionsArr = `[${actionVars.join(', ')}]`;
        this.line(
            `const ${evtVar} = new EventTrigger(${JSON.stringify(et.eventName)}, ${actionsArr});`);
        return evtVar;
    }

    private compileTriggerAction(action: TriggerActionNode): string
    {
        switch (action.kind)
        {
            case 'begin-storyboard':  return this.compileBeginStoryboard(action);
            case 'stop-storyboard':   return this.compileStopStoryboard(action);
            case 'pause-storyboard':  return this.compilePauseStoryboard(action);
            case 'resume-storyboard': return this.compileResumeStoryboard(action);
            case 'invoke-command':    return this.compileInvokeCommand(action);
        }
    }

    // `InvokeCommand[Command=$SaveCommand]` lowers to:
    //   const _act0 = new InvokeCommandAction((_target) =>
    //       _target.DataContext?.SaveCommand);
    // The factory reads the command on every fire so VM-side replacement
    // of the command DP propagates without re-installing the trigger.
    // For multi-part paths (`$VM.Save.Command`) the chain uses optional
    // chaining so an unbound DataContext or missing intermediate stays
    // a silent no-op rather than throwing inside the dispatch loop.
    private compileInvokeCommand(node: InvokeCommandNode): string
    {
        this.ensureImport('InvokeCommandAction');
        const cmd = node.command;
        if (cmd.kind !== 'binding')
        {
            throw new EmitError(
                'InvokeCommand Command attribute must be a $-binding to an ICommand',
                node.span);
        }
        const v = this.fresh('act');
        const chain = cmd.path.map(p => `?.${p}`).join('');
        this.line(
            `const ${v} = new InvokeCommandAction((_target) => _target.DataContext${chain});`);
        return v;
    }

    private compileStopStoryboard(node: StopStoryboardNode): string
    {
        this.ensureImport('StopStoryboardAction');
        const v = this.fresh('act');
        this.line(
            `const ${v} = new StopStoryboardAction(${JSON.stringify(node.name)});`);
        return v;
    }

    private compilePauseStoryboard(node: PauseStoryboardNode): string
    {
        this.ensureImport('PauseStoryboardAction');
        const v = this.fresh('act');
        this.line(
            `const ${v} = new PauseStoryboardAction(${JSON.stringify(node.name)});`);
        return v;
    }

    private compileResumeStoryboard(node: ResumeStoryboardNode): string
    {
        this.ensureImport('ResumeStoryboardAction');
        const v = this.fresh('act');
        this.line(
            `const ${v} = new ResumeStoryboardAction(${JSON.stringify(node.name)});`);
        return v;
    }

    private compileBeginStoryboard(node: BeginStoryboardNode): string
    {
        if (node.animations.length === 0)
        {
            throw new EmitError(
                'BeginStoryboard requires at least one animation declaration', node.span);
        }
        // Ensure imports — covers both the EventTrigger path (which
        // imports them separately at compileEventTriggerGroup) and the
        // PropertyTrigger enter/exit path which calls in here directly.
        this.ensureImport('BeginStoryboardAction');
        this.ensureImport('Storyboard');
        const sbVar     = this.fresh('sb');
        const actionVar = this.fresh('act');
        // The factory body opens with an arrow-function closure that
        // closes over the firing Visual as `_target`. Indent bumps
        // (cosmetic — the emitted JS is single-pass parsed by the JS
        // engine regardless) so nested code reads as indented.
        const nameArg = node.name !== undefined
            ? `, ${JSON.stringify(node.name)}`
            : '';
        this.line(`const ${actionVar} = new BeginStoryboardAction((_target) => {`);
        this.indent += 4;
        this.line(`const ${sbVar} = new Storyboard();`);
        for (const anim of node.animations)
        {
            this.emitAnimationAdd(sbVar, anim);
        }
        this.line(`return ${sbVar};`);
        this.indent -= 4;
        this.line(`}${nameArg});`);
        return actionVar;
    }

    private emitAnimationAdd(sbVar: string, anim: AnimationDecl): void
    {
        this.ensureImport(anim.className);

        // TargetProperty / TargetName are structural — extract them
        // from the attr list so the animation constructor only sees
        // its real props bag.
        let targetProperty: string | undefined;
        let targetName:     string | undefined;
        const ctorAttrs: string[] = [];
        for (const attr of anim.attrs)
        {
            if (attr.kind === 'positional-attr')
            {
                throw new EmitError(
                    `animation '${anim.className}' does not accept positional attributes`,
                    attr.span);
            }
            const path = attr.path;
            if (path.parts.length !== 1)
            {
                throw new EmitError(
                    `animation '${anim.className}' attribute paths must be simple identifiers`,
                    attr.span);
            }
            const propName = path.parts[0]!;
            if (propName === 'TargetProperty')
            {
                if (attr.value.kind !== 'string' && attr.value.kind !== 'ident')
                {
                    throw new EmitError(
                        'TargetProperty must be a string or bare identifier',
                        attr.value.span);
                }
                targetProperty = attr.value.kind === 'string'
                    ? attr.value.value
                    : attr.value.name;
                continue;
            }
            if (propName === 'TargetName')
            {
                // TargetName redirects sb.Add to a NameScope-resolved
                // sibling. Resolved at trigger-fire time via
                // _target.FindName, which walks the visual ancestry to
                // find a NameScope hosting the name.
                if (attr.value.kind !== 'string' && attr.value.kind !== 'ident')
                {
                    throw new EmitError(
                        'TargetName must be a string or bare identifier',
                        attr.value.span);
                }
                targetName = attr.value.kind === 'string'
                    ? attr.value.value
                    : attr.value.name;
                continue;
            }
            const valueExpr = this.compileValue(attr.value, { propertyName: propName });
            ctorAttrs.push(`${propName}: ${valueExpr}`);
        }
        if (targetProperty === undefined)
        {
            throw new EmitError(
                `animation '${anim.className}' requires TargetProperty=...`,
                anim.span);
        }

        const ctorArgs = ctorAttrs.length > 0
            ? `{ ${ctorAttrs.join(', ')} }`
            : '';
        // Resolved target expression: TargetName → FindName lookup with
        // a `?? _target` fallback so a typo'd name silently animates
        // the firing Visual rather than throwing. The runtime warning
        // surface for this lives in the runtime — emitter stays purely
        // structural.
        const targetExpr = targetName !== undefined
            ? `(_target.FindName(${JSON.stringify(targetName)}) ?? _target)`
            : `_target`;
        this.line(
            `${sbVar}.Add(${targetExpr}, ${JSON.stringify(targetProperty)}, new ${anim.className}(${ctorArgs}));`);
    }

    private compileSetter(targetType: string, ps: PropertySetter): string
    {
        this.ensureImport('Setter');
        const owner = this.attrPathOwner(targetType, ps.path);
        this.ensureImport(owner);
        const propName = this.attrPathProperty(ps.path);
        // Style setters apply to many targets — no targetExpr; values
        // that need a host (DynamicResource) get wrapped in SetterFactory.
        const valueExpr = this.compileValue(ps.value, { propertyName: propName });
        const v = this.fresh('setter');
        this.line(
            `const ${v} = new Setter(${owner}, ${JSON.stringify(propName)}, ${valueExpr});`);
        return v;
    }

    private compileTriggerGroup(
        targetType: string, tg: TriggerGroup,
    ): { propertyTriggers: string[]; multiTriggers: string[]; dataTriggers: string[] }
    {
        this.ensureImport(targetType);

        // Flatten the trigger expression to DNF — a list of conjuncts,
        // each of which is a list of TriggerTerms ANDed together.
        // Single-term conjuncts emit as PropertyTrigger; multi-term
        // conjuncts emit as MultiTrigger.
        const disjuncts = this.flattenToDNF(tg.condition);

        // Partition the body into property setters and `on enter` /
        // `on exit` action groups. Other event names (e.g. `on Click`)
        // are rejected inside a `when()` body — Click is a top-level
        // routed event, not a property-trigger edge.
        const setterVars:      string[] = [];
        const enterActionVars: string[] = [];
        const exitActionVars:  string[] = [];
        for (const item of tg.setters.items)
        {
            if (item.kind === 'property-setter')
            {
                setterVars.push(this.compileSetter(targetType, item));
                continue;
            }
            if (item.kind === 'event-trigger')
            {
                if (item.eventName === 'enter')
                {
                    for (const a of item.actions)
                    {
                        enterActionVars.push(this.compileTriggerAction(a));
                    }
                    continue;
                }
                if (item.eventName === 'exit')
                {
                    for (const a of item.actions)
                    {
                        exitActionVars.push(this.compileTriggerAction(a));
                    }
                    continue;
                }
                throw new EmitError(
                    `inside when(): only 'enter' and 'exit' are valid 'on' names — got '${item.eventName}'`,
                    item.span);
            }
            throw new EmitError(
                'nested triggers are not supported', item.span);
        }
        const settersArrVar = this.fresh('sArr');
        this.line(`const ${settersArrVar} = [${setterVars.join(', ')}];`);

        // Emit the enter/exit action arrays as locals so the (potentially
        // multiple) PropertyTriggers / MultiTriggers in the DNF expansion
        // can share the same array references.
        let enterArrVar = '[]';
        if (enterActionVars.length > 0)
        {
            enterArrVar = this.fresh('enter');
            this.line(`const ${enterArrVar} = [${enterActionVars.join(', ')}];`);
        }
        let exitArrVar = '[]';
        if (exitActionVars.length > 0)
        {
            exitArrVar = this.fresh('exit');
            this.line(`const ${exitArrVar} = [${exitActionVars.join(', ')}];`);
        }
        // Argument tail — omitted when both action lists are empty so
        // existing snapshot tests of the 4-arg PropertyTrigger form
        // stay matching.
        const triggerTail = (enterActionVars.length > 0 || exitActionVars.length > 0)
            ? `, ${enterArrVar}, ${exitArrVar}`
            : '';

        const propertyTriggers: string[] = [];
        const multiTriggers:    string[] = [];
        const dataTriggers:     string[] = [];

        for (const conjunct of disjuncts)
        {
            if (conjunct.length === 1)
            {
                const term = conjunct[0]!;
                const valueExpr = this.evaluateTermValue(term);
                if (term.path !== undefined)
                {
                    // DataTrigger — `when($Path)` / `when($Path = expr)`.
                    // Watches the styled target's DataContext for `path`.
                    // Currently rejects `not $Path` outright because
                    // DataTrigger's runtime compares with === only;
                    // a negated form would require a separate value-
                    // mismatch path that's not in v0.
                    if (term.negated)
                    {
                        throw new EmitError(
                            "`not $path` inside when() is not supported yet — use `$path = false` instead",
                            term.span);
                    }
                    this.ensureImport('DataTrigger');
                    const v = this.fresh('dataTrig');
                    this.line(
                        `const ${v} = new DataTrigger(${JSON.stringify(term.path)}, ${valueExpr}, ${settersArrVar}${triggerTail});`);
                    dataTriggers.push(v);
                }
                else
                {
                    this.ensureImport('PropertyTrigger');
                    const v = this.fresh('trigger');
                    this.line(
                        `const ${v} = new PropertyTrigger(${targetType}, ${JSON.stringify(term.property)}, ${valueExpr}, ${settersArrVar}${triggerTail});`);
                    propertyTriggers.push(v);
                }
            }
            else
            {
                // Multi-term conjunct — emit as MultiTrigger. Mixing a
                // $path term into a multi-term conjunct isn't supported
                // yet (the runtime MultiTrigger only watches DPs).
                for (const term of conjunct)
                {
                    if (term.path !== undefined)
                    {
                        throw new EmitError(
                            "`$path` terms inside `when( … and … )` are not supported yet — split the disjunction or use a single $path term",
                            term.span);
                    }
                }
                this.ensureImport('MultiTrigger');
                const conditionExprs: string[] = [];
                for (const term of conjunct)
                {
                    const valueExpr = this.evaluateTermValue(term);
                    conditionExprs.push(
                        `{ propertyOwner: ${targetType}, propertyName: ${JSON.stringify(term.property)}, value: ${valueExpr} }`);
                }
                const v = this.fresh('multiTrig');
                this.line(
                    `const ${v} = new MultiTrigger([${conditionExprs.join(', ')}], ${settersArrVar}${triggerTail});`);
                multiTriggers.push(v);
            }
        }
        return { propertyTriggers, multiTriggers, dataTriggers };
    }

    private evaluateTermValue(term: TriggerTermLite): string
    {
        if (term.value === null)
        {
            // Bare property — bool trigger. `not P` matches when P is false.
            return term.negated ? 'false' : 'true';
        }
        if (term.negated)
        {
            throw new EmitError(
                "'not' is only supported on bare boolean properties (no explicit value)",
                term.span);
        }
        return this.compileValue(term.value, { propertyName: term.property });
    }

    // Flatten an arbitrary trigger expression to disjunctive normal
    // form: a list of conjuncts (each conjunct is a list of TriggerTerms
    // ANDed). Distributes AND over OR, so `(A or B) and C` becomes
    // `[[A, C], [B, C]]`.
    private flattenToDNF(expr: TriggerExpr): TriggerTermLite[][]
    {
        if (expr.kind === 'trigger-term')
        {
            return [[{ property: expr.property, path: expr.path,
                       value: expr.value,
                       negated: expr.negated, span: expr.span }]];
        }
        if (expr.kind === 'trigger-or')
        {
            return [...this.flattenToDNF(expr.left), ...this.flattenToDNF(expr.right)];
        }
        // trigger-and: distribute over OR.
        const left  = this.flattenToDNF(expr.left);
        const right = this.flattenToDNF(expr.right);
        const out: TriggerTermLite[][] = [];
        for (const l of left)
        {
            for (const r of right)
            {
                out.push([...l, ...r]);
            }
        }
        return out;
    }

    // ── Element emission ───────────────────────────────────────────

    private compileElement(elem: ElementNode): string
    {
        // Macro invocation? Expand and recurse on the substituted tree.
        const macro = this.macros.get(elem.name);
        if (macro !== undefined)
        {
            const expanded = this.expandMacro(elem, macro);
            return this.compileElement(expanded);
        }

        this.ensureImport(elem.name);
        const v = this.fresh(this.varHint(elem.name));
        this.line(`const ${v} = new ${elem.name}();`);

        // ── x:* meta attributes ────────────────────────────────────
        // Handle these BEFORE the body compiles so the NameScope is
        // already attached to the root by the time descendant elements
        // attempt to register their x:name.
        this.applyXAttrs(v, elem);

        for (const attr of elem.attrs)
        {
            this.compileAttribute(v, elem.name, attr);
        }

        if (elem.body !== null && elem.body.kind === 'structured-body')
        {
            this.compileElementBody(v, elem.name, elem.body);
        }
        else if (elem.body !== null && elem.body.kind === 'string-body')
        {
            const slot = this.slots.get(elem.name);
            if (slot === undefined || slot.kind !== 'string')
            {
                throw new EmitError(
                    `${elem.name} cannot receive a text body`,
                    elem.body.span);
            }
            // Text-only body emits a plain string literal; a body that
            // mixes text with `{{ … }}` chunks falls through to the
            // shared lowering so the converter sees both sides.
            const hasInlineExpr = elem.body.chunks.some(c => c.kind === 'inline-expr');
            if (!hasInlineExpr)
            {
                const text = elem.body.chunks
                    .map(c => c.kind === 'text-chunk' ? c.text : '')
                    .join('');
                this.line(
                    `${v}._set_property_value_by_name(${JSON.stringify(slot.name)}, ${JSON.stringify(text)});`);
            }
            else
            {
                const expr = this.compileMixedTextBody(elem.body, { targetExpr: v });
                this.line(
                    `${v}._set_property_value_by_name(${JSON.stringify(slot.name)}, ${expr});`);
            }
        }
        return v;
    }

    // ── Macros ─────────────────────────────────────────────────────

    // Bind invocation args to macro params, then walk the macro body
    // cloning + substituting holes. Returns a fresh ElementNode that
    // compileElement processes normally.
    private expandMacro(invocation: ElementNode, macro: DefForm): ElementNode
    {
        const subst = this.bindMacroArgs(invocation, macro);
        return this.substElement(macro.body, subst);
    }

    private bindMacroArgs(invocation: ElementNode, macro: DefForm): MacroSubst
    {
        const subst: MacroSubst = new Map();

        // Named params (declared as `#bg`, `#title`, …) — filled in
        // order from the invocation's POSITIONAL attrs.
        const namedParams      = macro.params.filter(p => !p.positional);
        const positionalAttrs  = invocation.attrs.filter(a => a.kind === 'positional-attr');
        const namedAttrs       = invocation.attrs.filter(a => a.kind === 'named-attr');

        if (namedAttrs.length > 0)
        {
            throw new EmitError(
                `macro '${macro.name}': named-argument invocation is not supported in v0 (use positional)`,
                namedAttrs[0]!.span);
        }
        if (positionalAttrs.length > namedParams.length)
        {
            throw new EmitError(
                `macro '${macro.name}': too many positional arguments (expected ${namedParams.length})`,
                invocation.span);
        }

        for (let i = 0; i < namedParams.length; i++)
        {
            const param = namedParams[i]!;
            const arg = positionalAttrs[i];
            if (arg !== undefined)
            {
                subst.set(param.holeName, { kind: 'value', value: arg.value });
            }
            else if (param.defaultValue !== null)
            {
                subst.set(param.holeName, { kind: 'value', value: param.defaultValue });
            }
            else
            {
                throw new EmitError(
                    `macro '${macro.name}': missing required argument #${param.holeName}`,
                    invocation.span);
            }
        }

        // Positional param (typically `#1`) — bound to the invocation's
        // content body. By convention only one positional param is used
        // (the implicit content slot); additional positional declarations
        // would have no way to be filled from the invocation surface and
        // are rejected here as a programmer error.
        const positionalParams = macro.params.filter(p => p.positional);
        if (positionalParams.length > 1)
        {
            throw new EmitError(
                `macro '${macro.name}': more than one positional content param is not supported`,
                macro.span);
        }
        const contentItems: BodyItem[] =
            (invocation.body !== null && invocation.body.kind === 'structured-body')
                ? invocation.body.items
                : [];
        if (positionalParams.length === 1)
        {
            subst.set(positionalParams[0]!.holeName,
                      { kind: 'body', items: contentItems });
        }
        else if (contentItems.length > 0)
        {
            throw new EmitError(
                `macro '${macro.name}': has body content but no content slot (#1) declared`,
                invocation.span);
        }
        return subst;
    }

    // Walk an ElementNode and produce a fresh copy with holes
    // substituted. The recursion mirrors the AST structure.
    private substElement(elem: ElementNode, subst: MacroSubst): ElementNode
    {
        return {
            kind:   'element',
            name:   elem.name,
            xAttrs: elem.xAttrs.map(x => this.substXAttr(x, subst)),
            attrs:  elem.attrs .map(a => this.substAttr (a, subst)),
            body:   elem.body === null
                ? null
                : (elem.body.kind === 'string-body'
                    ? elem.body
                    : {
                        kind: 'structured-body',
                        items: elem.body.items.flatMap(it => this.substBodyItem(it, subst)),
                        span:  elem.body.span,
                      }),
            span: elem.span,
        };
    }

    private substAttr(attr: Attribute, subst: MacroSubst): Attribute
    {
        if (attr.kind === 'positional-attr')
        {
            return { ...attr, value: this.substValue(attr.value, subst) };
        }
        return { ...attr, value: this.substValue(attr.value, subst) };
    }

    private substXAttr(attr: XAttr, subst: MacroSubst): XAttr
    {
        return {
            ...attr,
            value: attr.value === null ? null : this.substValue(attr.value, subst),
        };
    }

    private substValue(val: ValueNode, subst: MacroSubst): ValueNode
    {
        if (val.kind === 'macro-hole')
        {
            const bound = subst.get(val.name);
            if (bound === undefined)
            {
                throw new EmitError(
                    `macro hole #${val.name} is not bound`, val.span);
            }
            if (bound.kind === 'body')
            {
                throw new EmitError(
                    `macro hole #${val.name} was bound to body content; can't use in value position`,
                    val.span);
            }
            return bound.value;
        }
        // A `#name` token inside a def body lexes as ColorValue when
        // the `name` is letter-starting (the parser can't know it's a
        // macro reference without seeing the surrounding def). At
        // expansion time we can disambiguate: if `name` matches a bound
        // macro param, substitute; otherwise leave as a real colour.
        if (val.kind === 'color')
        {
            const bound = subst.get(val.raw);
            if (bound !== undefined)
            {
                if (bound.kind === 'body')
                {
                    throw new EmitError(
                        `macro hole #${val.raw} was bound to body content; can't use in value position`,
                        val.span);
                }
                return bound.value;
            }
            return val;
        }
        if (val.kind === 'tuple')
        {
            return {
                ...val,
                values: val.values.map(v => this.substValue(v, subst)),
            };
        }
        if (val.kind === 'list')
        {
            return {
                ...val,
                values: val.values.map(v => this.substValue(v, subst)),
            };
        }
        if (val.kind === 'size')
        {
            return {
                ...val,
                width:  this.substValue(val.width, subst),
                height: this.substValue(val.height, subst),
            };
        }
        return val;
    }

    private substBodyItem(item: BodyItem, subst: MacroSubst): BodyItem[]
    {
        if (item.kind === 'macro-hole-body-item')
        {
            const bound = subst.get(item.name);
            if (bound === undefined)
            {
                throw new EmitError(
                    `macro hole #${item.name} is not bound`, item.span);
            }
            if (bound.kind === 'value')
            {
                throw new EmitError(
                    `macro hole #${item.name} was bound to a value; can't use in body position`,
                    item.span);
            }
            // Substituted content items are themselves visited so a
            // macro can splice in items that reference other holes.
            return bound.items.flatMap(it => this.substBodyItem(it, subst));
        }
        if (item.kind === 'element')
        {
            return [this.substElement(item, subst)];
        }
        if (item.kind === 'slot-assign')
        {
            const newValue = ('kind' in item.value && item.value.kind === 'structured-body')
                ? {
                    kind: 'structured-body' as const,
                    items: item.value.items.flatMap(i => this.substBodyItem(i, subst)),
                    span:  item.value.span,
                  }
                : this.substValue(item.value as ValueNode, subst);
            return [{ ...item, value: newValue }];
        }
        if (item.kind === 'key-value-resource')
        {
            return [{ ...item, value: this.substValue(item.value, subst) }];
        }
        // resource-form / def-form: pass through unchanged for v0.
        return [item];
    }

    private compileAttribute(targetVar: string, _parentClass: string, attr: Attribute): void
    {
        if (attr.kind === 'positional-attr')
        {
            throw new EmitError(
                'positional attributes only apply to macros (not supported in v0)',
                attr.span);
        }
        if (attr.path.parts.length === 2)
        {
            const ownerType = attr.path.parts[0]!;
            const propName  = attr.path.parts[1]!;
            this.ensureImport(ownerType);
            const valueExpr = this.compileValue(attr.value, {
                propertyName: propName,
                targetExpr:   targetVar,
            });
            this.line(
                `${targetVar}._set_property_value_by_name(${ownerType}, ${JSON.stringify(propName)}, ${valueExpr});`);
            return;
        }
        const propName = attr.path.parts[0]!;
        const valueExpr = this.compileValue(attr.value, {
            propertyName: propName,
            targetExpr:   targetVar,
        });
        this.line(
            `${targetVar}._set_property_value_by_name(${JSON.stringify(propName)}, ${valueExpr});`);
    }

    private compileElementBody(parentVar: string, parentClass: string, body: StructuredBody): void
    {
        const slot = this.slots.get(parentClass);
        for (const item of body.items)
        {
            if (item.kind === 'slot-assign')
            {
                if (item.name === 'resources')
                {
                    this.compileResourcesSlot(`${parentVar}.Resources`, item);
                    continue;
                }
                // Inline template at the value position — emit an
                // anonymous template (no x:key) and assign the resulting
                // var to the slot. Lets consumers write
                //   ListBox { ItemsPanel: ItemsPanelTemplate { WrapPanel[…] } }
                // without registering a keyed dictionary entry just to
                // reference it once.
                if (typeof item.value === 'object' && 'kind' in item.value
                    && item.value.kind === 'resource-form')
                {
                    const tmplVar = this.compileInlineTemplateValue(item.value);
                    this.line(
                        `${parentVar}._set_property_value_by_name(${JSON.stringify(item.name)}, ${tmplVar});`);
                    continue;
                }
                // Non-resources slot — set as a regular property.
                if (typeof item.value === 'object' && 'kind' in item.value
                    && item.value.kind === 'structured-body')
                {
                    throw new EmitError(
                        `SlotAssign '${item.name}': nested element bodies are not supported in v0`,
                        item.span);
                }
                const expr = this.compileValue(item.value as ValueNode, {
                    propertyName: item.name,
                    targetExpr:   parentVar,
                });
                this.line(
                    `${parentVar}._set_property_value_by_name(${JSON.stringify(item.name)}, ${expr});`);
                continue;
            }
            if (item.kind === 'element')
            {
                // `Behaviors { … }` block — not a default-slot child;
                // each entry in the body is a Behavior class instance
                // to attach to the parent via Visual.AddBehavior. The
                // compiler routes each inner element through the normal
                // compileElement pipeline (so DPs / setters / bindings
                // all work) and then emits a single AddBehavior call.
                if (item.name === 'Behaviors')
                {
                    this.compileBehaviorsBlock(parentVar, item);
                    continue;
                }
                const childVar = this.compileElement(item);
                this.assignToDefaultSlot(parentVar, parentClass, slot, childVar, item.span);
                continue;
            }
            throw new EmitError(
                `${item.kind} is not allowed in an element body`,
                'span' in item ? item.span : body.span);
        }
    }

    // Lowers a `Behaviors { … }` block. Each child element is a
    // Behavior class instance — constructed, populated with its
    // setters, then attached to `parentVar` via AddBehavior. Behaviors
    // are class-based (subclass `Behavior`), so registering a behavior
    // class is symmetric with registering a control class — both go
    // through the symbol table's import map.
    private compileBehaviorsBlock(parentVar: string, behaviorsElem: ElementNode): void
    {
        if (behaviorsElem.attrs.length > 0)
        {
            throw new EmitError(
                "Behaviors { … } block doesn't take attributes — attach Behavior instances inside the body",
                behaviorsElem.span);
        }
        const body = behaviorsElem.body;
        if (body === null || body.kind !== 'structured-body')
        {
            // An empty Behaviors block is a no-op; only structured
            // bodies (zero or more child Behavior elements) make sense
            // here. A string body would be authoring noise.
            if (body !== null) {
                throw new EmitError(
                    "Behaviors block must contain Behavior element entries",
                    behaviorsElem.span);
            }
            return;
        }
        for (const child of body.items)
        {
            if (child.kind !== 'element')
            {
                throw new EmitError(
                    `Behaviors block only accepts Behavior element entries (got ${child.kind})`,
                    'span' in child ? child.span : body.span);
            }
            const behaviorVar = this.compileElement(child);
            this.line(`${parentVar}.AddBehavior(${behaviorVar});`);
        }
    }

    private assignToDefaultSlot(
        parentVar: string,
        parentClass: string,
        slot: SlotInfo | undefined,
        childVar: string,
        span: SourceSpan,
    ): void
    {
        if (slot === undefined)
        {
            throw new EmitError(
                `${parentClass} has no default-slot info — cannot receive a child`,
                span);
        }
        switch (slot.kind)
        {
            case 'single':
                // Single.SetChild does the Attach/Detach plumbing; the
                // lowercase `child` getter is read-only. The slot's
                // `name` field stays informational ('Child').
                this.line(`${parentVar}.SetChild(${childVar});`);
                return;
            case 'object':
                // Object-typed slot (ContentControl.Content) — the
                // public Content setter exists and routes through the
                // attach plumbing internally.
                this.line(`${parentVar}.${slot.name} = ${childVar};`);
                return;
            case 'list':
                // Panel.Children is read-only — mutation goes through
                // Panel.AddChild (see src/runtime/visual.ts:1318), which
                // also wires AttachLogical for the child.
                this.line(`${parentVar}.AddChild(${childVar});`);
                return;
            case 'string':
                throw new EmitError(
                    `${parentClass}.${slot.name} is a text slot; cannot accept an element child`,
                    span);
        }
    }

    // ── Value emission ─────────────────────────────────────────────

    private compileValue(val: ValueNode, ctx: ValueCtx): string
    {
        switch (val.kind)
        {
            case 'number':
                return val.raw;
            case 'string':
                return JSON.stringify(val.value);
            case 'ident':
                return this.compileIdentValue(val, ctx);
            case 'color':
                return this.compileColorValue(val);
            case 'tuple':
                return this.compileTupleValue(val, ctx);
            case 'size':
            {
                this.ensureImport('Size');
                const w = this.compileValue(val.width,  {});
                const h = this.compileValue(val.height, {});
                return `new Size(${w}, ${h})`;
            }
            case 'list':
            {
                const exprs = val.values.map(v => this.compileValue(v, {}));
                return `[${exprs.join(', ')}]`;
            }
            case 'static-resource':
                this.ensureImport('Application');
                // Eager lookup against the singleton — works at any
                // construction site since Application is built first.
                return `Application.current.Resources.Resolve(${JSON.stringify(val.key)})`;
            case 'dynamic-resource':
                this.ensureImport('DynamicResource');
                if (ctx.targetExpr !== undefined)
                {
                    return `DynamicResource(${ctx.targetExpr}, ${JSON.stringify(val.key)})`;
                }
                // No live target — wrap in a SetterFactory so each
                // Style application creates a fresh per-target binding.
                this.ensureImport('SetterFactory');
                return `new SetterFactory((_t) => DynamicResource(_t, ${JSON.stringify(val.key)}))`;
            case 'binding':
            {
                // ElementName-style binding — when the first path
                // segment matches an x:name declared earlier in the
                // current template scope, the source is that named
                // element (a fixed Visual) rather than the target's
                // DataContext. Mirrors WPF's
                // `{Binding ElementName=foo, Path=Bar}`. Only fires
                // INSIDE a template body: outside a template the same
                // syntax addresses the DataContext, as before.
                const head = val.path[0];
                if (head !== undefined
                    && this.templateNameVars !== undefined
                    && this.templateNameVars.has(head))
                {
                    this.ensureImport('ElementNameBinding');
                    const sourceVar = this.templateNameVars.get(head)!;
                    const restPath  = val.path.slice(1).join('.');
                    if (restPath.length === 0)
                    {
                        // `$foo` alone — author wants the element
                        // itself, not a property of it. Bindings need a
                        // path; emit a single-segment lookup against the
                        // element under a sentinel key would be
                        // surprising, so reject with a clear message.
                        throw new EmitError(
                            `'$${head}' references the named element '${head}' but has no property path. ` +
                            `Use '$${head}.<Property>' to bind to one of its properties.`,
                            val.span);
                    }
                    // Style-setter wrap (ctx.targetExpr undefined) and
                    // direct-target attribute (defined) both resolve
                    // the source the same way: the source is a fixed
                    // Visual captured at factory time, so there's no
                    // per-target re-binding to wrap in a SetterFactory.
                    return `ElementNameBinding(${sourceVar}, ${JSON.stringify(restPath)})`;
                }
                this.ensureImport('DataContextBinding');
                const pathStr = val.path.join('.');
                if (ctx.targetExpr !== undefined)
                {
                    return `DataContextBinding(${ctx.targetExpr}, ${JSON.stringify(pathStr)})`;
                }
                // Style-setter context — target unknown until apply
                // time. Wrap so each target instantiation gets a fresh
                // binding (each one subscribes to its own target's
                // DataContext events).
                this.ensureImport('SetterFactory');
                return `new SetterFactory((_t) => DataContextBinding(_t, ${JSON.stringify(pathStr)}))`;
            }
            case 'template-binding':
            {
                if (!this.inTemplateBody)
                {
                    throw new EmitError(
                        '$$Property is only valid inside a control-template body',
                        val.span);
                }
                this.ensureImport('TemplateBinding');
                // The factory's parameter is always `_templatedParent`,
                // so we reference it directly regardless of the value
                // position (attribute or Style setter). No SetterFactory
                // wrap because the templated parent is fixed per
                // template application, not per target instance.
                return `TemplateBinding(_templatedParent, ${JSON.stringify(val.name)})`;
            }
            case 'macro-hole':
                throw new EmitError('macros are not supported in v0', val.span);
            case 'inline-expr':
                return this.compileInlineExpr(val, ctx);
            case 'flag':
                throw new EmitError(
                    'flag value used outside an x:* attribute', val.span);
        }
    }

    private compileIdentValue(val: IdentValue, ctx: ValueCtx): string
    {
        const name = val.name;
        // 1. Boolean literals — `true` / `false` (case-sensitive). Emitted
        //    as raw JS literals so the runtime receives an actual bool
        //    rather than the truthy strings "true" / "false" (the latter
        //    being a particularly painful footgun: it's truthy).
        if (name === 'true')  return 'true';
        if (name === 'false') return 'false';
        // 1b. Numeric literals authored as bare idents — Infinity and
        //     NaN. Same string-vs-value footgun as boolean literals:
        //     emitting JSON.stringify('Infinity') as a fallback would
        //     poison numeric DPs (RepeatBehavior, Min/Max bounds, etc.).
        if (name === 'Infinity')  return 'Infinity';
        if (name === '-Infinity') return '-Infinity';
        if (name === 'NaN')       return 'NaN';
        // 2. Property-name match against an enum class — emit ClassName.Member.
        //    Validate the member: an ident in enum position must be a known
        //    member of that enum, otherwise we'd silently emit `Enum.unknown`
        //    which resolves to `undefined` at runtime and tends to cascade
        //    into NaN through layout math.
        //
        //    Two routes to find the enum class:
        //    (a) the property name itself equals the enum class name
        //        (HorizontalAlignment, Orientation, …).
        //    (b) PROPERTY_TO_ENUM maps a differently-named property onto
        //        the enum class (`Variant: DrawerVariant`, `Anchor:
        //        DrawerAnchor`, …).
        if (ctx.propertyName !== undefined)
        {
            const enumClass =
                ENUM_MEMBERS.has(ctx.propertyName)
                    ? ctx.propertyName
                    : PROPERTY_TO_ENUM.get(ctx.propertyName);
            if (enumClass !== undefined)
            {
                const members = ENUM_MEMBERS.get(enumClass)!;
                if (!members.has(name))
                {
                    const valid = [...members].join(', ');
                    throw new EmitError(
                        `'${name}' is not a member of enum ${enumClass}. ` +
                        `Valid members: ${valid}.`,
                        val.span);
                }
                this.ensureImport(enumClass);
                return `${enumClass}.${name}`;
            }
        }
        // 3. PascalCase ident known as a class — emit as a type reference.
        if (this.startsUppercase(name) && this.symbols.has(name))
        {
            this.ensureImport(name);
            return name;
        }
        // 4. No resolution path matched. Silently emitting a bare string
        //    literal here is a footgun — it produces values like the
        //    string "Red" sitting on a Brush property, or the string
        //    "center" sitting where a number is expected, with the
        //    failure surfacing far away (NaN in layout, "undefined" in
        //    text). Force the author to be explicit: a quoted string for
        //    a string value, a `#...` literal for a colour, the right
        //    PascalCase member for an enum, or an import for a type ref.
        const hint =
            ctx.propertyName !== undefined
                ? ` (in '${ctx.propertyName}=…' position)`
                : '';
        throw new EmitError(
            `unresolved identifier '${name}'${hint}. ` +
            `Use a quoted string ("${name}") for a string value, ` +
            `'#…' for a colour, the correct enum member, ` +
            `or add an import so '${name}' resolves to a known type.`,
            val.span);
    }

    private compileColorValue(val: ColorValue): string
    {
        this.ensureImport('SolidColorBrush');
        this.ensureImport('Color');
        const raw = val.raw;
        if (this.isHexLiteral(raw))
        {
            return `new SolidColorBrush(Color.FromHex('#${raw}'))`;
        }
        // Named colour — capitalise to match Color statics (Color.Blue
        // etc.). Unknown names throw at runtime when accessed.
        const cap = raw[0]!.toUpperCase() + raw.slice(1);
        return `new SolidColorBrush(Color.${cap})`;
    }

    private compileTupleValue(tuple: TupleValue, _ctx: ValueCtx): string
    {
        // Tuples in value position default to Thickness — the spec's
        // most common case (Padding, Margin, BorderThickness,
        // CornerRadius). WPF fill-in semantics:
        //   (a)          → Thickness(a)
        //   (a, b)       → Thickness(a, b, a, b)
        //   (a, b, c, d) → Thickness(a, b, c, d)
        this.ensureImport('Thickness');
        const exprs = tuple.values.map(v => this.compileValue(v, {}));
        if (exprs.length === 1)
        {
            return `new Thickness(${exprs[0]})`;
        }
        if (exprs.length === 2)
        {
            return `new Thickness(${exprs[0]}, ${exprs[1]}, ${exprs[0]}, ${exprs[1]})`;
        }
        if (exprs.length === 4)
        {
            return `new Thickness(${exprs[0]}, ${exprs[1]}, ${exprs[2]}, ${exprs[3]})`;
        }
        throw new EmitError(
            `tuple of ${exprs.length} values has no Thickness shape (1, 2, or 4 expected)`,
            tuple.span);
    }

    // `{{ … }}` lowering. Constant body folds to a literal; reactive
    // body lowers to MultiBinding. In a Style setter context where the
    // target instance isn't yet known, the reactive form wraps in a
    // SetterFactory so each Style application gets its own per-target
    // binding (same pattern as the binding / dynamic-resource cases).
    private compileInlineExpr(val: InlineExprValue, ctx: ValueCtx): string
    {
        let result;
        try { result = lowerInlineExpr(val.raw, val.span); }
        catch (e)
        {
            if (e instanceof InlineExprError)
            {
                throw new EmitError(e.message, val.span);
            }
            throw e;
        }
        if (result.kind === 'constant')
        {
            return formatJsLiteral(result.value, val.span);
        }
        this.ensureImport('MultiBinding');
        const paths = JSON.stringify(result.paths);
        const params = result.paths.map((_, i) => `_p${i}`).join(', ');
        const converter = `(${params}) => (${result.body})`;
        if (ctx.targetExpr !== undefined)
        {
            return `MultiBinding(${ctx.targetExpr}, ${paths}, ${converter})`;
        }
        this.ensureImport('SetterFactory');
        return `new SetterFactory((_t) => MultiBinding(_t, ${paths}, ${converter}))`;
    }

    // Lower a text-mode body that contains at least one `{{ … }}` chunk.
    // All text chunks become string literals; constant-foldable
    // expression chunks become their folded value coerced to a string;
    // reactive expression chunks contribute their binding paths to a
    // shared map, and the merged converter body interleaves text +
    // expression results. Returns the emitter-ready value expression
    // (a plain string literal when everything folds, otherwise a
    // MultiBinding / SetterFactory call).
    private compileMixedTextBody(body: StringBody, ctx: ValueCtx): string
    {
        const sharedPaths = new Map<string, string>();
        const parts:        string[] = [];          // JS source fragments to concat
        const constantParts: string[] = [];          // for the all-constant fast path
        let allConstant = true;
        for (const chunk of body.chunks)
        {
            if (chunk.kind === 'text-chunk')
            {
                parts.push(JSON.stringify(chunk.text));
                constantParts.push(chunk.text);
                continue;
            }
            let result;
            try { result = lowerInlineExprWithPaths(chunk.raw, chunk.span, sharedPaths); }
            catch (e)
            {
                if (e instanceof InlineExprError)
                {
                    throw new EmitError(e.message, chunk.span);
                }
                throw e;
            }
            if (result.kind === 'constant')
            {
                const str = result.value === undefined || result.value === null
                    ? ''
                    : String(result.value);
                parts.push(JSON.stringify(str));
                constantParts.push(str);
                continue;
            }
            allConstant = false;
            // Coerce to string at conversion time so number / boolean /
            // null values join cleanly with the surrounding text.
            parts.push(`String(${result.body})`);
        }
        if (allConstant)
        {
            return JSON.stringify(constantParts.join(''));
        }
        this.ensureImport('MultiBinding');
        const paths = JSON.stringify([...sharedPaths.keys()]);
        const params = [...sharedPaths.values()].join(', ');
        const converter = `(${params}) => (${parts.join(' + ')})`;
        if (ctx.targetExpr !== undefined)
        {
            return `MultiBinding(${ctx.targetExpr}, ${paths}, ${converter})`;
        }
        this.ensureImport('SetterFactory');
        return `new SetterFactory((_t) => MultiBinding(_t, ${paths}, ${converter}))`;
    }

    // ── Helpers ────────────────────────────────────────────────────

    private requireTargetType(rf: ResourceForm): string
    {
        // Style/Template use 'TargetType'; DataTemplate (and
        // HierarchicalDataTemplate) use 'DataType'. PascalCase to
        // match the rest of the .mu attr surface.
        const name = (rf.keyword === 'DataTemplate'
                  || rf.keyword === 'HierarchicalDataTemplate')
            ? 'DataType'
            : 'TargetType';
        const m = rf.metaAttrs.find(
            a => a.path.parts.length === 1 && a.path.parts[0] === name);
        if (m === undefined)
        {
            throw new EmitError(
                `${rf.keyword}: missing required '${name}' meta-attr`, rf.span);
        }
        if (m.value.kind !== 'ident')
        {
            throw new EmitError(
                `${name} must be a type reference (PascalCase identifier)`,
                m.span);
        }
        return m.value.name;
    }

    // Read a named meta-attr by name from a resource form. Returns
    // undefined when the attr is absent. Used for optional meta-attrs
    // like HierarchicalDataTemplate's `itemsselector=PropertyName`.
    private findIdentMetaAttr(rf: ResourceForm, name: string): string | undefined
    {
        const m = rf.metaAttrs.find(
            a => a.path.parts.length === 1 && a.path.parts[0] === name);
        if (m === undefined) return undefined;
        if (m.value.kind !== 'ident')
        {
            throw new EmitError(
                `${name} must be an identifier (property name)`,
                m.span);
        }
        return m.value.name;
    }

    // Process the x:* attribute set on an element after construction:
    //   * x:root  — install a fresh NameScope on the element so x:name
    //                lookups from anywhere in the subtree resolve here.
    //                Also pins this variable as the active scope owner
    //                so descendants emit Register() calls against it.
    //   * x:name  — set the Visual's `Name` field and register it in
    //                the current scope owner's NameScope. Requires an
    //                enclosing x:root somewhere up the lexical tree.
    //
    // The resource-element wiring (x:key registration in a
    // ResourceDictionary, x:root assignment to `rd.Root`) is handled
    // separately by compileResourceElement; this method covers the
    // tree-walk-time concerns shared by every element.
    private applyXAttrs(v: string, elem: ElementNode): void
    {
        const xRoot = this.findXAttr(elem.xAttrs, 'root');
        if (xRoot !== null)
        {
            this.ensureImport('NameScope');
            this.line(`${v}.SetNameScope(new NameScope());`);
            this.nameScopeOwnerVar = v;
        }

        const xName = this.findXAttr(elem.xAttrs, 'name');
        if (xName !== null)
        {
            if (xName.value === null || xName.value.kind !== 'string')
            {
                throw new EmitError(
                    'x:name requires a string literal value', xName.span);
            }
            const nameLit = JSON.stringify(xName.value.value);
            const nameStr = xName.value.value as string;
            this.line(`${v}.Name = ${nameLit};`);
            // Track inside the active DataTemplate's name scope so
            // setter LHS resolution in trigger blocks can route names
            // through TargetedSetter. Recorded BEFORE the inTemplateBody
            // early-out so DataTemplate bodies (which also set
            // inTemplateBody for the ControlTemplate case) capture the
            // entry. Note: ControlTemplate factories never carry a
            // templateNameScope (it's only set inside compileDataTemplateForm),
            // so this is a no-op for those.
            if (this.templateNameScope !== undefined)
            {
                this.templateNameScope.add(nameStr);
                this.templateNameOwners!.set(nameStr, elem.name);
                this.templateNameVars!.set(nameStr, v);
            }
            // Inside a template body, ControlTemplate.Apply walks the
            // freshly-built subtree and registers every named visual in
            // the template's NameScope — so the factory itself must NOT
            // emit a Register() call (no enclosing x:root exists; the
            // scope is created at Apply time, not at factory-emit time).
            if (this.inTemplateBody) return;
            if (this.nameScopeOwnerVar === undefined)
            {
                throw new EmitError(
                    'x:name requires an enclosing x:root element to provide a NameScope',
                    xName.span);
            }
            // The runtime exposes the per-instance NameScope through
            // the `nameScope` getter (no setter); SetNameScope above
            // guarantees it's non-undefined here.
            this.line(
                `${this.nameScopeOwnerVar}.nameScope.Register(${nameLit}, ${v});`);
        }
    }

    private findXAttr(xAttrs: XAttr[], name: string): XAttr | null
    {
        return xAttrs.find(x => x.name === name) ?? null;
    }

    private attrPathOwner(targetType: string, path: AttrPath): string
    {
        return (path.parts.length === 2) ? path.parts[0]! : targetType;
    }

    private attrPathProperty(path: AttrPath): string
    {
        return path.parts[path.parts.length - 1]!;
    }

    private ensureImport(symbol: string): void
    {
        const mod = this.symbols.get(symbol);
        if (mod === undefined)
        {
            throw new EmitError(
                `unknown symbol '${symbol}' — not in the compiler's symbol table`);
        }
        let s = this.imports.get(mod);
        if (s === undefined)
        {
            s = new Set();
            this.imports.set(mod, s);
        }
        s.add(symbol);
    }

    private fresh(hint: string): string
    {
        return `_${hint}${this.varCounter++}`;
    }

    private varHint(className: string): string
    {
        return className[0]!.toLowerCase() + className.slice(1);
    }

    private line(s: string): void
    {
        this.lines.push(this.indent > 0 ? ' '.repeat(this.indent) + s : s);
    }

    private startsUppercase(name: string): boolean
    {
        const c = name.charCodeAt(0);
        return c >= 65 && c <= 90;
    }

    private isHexLiteral(raw: string): boolean
    {
        if (raw.length !== 3 && raw.length !== 4
            && raw.length !== 6 && raw.length !== 8)
        {
            return false;
        }
        return /^[0-9a-fA-F]+$/.test(raw);
    }
}

