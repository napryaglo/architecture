import type {
    Attribute,
    AttrPath,
    BodyItem,
    ColorValue,
    DefForm,
    Document,
    ElementNode,
    IdentValue,
    InlineExprValue,
    KeyValueResource,
    PropertySetter,
    ResourceForm,
    SlotAssign,
    StringBody,
    StructuredBody,
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
// TriggerOr / TriggerTerm tree into a list of (property, value, negated)
// records, each emitted as its own PropertyTrigger sharing the setter
// list of the surrounding TriggerGroup.
interface TriggerTermLite
{
    property: string;
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
    ENUM_CLASSES,
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
        this.symbols = opts.symbols ?? DEFAULT_SYMBOLS;
        this.slots   = opts.slots   ?? DEFAULT_SLOT_INFO;
    }

    public Compile(doc: Document): CompilerOutput
    {
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

        // Pass 2: locate the root element. Top-level resource forms
        // are v0-deferred; imports are silently ignored.
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
                    'compile: top-level resource forms are not supported in v0',
                    form.span);
            }
            // import / def silently consumed.
        }
        if (root === undefined)
        {
            throw new EmitError(
                'compile: source has no top-level element to emit', doc.span);
        }

        const isApp = (root.name === 'Application');
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
        if (rf.keyword === 'style')
        {
            const styleVar = this.compileStyleForm(rf);
            this.registerResourceFormVar(rdVar, rf, styleVar, /*allowImplicit*/ true);
            return;
        }
        if (rf.keyword === 'template')
        {
            const tmplVar = this.compileControlTemplateForm(rf);
            this.registerResourceFormVar(rdVar, rf, tmplVar, /*allowImplicit*/ false);
            return;
        }
        if (rf.keyword === 'datatemplate')
        {
            const tmplVar = this.compileDataTemplateForm(rf);
            this.registerResourceFormVar(rdVar, rf, tmplVar, /*allowImplicit*/ false);
            return;
        }
        throw new EmitError(
            `unknown resource form '${rf.keyword}'`, rf.span);
    }

    // Helper: register a freshly-built resource (style / template /
    // datatemplate) in the dictionary by x:key (string) or, when the
    // form supports implicit registration (style only — see spec §7),
    // by TargetType (Function).
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
        const rootVar = this.compileElement(rf.body);
        this.inTemplateBody = wasInTemplate;
        this.line(`return ${rootVar};`);
        this.indent -= 4;
        this.line(`});`);
        return tmplVar;
    }

    private compileDataTemplateForm(rf: ResourceForm): string
    {
        if (rf.body.kind !== 'element')
        {
            throw new EmitError(
                'datatemplate body must be a single element', rf.span);
        }
        // Same as ControlTemplate — DataType is metadata for the spec
        // but isn't carried by the runtime DataTemplate. Required for
        // author clarity.
        this.requireTargetType(rf);

        this.ensureImport('DataTemplate');
        const tmplVar = this.fresh('tmpl');
        this.line(`const ${tmplVar} = new DataTemplate((_data) => {`);
        this.indent += 4;
        // DataTemplate's factory binds the data argument, not a
        // templated parent. $$Property doesn't apply here — leave
        // inTemplateBody false so an authoring slip raises a clear
        // error. ($Path uses _data via the visual's DataContext, which
        // a caller would have to set; that's a separate concern.)
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
        for (const item of rf.body.items)
        {
            if (item.kind === 'property-setter')
            {
                setterVars.push(this.compileSetter(tt, item));
            }
            else
            {
                const out = this.compileTriggerGroup(tt, item);
                triggerVars.push(...out.propertyTriggers);
                multiTriggerVars.push(...out.multiTriggers);
            }
        }
        const settersArr       = `[${setterVars.join(', ')}]`;
        const triggersArr      = `[${triggerVars.join(', ')}]`;
        const multiTriggersArr = `[${multiTriggerVars.join(', ')}]`;

        const styleVar = this.fresh('style');
        // Style(targetType, setters, basedOn, triggers, multiTriggers).
        this.line(
            `const ${styleVar} = new Style(${tt}, ${settersArr}, undefined, ${triggersArr}, ${multiTriggersArr});`);
        return styleVar;
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
    ): { propertyTriggers: string[]; multiTriggers: string[] }
    {
        this.ensureImport(targetType);

        // Flatten the trigger expression to DNF — a list of conjuncts,
        // each of which is a list of TriggerTerms ANDed together.
        // Single-term conjuncts emit as PropertyTrigger; multi-term
        // conjuncts emit as MultiTrigger.
        const disjuncts = this.flattenToDNF(tg.condition);

        // Setters built once, stashed in a local var so every Property/
        // Multi trigger emitted here shares the same array instance.
        const setterVars: string[] = [];
        for (const item of tg.setters.items)
        {
            if (item.kind !== 'property-setter')
            {
                throw new EmitError(
                    'nested triggers are not supported', item.span);
            }
            setterVars.push(this.compileSetter(targetType, item));
        }
        const settersArrVar = this.fresh('sArr');
        this.line(`const ${settersArrVar} = [${setterVars.join(', ')}];`);

        const propertyTriggers: string[] = [];
        const multiTriggers:    string[] = [];

        for (const conjunct of disjuncts)
        {
            if (conjunct.length === 1)
            {
                this.ensureImport('PropertyTrigger');
                const term = conjunct[0]!;
                const valueExpr = this.evaluateTermValue(term);
                const v = this.fresh('trigger');
                this.line(
                    `const ${v} = new PropertyTrigger(${targetType}, ${JSON.stringify(term.property)}, ${valueExpr}, ${settersArrVar});`);
                propertyTriggers.push(v);
            }
            else
            {
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
                    `const ${v} = new MultiTrigger([${conditionExprs.join(', ')}], ${settersArrVar});`);
                multiTriggers.push(v);
            }
        }
        return { propertyTriggers, multiTriggers };
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
            return [[{ property: expr.property, value: expr.value,
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
                    `${v}.set_property_value(${JSON.stringify(slot.name)}, ${JSON.stringify(text)});`);
            }
            else
            {
                const expr = this.compileMixedTextBody(elem.body, { targetExpr: v });
                this.line(
                    `${v}.set_property_value(${JSON.stringify(slot.name)}, ${expr});`);
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
                `${targetVar}.set_property_value(${ownerType}, ${JSON.stringify(propName)}, ${valueExpr});`);
            return;
        }
        const propName = attr.path.parts[0]!;
        const valueExpr = this.compileValue(attr.value, {
            propertyName: propName,
            targetExpr:   targetVar,
        });
        this.line(
            `${targetVar}.set_property_value(${JSON.stringify(propName)}, ${valueExpr});`);
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
                    `${parentVar}.set_property_value(${JSON.stringify(item.name)}, ${expr});`);
                continue;
            }
            if (item.kind === 'element')
            {
                const childVar = this.compileElement(item);
                this.assignToDefaultSlot(parentVar, parentClass, slot, childVar, item.span);
                continue;
            }
            throw new EmitError(
                `${item.kind} is not allowed in an element body`,
                'span' in item ? item.span : body.span);
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
        // 1. Property-name match against an enum class — emit ClassName.Member.
        if (ctx.propertyName !== undefined && ENUM_CLASSES.has(ctx.propertyName))
        {
            this.ensureImport(ctx.propertyName);
            return `${ctx.propertyName}.${name}`;
        }
        // 2. PascalCase ident known as a class — emit as a type reference.
        if (this.startsUppercase(name) && this.symbols.has(name))
        {
            this.ensureImport(name);
            return name;
        }
        // 3. Fallback — bare string literal. Lowercase enum-like values
        // (left, center) land here and the runtime's converters handle
        // them at property-set time.
        return JSON.stringify(name);
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
        // Style/Template use 'targettype'; DataTemplate uses 'datatype'.
        const name = (rf.keyword === 'datatemplate') ? 'datatype' : 'targettype';
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

