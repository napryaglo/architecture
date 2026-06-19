// Framework-internal accessor surface for `Model`.
//
// Reaches in via the friend-interface cast pattern documented in
// CLAUDE.md § Cross-class internals: local interfaces describe `Model`'s
// protected surface; casting through them is the visible audit gate.
// The casts here are intentional — every name-based resolution and
// every direct EVD-map read in the framework flows through this module.
//
// Consumers: the binding pipeline (Binding / DataContextBinding /
// TemplateBinding / MultiTemplateBinding / MultiBinding), the animation
// engine (Storyboard), the trigger machinery on Visual / Element, the
// input dispatcher (InputManager), the editor controls that watch
// child-control DPs (BrushPicker, ColorPicker, FillEditor, PenEditor),
// and the test suite.
//
// NEVER re-export from the runtime barrel ([./index.ts](./index.ts)) —
// this module is not part of mural's published API surface (CLAUDE.md
// § Cross-class internals). Each consuming file imports directly from
// `'./model-internals.js'` (or the relative equivalent).

import { Model, PropertyKey } from './model.js';
import type { PropertyDescriptor } from './property-descriptor.js';
import type { EffectiveValueDescriptor } from './binding/effective-value.js';

// ── Friend interfaces ────────────────────────────────────────────────
//
// Local-only shapes describing `Model`'s protected surface. Each maps to
// a single protected member that already exists on `Model`. Stay inside
// this file — never exported. Per CLAUDE.md, the friend-interface
// pattern is the documented escape hatch; bracket access on the same
// targets (`Model['find_descriptor']`, `model['property_values']`) was
// the unstructured workaround we're replacing.

interface ModelStaticInternal
{
    find_descriptor(klass: Function, property: string): PropertyDescriptor | undefined;
    peek_property_bag(klass: Function): Map<string, PropertyDescriptor> | undefined;
}

interface ModelInternal
{
    property_values: Map<string, EffectiveValueDescriptor>;
}

const ModelStatic: ModelStaticInternal = Model as unknown as ModelStaticInternal;

// ── Name → PropertyKey resolution ────────────────────────────────────

// Resolve a string property name to its `PropertyKey<unknown>`. Throws
// when the property isn't registered on `owner` (or, when `owner` is
// undefined, anywhere in `model`'s class hierarchy).
//
// Single source of name → key translation for the framework. Triggers,
// the animation engine, binding path walks, and InputManager funnel
// through here so the underscore-prefixed `_xxx_by_name` family is gone
// from `Model`'s public surface. After resolution, callers use the
// typed-key API (`get_property_value`, `AddPropertyChangedListener`,
// `SetAnimatedValue`, …) on `Model` directly.
//
// Hot-loop callers should cache the returned key rather than
// re-resolving on every invocation — the resolution walks the class
// hierarchy through the property bag. Trigger installs do this already
// (resolve once at install, listen against the resolved key).
export function resolveKey(
    model: Model,
    owner: Function | undefined,
    property: string,
): PropertyKey<unknown>
{
    const klass = owner ?? model.constructor;
    const descriptor = ModelStatic.find_descriptor(klass, property);
    if (descriptor === undefined)
    {
        const ctx = owner === undefined
            ? `model '${model.constructor.name}'`
            : `owner '${owner.name}'`;
        throw new Error(`Property '${property}' not found in ${ctx}.`);
    }
    return new PropertyKey(descriptor);
}

// ── Direct accessors for the Model-private surface ───────────────────

// Look up the descriptor for `property` registered on `klass` (or any
// ancestor of `klass`). Returns `undefined` when nothing matches — for
// the throw-on-missing variant use `resolveKey`.
//
// Same lookup `resolveKey` performs internally, exposed as a separate
// function for the rare site that needs the descriptor itself rather
// than a `PropertyKey`. Replaces the `Model['find_descriptor']` bracket
// access pattern that existed before this module.
export function findDescriptor(
    klass: Function,
    property: string,
): PropertyDescriptor | undefined
{
    return ModelStatic.find_descriptor(klass, property);
}

// Return the descriptor bag registered directly on `klass` (excluding
// inherited descriptors from base classes). `undefined` when no
// properties have been registered on this exact class — common for
// classes that only inherit DPs from their parents.
//
// Consumed by `Visual.collect_inheritable_descriptors` to walk the
// prototype chain manually. Replaces the `Model['peek_property_bag']`
// bracket access pattern.
export function peekPropertyBag(
    klass: Function,
): Map<string, PropertyDescriptor> | undefined
{
    return ModelStatic.peek_property_bag(klass);
}

// The per-instance value store keyed by composite
// `${RootOwner.name}.${name}`. Used by trigger evaluation, inheritance
// walks, and the binding system to read EVD slots directly. Replaces
// the `model['property_values']` bracket access pattern.
export function propertyValues(
    model: Model,
): Map<string, EffectiveValueDescriptor>
{
    return (model as unknown as ModelInternal).property_values;
}
