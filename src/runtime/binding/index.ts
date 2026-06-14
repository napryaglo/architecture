// Binding — the data-binding pipeline. The core Binding class plus its
// specialised subtypes (DataContextBinding, ElementNameBinding,
// AncestorBinding, TemplateBinding, MultiBinding, PriorityBinding,
// DynamicResource), the Validation framework that runs inside that
// pipeline, and the EffectiveValueDescriptor that resolves
// binding/local/animated/inherited source priority on a per-DP basis.
//
// Export order is load-bearing. effective-value.ts is listed FIRST so
// model.ts's transitive load (model → binding/binding → ../model cycle)
// finds effective-value.ts already in-flight rather than triggering a
// fresh load that would chain through validation.ts and hit Model
// before its `class Model { … }` declaration has run.
export {
    EffectiveValueDescriptor,
    PropertyValueSource,
    type PropertyChangeCallback,
} from './effective-value.js';
export {
    Binding,
    BindingMode,
    type BindingOptions,
    type ValueConverter,
} from './binding.js';
export {
    Validation,
    type ValidationError,
    type ValidationResult,
    type ValidationRule,
} from './validation.js';
export { DataContextBinding } from './data-context-binding.js';
export { ElementNameBinding } from './element-name-binding.js';
export { MultiBinding, PriorityBinding } from './multi-binding.js';
export { AncestorBinding } from './ancestor-binding.js';
export { TemplateBinding } from './template-binding.js';
export { MultiTemplateBinding } from './multi-template-binding.js';
export { DynamicResource } from './dynamic-resource.js';
