import { Lexer } from './lexer.js';
import {
    TokenKind,
    type SourceLocation,
    type SourceSpan,
    type Token,
} from './tokens.js';
import type {
    AnimationDecl,
    Attribute,
    AttrPath,
    BeginStoryboardNode,
    BindingValue,
    InvokeCommandNode,
    PauseStoryboardNode,
    ResumeStoryboardNode,
    StopStoryboardNode,
    BodyItem,
    ColorValue,
    DataTemplateBody,
    Document,
    DefForm,
    DynamicResourceValue,
    ElementNode,
    EventTriggerGroup,
    IdentValue,
    ImportForm,
    InlineExprValue,
    KeyValueResource,
    ListValue,
    MacroHoleValue,
    MacroParam,
    NamedAttr,
    NumberValue,
    PropertySetter,
    ResourceForm,
    SetterItem,
    SetterList,
    SizeValue,
    SlotAssign,
    StaticResourceValue,
    StringBody,
    StringBodyChunk,
    StringValue,
    StructuredBody,
    TemplateBindingValue,
    TopForm,
    TriggerActionNode,
    TriggerExpr,
    TriggerGroup,
    TupleValue,
    ValueNode,
    XAttr,
} from './ast.js';

// Errors carry the source span so callers can render line:col diagnostics.
export class ParseError extends Error
{
    public readonly span: SourceSpan;
    constructor(message: string, span: SourceSpan)
    {
        super(`${message} (at ${span.start.line}:${span.start.column})`);
        this.span = span;
    }
}

const RESOURCE_KEYWORDS = new Set([
    'Style', 'Template', 'DataTemplate',
    'HierarchicalDataTemplate', 'ItemsPanelTemplate',
]);

// Subset of RESOURCE_KEYWORDS that produce a *template* value (something
// invoked at apply time) — these are accepted both as keyed entries in a
// ResourceDictionary AND as inline values of a slot-assign (e.g.,
// `ItemsPanel: ItemsPanelTemplate { … }`). `Style` is excluded: styles
// only ever live as keyed dictionary entries today.
const INLINE_TEMPLATE_KEYWORDS = new Set([
    'Template', 'DataTemplate',
    'HierarchicalDataTemplate', 'ItemsPanelTemplate',
]);

export interface ParserOptions
{
    // Called by the parser when it sees `Name{` to decide whether the
    // body should be parsed in text mode (string slot — Lexer.NextTextChunk)
    // or structured mode (default — element list with SlotAssigns).
    // Returning `true` switches the lexer into text mode for that body.
    // Default: always `false` (structured).
    isStringBody?: (controlName: string) => boolean;
}

// Recursive-descent parser. Two-token lookahead via a small ring buffer
// — enough to disambiguate SlotAssign (`Ident Colon`) from Element
// (`Ident LBracket|LBrace|<anything else>`).
//
// Scope: structural mode only. Text-mode bodies (TextBlock{Hello world})
// require the parser to switch the lexer into text mode at the right
// `{`; that hook lives in a future phase along with the control-default-
// slot registry. For now, string content must be expressed as an
// attribute (`TextBlock[Text="Hello"]`).
export class Parser
{
    private readonly lexer: Lexer;
    private readonly buffer: Token[] = [];
    private readonly isStringBody: (name: string) => boolean;

    constructor(source: string, options: ParserOptions = {})
    {
        this.lexer = new Lexer(source);
        this.isStringBody = options.isStringBody ?? (() => false);
    }

    // ── Public entry ────────────────────────────────────────────────

    public ParseDocument(): Document
    {
        const start = this.peek().span.start;
        const forms: TopForm[] = [];
        while (this.peek().kind !== TokenKind.EOF)
        {
            forms.push(this.parseTopForm());
        }
        const end = this.peek().span.end;
        return { kind: 'document', forms, span: this.span(start, end) };
    }

    // ── Top-level dispatch ──────────────────────────────────────────

    private parseTopForm(): TopForm
    {
        const tk = this.peek();
        if (tk.kind === TokenKind.Ident)
        {
            switch (tk.value)
            {
                case 'import':       return this.parseImport();
                case 'def':          return this.parseDefForm();
                case 'Style':
                case 'Template':
                case 'DataTemplate':
                case 'HierarchicalDataTemplate':
                case 'ItemsPanelTemplate': return this.parseResourceForm();
                default:             return this.parseElement();
            }
        }
        throw new ParseError(`unexpected token '${tk.value}' at top level`, tk.span);
    }

    private parseImport(): ImportForm
    {
        const start = this.expectIdent('import').span.start;
        const name  = this.expect(TokenKind.Ident).value;
        let source: string | null = null;
        if (this.peek().kind === TokenKind.Ident && this.peek().value === 'from')
        {
            this.consume();
            source = this.expect(TokenKind.String).value;
        }
        const end = this.lastEnd();
        return { kind: 'import', name, source, span: this.span(start, end) };
    }

    private parseDefForm(): DefForm
    {
        const start = this.expectIdent('def').span.start;
        const name  = this.expect(TokenKind.Ident).value;
        this.expect(TokenKind.LBracket);
        const params = this.parseMacroParamList();
        this.expect(TokenKind.RBracket);
        this.expect(TokenKind.LBrace);
        const body = this.parseElement();
        this.expect(TokenKind.RBrace);
        const end = this.lastEnd();
        return { kind: 'def', name, params, body, span: this.span(start, end) };
    }

    private parseMacroParamList(): MacroParam[]
    {
        const out: MacroParam[] = [];
        if (this.peek().kind === TokenKind.RBracket) return out;
        for (;;)
        {
            out.push(this.parseMacroParam());
            if (this.peek().kind === TokenKind.Comma) { this.consume(); continue; }
            break;
        }
        return out;
    }

    private parseMacroParam(): MacroParam
    {
        const tk    = this.expect(TokenKind.HashBody);
        const holeName   = tk.value;
        const positional = /^[0-9]+$/.test(holeName);

        let typeRef: string | null = null;
        if (this.peek().kind === TokenKind.Colon)
        {
            this.consume();
            typeRef = this.expect(TokenKind.Ident).value;
        }
        let defaultValue: ValueNode | null = null;
        if (this.peek().kind === TokenKind.Equals)
        {
            this.consume();
            defaultValue = this.parseValue();
        }
        const end = this.lastEnd();
        return {
            kind: 'macro-param',
            holeName,
            positional,
            typeRef,
            defaultValue,
            span: this.span(tk.span.start, end),
        };
    }

    // ── Resource forms ──────────────────────────────────────────────

    private parseResourceForm(): ResourceForm
    {
        const head    = this.expect(TokenKind.Ident);
        const keyword = head.value as 'Style' | 'Template' | 'DataTemplate' | 'HierarchicalDataTemplate' | 'ItemsPanelTemplate';
        if (!RESOURCE_KEYWORDS.has(keyword))
        {
            throw new ParseError(`expected resource keyword, got '${keyword}'`, head.span);
        }

        // Scope extensions (`x:key`, future `x:*`) lead — read before
        // the `[ … ]` block, mirroring parseElement.
        const xAttrs = this.parseLeadingXAttrs();

        // The `[ meta=value, … ]` block is OPTIONAL — `Template` /
        // `DataTemplate` / `HierarchicalDataTemplate` need it (TargetType /
        // DataType / itemsselector are required there), but
        // `ItemsPanelTemplate` and inline-only forms have no required
        // meta-attrs, so the bracket pair can be omitted entirely. The
        // compiler validates required meta-attrs per-keyword downstream.
        const metaAttrs: NamedAttr[] = [];
        if (this.peek().kind === TokenKind.LBracket)
        {
            this.consume();
            const attrs = this.parseAttrListBody();
            this.expect(TokenKind.RBracket);
            // Resource form meta-attrs are named only; positionals are a
            // syntactic error at this point.
            for (const a of attrs)
            {
                if (a.kind === 'named-attr') metaAttrs.push(a);
                else throw new ParseError(
                    'resource forms do not accept positional attributes', a.span);
            }
        }

        this.expect(TokenKind.LBrace);
        let body: SetterList | ElementNode | DataTemplateBody;
        if (keyword === 'Style')
        {
            body = this.parseSetterList();
        }
        else if (keyword === 'DataTemplate' || keyword === 'HierarchicalDataTemplate' || keyword === 'Template')
        {
            // Trailing trigger groups / event triggers are allowed after
            // the root element — WPF parity for DataTemplate.Triggers
            // AND ControlTemplate.Triggers. For Template (ControlTemplate),
            // the triggers' default source is the templated parent (the
            // control being templated), so `when(IsSelected) {
            // PART_Border.Background = …; }` inside a `Template
            // [TargetType=ListBoxItem]` watches the ListBoxItem's
            // IsSelected and writes to the named PART_Border via
            // TargetedSetter. Same body shape downstream — the
            // resource-form keyword discriminates the trigger-source
            // resolution in the compiler / runtime.
            //
            // When NO trailing triggers are present, the body collapses
            // to the single-element shape — preserves snapshot stability
            // for existing trigger-free templates.
            const bodyStart = this.peek().span.start;
            const root = this.parseElement();
            const triggers:      TriggerGroup[]      = [];
            const eventTriggers: EventTriggerGroup[] = [];
            while (this.peek().kind === TokenKind.Ident)
            {
                const ident = this.peek();
                if (ident.value === 'when')
                {
                    triggers.push(this.parseTriggerGroup());
                    continue;
                }
                if (ident.value === 'on')
                {
                    eventTriggers.push(this.parseEventTriggerGroup());
                    continue;
                }
                break;
            }
            // Skip optional trailing semicolons between trigger blocks
            // and the closing brace, mirroring setter-list / when()
            // trailing-`;` tolerance.
            while (this.peek().kind === TokenKind.Semicolon) this.consume();
            if (triggers.length === 0 && eventTriggers.length === 0)
            {
                body = root;
            }
            else
            {
                const bodyEnd = this.lastEnd();
                body = {
                    kind:          'data-template-body',
                    root,
                    triggers,
                    eventTriggers,
                    span:          this.span(bodyStart, bodyEnd),
                };
            }
        }
        else
        {
            body = this.parseElement();
        }
        const rbrace = this.expect(TokenKind.RBrace);
        return {
            kind:    'resource-form',
            keyword,
            metaAttrs,
            xAttrs,
            body,
            span:    this.span(head.span.start, rbrace.span.end),
        };
    }

    // ── Setter list (inside a style body) ──────────────────────────

    private parseSetterList(): SetterList
    {
        const start = this.peek().span.start;
        const items: SetterItem[] = [];
        while (this.peek().kind !== TokenKind.RBrace
            && this.peek().kind !== TokenKind.EOF)
        {
            items.push(this.parseSetterItem());
        }
        const end = this.lastEnd();
        return { kind: 'setter-list', items, span: this.span(start, end) };
    }

    private parseSetterItem(): SetterItem
    {
        const tk = this.peek();
        if (tk.kind === TokenKind.Ident && tk.value === 'when')
        {
            return this.parseTriggerGroup();
        }
        if (tk.kind === TokenKind.Ident && tk.value === 'on')
        {
            return this.parseEventTriggerGroup();
        }
        if (tk.kind === TokenKind.Ident && tk.value === 'Behaviors'
            && this.peek(1).kind === TokenKind.LBrace)
        {
            return this.parseBehaviorsBlock();
        }
        return this.parsePropertySetter();
    }

    // `Behaviors { BehaviorClass[Foo=…] BehaviorClass2[…] }` inside a
    // `when()` trigger body. Each child is a Behavior class invocation
    // (parsed via the normal element parser). Compiler lowers each into
    // an AttachBehaviorAction / DetachBehaviorAction pair on the
    // trigger's enter / exit edges. A `Behaviors { … }` block at Style
    // body level (outside any trigger) is rejected by the compiler —
    // the parser still accepts it so the error message points at the
    // emit phase rather than a parser confusion.
    private parseBehaviorsBlock(): import('./ast.js').BehaviorsBlock
    {
        const start = this.expectIdent('Behaviors').span.start;
        this.expect(TokenKind.LBrace);
        const entries: ElementNode[] = [];
        while (this.peek().kind !== TokenKind.RBrace
            && this.peek().kind !== TokenKind.EOF)
        {
            entries.push(this.parseElement());
        }
        const closer = this.expect(TokenKind.RBrace);
        // Trailing semicolon is consistent with on{} / when{} blocks.
        if (this.peek().kind === TokenKind.Semicolon) this.consume();
        return {
            kind:    'behaviors-block',
            entries,
            span:    this.span(start, closer.span.end),
        };
    }

    // `on EventName { TriggerAction-list }` — declarative routed-event
    // trigger. Currently EventName accepts any bare identifier; the
    // runtime maps the string to a concrete subscription (Click maps to
    // Button.AddClickHandler; other names get a runtime warning).
    private parseEventTriggerGroup(): EventTriggerGroup
    {
        const start     = this.expectIdent('on').span.start;
        const eventName = this.expect(TokenKind.Ident).value;
        this.expect(TokenKind.LBrace);
        const actions: TriggerActionNode[] = [];
        while (this.peek().kind !== TokenKind.RBrace
            && this.peek().kind !== TokenKind.EOF)
        {
            actions.push(this.parseTriggerAction());
        }
        const closer = this.expect(TokenKind.RBrace);
        // Trailing `;` accepted for visual consistency with `when{}`.
        if (this.peek().kind === TokenKind.Semicolon) this.consume();
        return {
            kind: 'event-trigger',
            eventName,
            actions,
            span: this.span(start, closer.span.end),
        };
    }

    private parseTriggerAction(): TriggerActionNode
    {
        const tk = this.peek();
        if (tk.kind === TokenKind.Ident)
        {
            if (tk.value === 'BeginStoryboard')  return this.parseBeginStoryboard();
            if (tk.value === 'StopStoryboard')   return this.parseStopStoryboard();
            if (tk.value === 'PauseStoryboard')  return this.parsePauseStoryboard();
            if (tk.value === 'ResumeStoryboard') return this.parseResumeStoryboard();
            if (tk.value === 'InvokeCommand')    return this.parseInvokeCommand();
        }
        throw new ParseError(
            `expected BeginStoryboard / StopStoryboard / PauseStoryboard / ResumeStoryboard / InvokeCommand inside event-trigger body; got '${tk.value}'`,
            tk.span);
    }

    // `InvokeCommand[Command=$SaveCommand]` — one required attribute,
    // Command, holding a binding to an ICommand on the firing Visual's
    // DataContext. No body. The compiler lowers this to
    // `new InvokeCommandAction((target) => <bound command>)`.
    private parseInvokeCommand(): InvokeCommandNode
    {
        const start = this.expectIdent('InvokeCommand').span.start;
        const lbracket = this.peek();
        if (lbracket.kind !== TokenKind.LBracket)
        {
            throw new ParseError(
                'InvokeCommand requires a [Command=...] attribute',
                lbracket.span);
        }
        this.expect(TokenKind.LBracket);
        const attrs = this.parseAttrListBody();
        const closer = this.expect(TokenKind.RBracket);
        if (attrs.length !== 1)
        {
            throw new ParseError(
                'InvokeCommand requires exactly one attribute: Command',
                lbracket.span);
        }
        const attr = attrs[0]!;
        if (attr.kind !== 'named-attr' || attr.path.parts.length !== 1
            || attr.path.parts[0] !== 'Command')
        {
            throw new ParseError(
                'InvokeCommand only accepts the Command attribute',
                attr.span);
        }
        return {
            kind:    'invoke-command',
            command: attr.value,
            span:    this.span(start, closer.span.end),
        };
    }

    // `BeginStoryboard [Name="fade"] { Animation[…] Animation[…] }` — the
    // `[Name=…]` attribute block is optional. Without it the storyboard
    // is anonymous (no Stop/Pause/Resume target).
    private parseBeginStoryboard(): BeginStoryboardNode
    {
        const start = this.expectIdent('BeginStoryboard').span.start;
        const name  = this.parseOptionalNamedActionAttrs('BeginStoryboard');
        this.expect(TokenKind.LBrace);
        const animations: AnimationDecl[] = [];
        while (this.peek().kind !== TokenKind.RBrace
            && this.peek().kind !== TokenKind.EOF)
        {
            animations.push(this.parseAnimationDecl());
        }
        const closer = this.expect(TokenKind.RBrace);
        return {
            kind: 'begin-storyboard',
            name,
            animations,
            span: this.span(start, closer.span.end),
        };
    }

    private parseStopStoryboard(): StopStoryboardNode
    {
        const start = this.expectIdent('StopStoryboard').span.start;
        const name  = this.parseRequiredNamedActionAttrs('StopStoryboard');
        const end   = this.lastEnd();
        return { kind: 'stop-storyboard', name, span: this.span(start, end) };
    }

    private parsePauseStoryboard(): PauseStoryboardNode
    {
        const start = this.expectIdent('PauseStoryboard').span.start;
        const name  = this.parseRequiredNamedActionAttrs('PauseStoryboard');
        const end   = this.lastEnd();
        return { kind: 'pause-storyboard', name, span: this.span(start, end) };
    }

    private parseResumeStoryboard(): ResumeStoryboardNode
    {
        const start = this.expectIdent('ResumeStoryboard').span.start;
        const name  = this.parseRequiredNamedActionAttrs('ResumeStoryboard');
        const end   = this.lastEnd();
        return { kind: 'resume-storyboard', name, span: this.span(start, end) };
    }

    // Common `[Name=...]` block parser shared between BeginStoryboard
    // (optional) and Stop / Pause / ResumeStoryboard (required). The
    // attribute list is restricted to a single `Name` named attr with a
    // string or bare-ident value — anything else throws.
    private parseOptionalNamedActionAttrs(actionKind: string): string | undefined
    {
        if (this.peek().kind !== TokenKind.LBracket) return undefined;
        return this.parseRequiredNamedActionAttrs(actionKind);
    }

    private parseRequiredNamedActionAttrs(actionKind: string): string
    {
        const tk = this.peek();
        if (tk.kind !== TokenKind.LBracket)
        {
            throw new ParseError(
                `${actionKind} requires a [Name=...] attribute`,
                tk.span);
        }
        const lbracket = this.expect(TokenKind.LBracket);
        const attrs    = this.parseAttrListBody();
        this.expect(TokenKind.RBracket);
        if (attrs.length !== 1)
        {
            throw new ParseError(
                `${actionKind} requires exactly one attribute [Name=...]`,
                lbracket.span);
        }
        const attr = attrs[0]!;
        if (attr.kind !== 'named-attr' || attr.path.parts.length !== 1
            || attr.path.parts[0] !== 'Name')
        {
            throw new ParseError(
                `${actionKind} only accepts the Name attribute`,
                attr.span);
        }
        if (attr.value.kind !== 'string' && attr.value.kind !== 'ident')
        {
            throw new ParseError(
                `${actionKind} Name must be a string or bare identifier`,
                attr.value.span);
        }
        return attr.value.kind === 'string' ? attr.value.value : attr.value.name;
    }

    private parseAnimationDecl(): AnimationDecl
    {
        const head = this.expect(TokenKind.Ident);
        // `[attr=value, …]` block — required so animations always carry
        // at least a TargetProperty.
        if (this.peek().kind !== TokenKind.LBracket)
        {
            throw new ParseError(
                `animation '${head.value}' requires an attribute block — at minimum [TargetProperty=...]`,
                head.span);
        }
        this.expect(TokenKind.LBracket);
        const attrs = this.parseAttrListBody();
        const closer = this.expect(TokenKind.RBracket);
        return {
            kind:      'animation-decl',
            className: head.value,
            attrs,
            span:      this.span(head.span.start, closer.span.end),
        };
    }

    // Setter terminator: PropertySetters are required to end with `;`,
    // TriggerGroups end naturally with `}` and tolerate an optional
    // trailing `;` for consistency. The setter list driver consumes
    // any trailing `;` after a trigger so neither shape forces a
    // particular style on the author.
    private parsePropertySetter(): PropertySetter
    {
        const path  = this.parseAttrPath();
        this.expect(TokenKind.Equals);
        const value = this.parseValue();
        this.expect(TokenKind.Semicolon);
        const end   = this.lastEnd();
        return {
            kind: 'property-setter',
            path,
            value,
            span: this.span(path.span.start, end),
        };
    }

    private parseTriggerGroup(): TriggerGroup
    {
        const start = this.expectIdent('when').span.start;
        // Condition in `(…)` — reads like an `if` predicate, separates
        // the trigger condition from the setter block visually.
        this.expect(TokenKind.LParen);
        const condition = this.parseTriggerExpr();
        this.expect(TokenKind.RParen);
        this.expect(TokenKind.LBrace);
        const setters = this.parseSetterList();
        const closer  = this.expect(TokenKind.RBrace);
        // Optional trailing `;` after the trigger block.
        if (this.peek().kind === TokenKind.Semicolon) this.consume();
        return {
            kind: 'trigger-group',
            condition,
            setters,
            span: this.span(start, closer.span.end),
        };
    }

    private parseTriggerExpr(): TriggerExpr
    {
        return this.parseTriggerOr();
    }

    private parseTriggerOr(): TriggerExpr
    {
        let left = this.parseTriggerAnd();
        while (this.peek().kind === TokenKind.Ident && this.peek().value === 'or')
        {
            this.consume();
            const right = this.parseTriggerAnd();
            left = { kind: 'trigger-or', left, right, span: this.span(left.span.start, right.span.end) };
        }
        return left;
    }

    private parseTriggerAnd(): TriggerExpr
    {
        let left = this.parseTriggerTerm();
        while (this.peek().kind === TokenKind.Ident && this.peek().value === 'and')
        {
            this.consume();
            const right = this.parseTriggerTerm();
            left = { kind: 'trigger-and', left, right, span: this.span(left.span.start, right.span.end) };
        }
        return left;
    }

    private parseTriggerTerm(): TriggerExpr
    {
        const tk = this.peek();
        if (tk.kind === TokenKind.LParen)
        {
            this.consume();
            const expr = this.parseTriggerExpr();
            this.expect(TokenKind.RParen);
            return expr;
        }
        let negated = false;
        if (tk.kind === TokenKind.Ident && tk.value === 'not')
        {
            this.consume();
            negated = true;
        }
        // `$Path` or `$Path.tail` — DataTrigger form. Resolves against
        // the styled target's DataContext, mirroring binding syntax in
        // attribute values. Same dotted-path tail as $-bindings.
        let property: string | undefined;
        let path:     string | undefined;
        let startTk:  Token = tk;
        if (this.peek().kind === TokenKind.Dollar)
        {
            const dollar = this.consume();
            startTk = dollar;
            const firstSeg = this.expect(TokenKind.Ident).value;
            const segments: string[] = [firstSeg];
            while (this.peek().kind === TokenKind.Dot)
            {
                this.consume();
                segments.push(this.expect(TokenKind.Ident).value);
            }
            path = segments.join('.');
        }
        else
        {
            const idTk = this.expect(TokenKind.Ident);
            property = idTk.value;
        }
        let value: ValueNode | null = null;
        if (this.peek().kind === TokenKind.Equals)
        {
            this.consume();
            value = this.parseValue();
        }
        const end = this.lastEnd();
        return {
            kind: 'trigger-term',
            negated,
            property,
            path,
            value,
            span: this.span(startTk.span.start, end),
        };
    }

    // ── Element / attributes ────────────────────────────────────────

    private parseElement(): ElementNode
    {
        const head   = this.expect(TokenKind.Ident);
        // Scope extensions (`x:key="…"`, `x:root`, …) live between the
        // element name and the `[ … ]` block. The bracket list is
        // strictly property assignments after this change.
        const xAttrs = this.parseLeadingXAttrs();
        const attrs: Attribute[] = [];
        if (this.peek().kind === TokenKind.LBracket)
        {
            this.consume();
            attrs.push(...this.parseAttrListBody());
            this.expect(TokenKind.RBracket);
        }
        let body: StructuredBody | StringBody | null = null;
        if (this.peek().kind === TokenKind.LBrace)
        {
            this.consume();
            if (this.isStringBody(head.value))
            {
                body = this.parseStringBody();
            }
            else
            {
                body = this.parseStructuredBody();
            }
            this.expect(TokenKind.RBrace);
        }
        const end = this.lastEnd();
        return {
            kind: 'element',
            name: head.value,
            xAttrs,
            attrs,
            body,
            span: this.span(head.span.start, end),
        };
    }

    // Read zero or more leading XAttrs (`x:foo` flag-style, or
    // `x:foo = value`) appearing between a form keyword / element name
    // and the optional `[ … ]` attribute block. Stops at the first
    // non-ScopeExt token. Used by parseElement and parseResourceForm.
    private parseLeadingXAttrs(): XAttr[]
    {
        const out: XAttr[] = [];
        while (this.peek().kind === TokenKind.ScopeExt)
        {
            const tk = this.consume();
            let value: ValueNode | null = null;
            if (this.peek().kind === TokenKind.Equals)
            {
                this.consume();
                value = this.parseValue();
            }
            const end = this.lastEnd();
            out.push({
                kind: 'x-attr',
                name: tk.value,
                value,
                span: this.span(tk.span.start, end),
            });
        }
        return out;
    }

    // Text-mode body. Entered right after `{`; the buffer MUST be
    // empty here (peeking past LBrace would have lexed structural
    // tokens past the text). Loop pulls TextRun chunks from the lexer
    // until NextTextChunk reports an upcoming `}`. We deliberately
    // DO NOT push the RBrace onto the buffer or advance past it —
    // NextTextChunk peeks the close without consuming the source
    // character, so the next structural call (expect(RBrace) in the
    // caller) will see the same `}` and advance over it normally.
    private parseStringBody(): StringBody
    {
        if (this.buffer.length > 0)
        {
            // Defensive: the surrounding parser shouldn't peek between
            // consuming `{` and calling parseStringBody. If it did, we'd
            // be re-lexing past where the structural tokens already are.
            throw new ParseError(
                'internal: lookahead buffer non-empty entering text mode',
                this.buffer[0]!.span);
        }
        const start = this.lexer.Position();
        const chunks: StringBodyChunk[] = [];
        for (;;)
        {
            const tk = this.lexer.NextTextChunk();
            if (tk.kind === TokenKind.RBrace)
            {
                // Don't push, don't consume. The caller's expect(RBrace)
                // will lex this character in structural mode.
                break;
            }
            if (tk.kind === TokenKind.EOF)
            {
                throw new ParseError('unterminated text body', tk.span);
            }
            if (tk.kind === TokenKind.LDoubleBrace)
            {
                // Inline-expression hole inside text — capture the body
                // up to `}}` and resume text-mode scanning afterwards.
                const body = this.lexer.NextInlineExprBody();
                if (body.kind === TokenKind.EOF)
                {
                    throw new ParseError('unterminated `{{ … }}` inline expression in text body', tk.span);
                }
                chunks.push({
                    kind: 'inline-expr',
                    raw:  body.value,
                    span: this.span(tk.span.start, body.span.end),
                });
                continue;
            }
            chunks.push({ kind: 'text-chunk', text: tk.value });
        }
        const end = this.lexer.Position();
        return { kind: 'string-body', chunks, span: this.span(start, end) };
    }

    // Parses attributes between `[` and `]` — the brackets are consumed
    // by the caller so this can be re-used by both Element and resource
    // forms. Enforces "positional and named cannot mix" (spec decision 7).
    private parseAttrListBody(): Attribute[]
    {
        const out: Attribute[] = [];
        if (this.peek().kind === TokenKind.RBracket) return out;
        let mode: 'named' | 'positional' | null = null;
        for (;;)
        {
            const a = this.parseAttr();
            const isPositional = a.kind === 'positional-attr';
            const thisMode: 'named' | 'positional' = isPositional ? 'positional' : 'named';
            if (mode === null) mode = thisMode;
            else if (mode !== thisMode)
            {
                throw new ParseError(
                    'cannot mix positional and named attributes in the same list',
                    a.span,
                );
            }
            out.push(a);
            if (this.peek().kind === TokenKind.Comma) { this.consume(); continue; }
            break;
        }
        return out;
    }

    private parseAttr(): Attribute
    {
        const tk = this.peek();

        // Scope extensions (`x:foo`) are not allowed inside `[ … ]` —
        // they live before the bracket list, between the element name
        // and the `[`. Reject with a clear migration hint.
        if (tk.kind === TokenKind.ScopeExt)
        {
            throw new ParseError(
                "scope extensions (x:" + tk.value + ") belong before the `[ … ]` block, not inside it",
                tk.span);
        }

        // NamedAttr starts with Ident (path), PositionalAttr starts with
        // any other value-token (sigils, literals, brackets). An Ident
        // followed by anything other than `.` or `=` demotes to a
        // positional IdentValue — covers `Name`-as-enum and the rare
        // case of bare-name positional macro args.
        if (tk.kind === TokenKind.Ident)
        {
            const first = this.expect(TokenKind.Ident);
            // Two-segment path?
            if (this.peek().kind === TokenKind.Dot)
            {
                this.consume();
                const second = this.expect(TokenKind.Ident);
                this.expect(TokenKind.Equals);
                const value = this.parseValue();
                const end   = this.lastEnd();
                const path: AttrPath = {
                    kind:  'attr-path',
                    parts: [first.value, second.value],
                    span:  this.span(first.span.start, second.span.end),
                };
                return {
                    kind: 'named-attr',
                    path,
                    value,
                    span: this.span(first.span.start, end),
                };
            }
            if (this.peek().kind === TokenKind.Equals)
            {
                this.consume();
                const value = this.parseValue();
                const end   = this.lastEnd();
                const path: AttrPath = {
                    kind:  'attr-path',
                    parts: [first.value],
                    span:  first.span,
                };
                return {
                    kind: 'named-attr',
                    path,
                    value,
                    span: this.span(first.span.start, end),
                };
            }
            // Positional ident value.
            const ident: IdentValue = {
                kind: 'ident',
                name: first.value,
                span: first.span,
            };
            return {
                kind:  'positional-attr',
                value: ident,
                span:  first.span,
            };
        }

        // Positional value (number, string, sigil, hash, paren, etc.).
        const v = this.parseValue();
        return { kind: 'positional-attr', value: v, span: v.span };
    }

    // Helper: one or two dotted idents. Used by PropertySetter (which
    // is structurally a NamedAttr without the `[]` wrapper).
    private parseAttrPath(): AttrPath
    {
        const first = this.expect(TokenKind.Ident);
        if (this.peek().kind === TokenKind.Dot)
        {
            this.consume();
            const second = this.expect(TokenKind.Ident);
            return {
                kind:  'attr-path',
                parts: [first.value, second.value],
                span:  this.span(first.span.start, second.span.end),
            };
        }
        return {
            kind:  'attr-path',
            parts: [first.value],
            span:  first.span,
        };
    }

    // ── Structured body (element list + slot assigns + resources) ──

    private parseStructuredBody(): StructuredBody
    {
        const start = this.peek().span.start;
        const items: BodyItem[] = [];
        while (this.peek().kind !== TokenKind.RBrace
            && this.peek().kind !== TokenKind.EOF)
        {
            items.push(this.parseBodyItem());
        }
        const end = this.lastEnd();
        return { kind: 'structured-body', items, span: this.span(start, end) };
    }

    private parseBodyItem(): BodyItem
    {
        const tk = this.peek();

        // @key = value primitive resource entry
        if (tk.kind === TokenKind.At) return this.parseKeyValueResource();

        // Macro hole in body position — `#1`, `#bg`. Meaningful only
        // inside a def body; the bind pass errors if it appears outside
        // a macro expansion.
        if (tk.kind === TokenKind.HashBody)
        {
            const v = this.consume();
            return {
                kind: 'macro-hole-body-item',
                name: v.value,
                span: v.span,
            };
        }

        if (tk.kind === TokenKind.Ident)
        {
            switch (tk.value)
            {
                case 'Style':
                case 'Template':
                case 'DataTemplate':
                case 'HierarchicalDataTemplate':
                case 'ItemsPanelTemplate': return this.parseResourceForm();
                case 'def':          return this.parseDefForm();
                default:
                    // SlotAssign vs Element disambiguation.
                    if (this.peek(1).kind === TokenKind.Colon)
                    {
                        return this.parseSlotAssign();
                    }
                    return this.parseElement();
            }
        }

        throw new ParseError(
            `unexpected token '${tk.value}' in body`, tk.span);
    }

    private parseSlotAssign(): SlotAssign
    {
        const ident = this.expect(TokenKind.Ident);
        this.expect(TokenKind.Colon);
        let value: ValueNode | StructuredBody | ResourceForm;
        if (this.peek().kind === TokenKind.LBrace)
        {
            this.consume();
            value = this.parseStructuredBody();
            this.expect(TokenKind.RBrace);
        }
        else if (this.peek().kind === TokenKind.Ident
              && INLINE_TEMPLATE_KEYWORDS.has(this.peek().value as string))
        {
            // Inline template at the slot-value position:
            //   `ItemsPanel: ItemsPanelTemplate { WrapPanel[…] }`
            //   `ItemTemplate: DataTemplate [DataType=FooVM] { … }`
            // Parses identically to a keyed resource form; the compiler
            // emits an anonymous template construction at the assignment
            // site (no x:key required).
            value = this.parseResourceForm();
        }
        else
        {
            value = this.parseValue();
        }
        const end = this.lastEnd();
        return {
            kind:  'slot-assign',
            name:  ident.value,
            value,
            span:  this.span(ident.span.start, end),
        };
    }

    private parseKeyValueResource(): KeyValueResource
    {
        const at   = this.expect(TokenKind.At);
        const name = this.expect(TokenKind.Ident).value;
        let key    = name;
        if (this.peek().kind === TokenKind.Colon)
        {
            this.consume();
            const tail = this.expect(TokenKind.Ident).value;
            // The colon is a key-namespace separator, not a rename: the
            // full string after `@` (including the colon) is the
            // dictionary key, matching how `@theme:primary` resolves
            // in value positions.
            key = `${name}:${tail}`;
        }
        this.expect(TokenKind.Equals);
        const value = this.parseValue();
        const end   = this.lastEnd();
        return {
            kind: 'key-value-resource',
            key,
            name,
            value,
            span: this.span(at.span.start, end),
        };
    }

    // ── Values ──────────────────────────────────────────────────────

    private parseValue(): ValueNode
    {
        const tk = this.peek();
        switch (tk.kind)
        {
            case TokenKind.Number:        return this.consumeAsNumber();
            case TokenKind.String:        return this.consumeAsString();
            case TokenKind.Ident:         return this.consumeAsIdent();
            case TokenKind.HashBody:      return this.consumeAsHash();
            case TokenKind.LParen:        return this.parseTuple();
            case TokenKind.LAngle:        return this.parseSize();
            case TokenKind.LBracket:      return this.parseList();
            case TokenKind.Dollar:        return this.parseBindingPath();
            case TokenKind.DollarDollar:  return this.parseTemplateBinding();
            case TokenKind.At:            return this.parseStaticResource();
            case TokenKind.AtAt:          return this.parseDynamicResource();
            case TokenKind.LDoubleBrace:  return this.parseInlineExpr();
            case TokenKind.DollarParen:
                throw new ParseError('inline expressions are spelled `{{ … }}` (the $( … )$ form is retired)', tk.span);
            default:
                throw new ParseError(`expected value, got '${tk.value}'`, tk.span);
        }
    }

    private consumeAsNumber(): NumberValue
    {
        const tk = this.consume();
        return { kind: 'number', raw: tk.value, span: tk.span };
    }

    private consumeAsString(): StringValue
    {
        const tk = this.consume();
        return { kind: 'string', value: tk.value, span: tk.span };
    }

    private consumeAsIdent(): IdentValue
    {
        const tk = this.consume();
        return { kind: 'ident', name: tk.value, span: tk.span };
    }

    // `#` body — interpreted by the bind pass into Color, NamedColor,
    // or NamedMacroHole. Short digit-only bodies (1-2 chars) are
    // positional macro holes (`#1`, `#2`). Anything 3+ chars that's
    // valid hex shape is a hex colour (`#abc`, `#000000`, `#ff00ff00`).
    // The bind pass distinguishes "named colour" vs "named macro hole"
    // by surrounding context — inside a `def` body, named bodies are
    // macro-hole references; outside, they're colour names.
    private consumeAsHash(): ColorValue | MacroHoleValue
    {
        const tk = this.consume();
        const v = tk.value;
        if (v.length <= 2 && /^[0-9]+$/.test(v))
        {
            return { kind: 'macro-hole', name: v, span: tk.span };
        }
        return { kind: 'color', raw: v, span: tk.span };
    }

    private parseTuple(): TupleValue
    {
        const lp = this.expect(TokenKind.LParen);
        const values: ValueNode[] = [];
        if (this.peek().kind !== TokenKind.RParen)
        {
            for (;;)
            {
                values.push(this.parseValue());
                if (this.peek().kind === TokenKind.Comma) { this.consume(); continue; }
                break;
            }
        }
        const rp = this.expect(TokenKind.RParen);
        return { kind: 'tuple', values, span: this.span(lp.span.start, rp.span.end) };
    }

    private parseSize(): SizeValue
    {
        const la     = this.expect(TokenKind.LAngle);
        const width  = this.parseValue();
        this.expect(TokenKind.Comma);
        const height = this.parseValue();
        const ra     = this.expect(TokenKind.RAngle);
        return { kind: 'size', width, height, span: this.span(la.span.start, ra.span.end) };
    }

    private parseList(): ListValue
    {
        const lb = this.expect(TokenKind.LBracket);
        const values: ValueNode[] = [];
        if (this.peek().kind !== TokenKind.RBracket)
        {
            for (;;)
            {
                values.push(this.parseValue());
                if (this.peek().kind === TokenKind.Comma) { this.consume(); continue; }
                break;
            }
        }
        const rb = this.expect(TokenKind.RBracket);
        return { kind: 'list', values, span: this.span(lb.span.start, rb.span.end) };
    }

    private parseBindingPath(): BindingValue
    {
        const dollar = this.expect(TokenKind.Dollar);
        const path: string[] = [];
        path.push(this.expect(TokenKind.Ident).value);
        while (this.peek().kind === TokenKind.Dot)
        {
            this.consume();
            path.push(this.expect(TokenKind.Ident).value);
        }
        return { kind: 'binding', path, span: this.span(dollar.span.start, this.lastEnd()) };
    }

    private parseTemplateBinding(): TemplateBindingValue
    {
        const dd = this.expect(TokenKind.DollarDollar);
        const id = this.expect(TokenKind.Ident);
        return {
            kind: 'template-binding',
            name: id.value,
            span: this.span(dd.span.start, id.span.end),
        };
    }

    private parseStaticResource(): StaticResourceValue
    {
        const at = this.expect(TokenKind.At);
        const id = this.expect(TokenKind.Ident);
        // Allow @ns:name forms? Spec §9.1 uses @theme:primary as a
        // keyed-primitive resource — that lives at definition time
        // (KeyValueResource). At lookup time, the key is a string with
        // the colon in it. So parse the optional `:ident` here too.
        let key = id.value;
        if (this.peek().kind === TokenKind.Colon)
        {
            this.consume();
            const tail = this.expect(TokenKind.Ident).value;
            key = `${id.value}:${tail}`;
        }
        return {
            kind: 'static-resource',
            key,
            span: this.span(at.span.start, this.lastEnd()),
        };
    }

    private parseDynamicResource(): DynamicResourceValue
    {
        const at = this.expect(TokenKind.AtAt);
        const id = this.expect(TokenKind.Ident);
        let key = id.value;
        if (this.peek().kind === TokenKind.Colon)
        {
            this.consume();
            const tail = this.expect(TokenKind.Ident).value;
            key = `${id.value}:${tail}`;
        }
        return {
            kind: 'dynamic-resource',
            key,
            span: this.span(at.span.start, this.lastEnd()),
        };
    }

    // `{{ … }}` inline expression. The lexer handed back `{{` as
    // LDoubleBrace; we delegate the body capture to NextInlineExprBody
    // which scans to the matching `}}` and returns the raw text. The
    // bind / emit pass decides whether to fold the body as a constant
    // or lower it to a MultiBinding.
    //
    // Same lookahead-buffer constraint as parseStringBody: we mustn't
    // have peeked past `{{` before calling into the body lexer, so
    // assert the buffer is empty.
    private parseInlineExpr(): InlineExprValue
    {
        const open = this.expect(TokenKind.LDoubleBrace);
        if (this.buffer.length > 0)
        {
            throw new ParseError(
                'internal: lookahead buffer non-empty entering inline expression',
                this.buffer[0]!.span);
        }
        const body = this.lexer.NextInlineExprBody();
        if (body.kind === TokenKind.EOF)
        {
            throw new ParseError('unterminated `{{ … }}` inline expression', open.span);
        }
        return {
            kind: 'inline-expr',
            raw:  body.value,
            span: this.span(open.span.start, body.span.end),
        };
    }

    // ── Token plumbing ──────────────────────────────────────────────

    private peek(offset = 0): Token
    {
        while (this.buffer.length <= offset)
        {
            this.buffer.push(this.lexer.NextToken());
        }
        return this.buffer[offset]!;
    }

    private consume(): Token
    {
        if (this.buffer.length === 0)
        {
            this.buffer.push(this.lexer.NextToken());
        }
        return this.buffer.shift()!;
    }

    private expect(kind: TokenKind): Token
    {
        const tk = this.peek();
        if (tk.kind !== kind)
        {
            throw new ParseError(
                `expected ${kind}, got ${tk.kind} '${tk.value}'`, tk.span);
        }
        return this.consume();
    }

    private expectIdent(text: string): Token
    {
        const tk = this.peek();
        if (tk.kind !== TokenKind.Ident || tk.value !== text)
        {
            throw new ParseError(
                `expected '${text}', got '${tk.value}'`, tk.span);
        }
        return this.consume();
    }

    private span(start: SourceLocation, end: SourceLocation): SourceSpan
    {
        return { start, end };
    }

    // The end position of the most-recently-consumed token, used to
    // close out span ranges that started before the current peek.
    private lastEnd(): SourceLocation
    {
        // After consume(), buffer.shift() returned a token but we no
        // longer hold a reference. We approximate via the current
        // lexer position — which is the start of the next token's
        // lookahead and therefore strictly >= the end of whatever was
        // last consumed. Good enough for diagnostics.
        return this.lexer.Position();
    }

}
