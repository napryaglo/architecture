import { Model, PropertyKey } from '../model.js';
import { MetaData } from '../metadata.js';

// Single rule's verdict on a value. `errorContent` is the user-visible
// message surfaced through Validation.Errors when the rule fails; it
// is ignored when `isValid` is true.
export interface ValidationResult
{
    readonly isValid: boolean;
    readonly errorContent?: string;
}

// One rule. Implementations check `value` and return a verdict. Rules
// are pure — no observable state, no side effects — so the binding
// pipeline can re-run them freely (every push, every writeback) without
// surprising consumers.
export interface ValidationRule
{
    validate(value: unknown): ValidationResult;
}

// One failure on a target Model. The `source` field identifies which
// binding produced the error so multiple bindings on the same target
// (e.g., a control with several bound DPs) don't clobber each other's
// error state when one passes and another fails.
export interface ValidationError
{
    readonly rule: ValidationRule;
    readonly errorContent: string;
    readonly value: unknown;
}

const EMPTY_ERRORS: readonly ValidationError[] = Object.freeze([]);

// Per-target registry of errors keyed by the binding (or any opaque
// source identifier) that produced them. WeakMap so a target Model
// dropping out of use lets its error map be GC'd alongside.
const ERROR_REGISTRY: WeakMap<Model, Map<object, readonly ValidationError[]>> = new WeakMap();

// Attached-property bag for validation state. Mirrors WPF's
// `System.Windows.Controls.Validation` static — `HasError` / `Errors`
// surface on any Model and are written exclusively by the binding
// pipeline. `Errors` is per-target aggregated across every binding
// installed on that target; `HasError` is a derived `errors.length > 0`.
//
// PropertyTriggers can observe `Validation.HasError` against a target
// to swap a Style (red border, badge, etc.). Consumers can also poll
// `Validation.GetErrors(target)` directly.
//
// The DPs are read-only — the PropertyKeys are held privately so only
// the validation machinery (here and the EVD integration via
// `Validation.SetErrors`) can write. Public read access works through
// the usual attached-property surface (`target.get_property_value(
// Validation, 'HasError')`).
export class Validation extends Model
{
    public static readonly HasErrorKey: PropertyKey<boolean>
        = Model.RegisterReadOnlyProperty<boolean>(
            Validation, 'HasError', false, MetaData.None,
        );
    public static readonly ErrorsKey: PropertyKey<readonly ValidationError[]>
        = Model.RegisterReadOnlyProperty<readonly ValidationError[]>(
            Validation, 'Errors', EMPTY_ERRORS, MetaData.None,
        );

    // Replace the error list for `source` on `target`. Empty list
    // removes the source's contribution entirely. After updating, the
    // target's `Validation.Errors` is rebuilt as the union of every
    // source's current list, and `Validation.HasError` flips to
    // `errors.length > 0`.
    public static SetErrors(
        target: Model,
        source: object,
        errors: readonly ValidationError[],
    ): void
    {
        let perTarget = ERROR_REGISTRY.get(target);
        if (perTarget === undefined)
        {
            // No errors and no registry entry: nothing to do.
            if (errors.length === 0) return;
            perTarget = new Map();
            ERROR_REGISTRY.set(target, perTarget);
        }

        if (errors.length === 0)
        {
            perTarget.delete(source);
        }
        else
        {
            perTarget.set(source, errors);
        }

        // Aggregate across every binding on this target.
        const aggregated: ValidationError[] = [];
        for (const list of perTarget.values())
        {
            aggregated.push(...list);
        }
        const frozen = Object.freeze(aggregated) as readonly ValidationError[];

        target.set_property_value_with_key(Validation.ErrorsKey, frozen);
        target.set_property_value_with_key(Validation.HasErrorKey, frozen.length > 0);
    }

    // Convenience reader. `Errors` defaults to an empty frozen array
    // when the target has never seen a validation event, so this never
    // returns `undefined`.
    public static GetErrors(target: Model): readonly ValidationError[]
    {
        return target.get_property_value(Validation.ErrorsKey);
    }

    public static GetHasError(target: Model): boolean
    {
        return target.get_property_value(Validation.HasErrorKey);
    }
}
