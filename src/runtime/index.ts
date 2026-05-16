// Barrel re-exports for the runtime property/binding system.
// Consumers should import from here rather than the individual files.
export {
    MetaData,
    affectsMeasure,
    affectsArrange,
    affectsRender,
    inherits,
} from './metadata.js';
export {
    PropertyDescriptor,
    type PropertyMetadata,
    type CoerceValue,
} from './property-descriptor.js';
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
export { Model, PropertyKey } from './model.js';
export {
    Visual,
    Single,
    Panel,
    HorizontalAlignment,
    VerticalAlignment,
    type VisualHost,
} from './visual.js';
export { Point, Size, Rect, Color, Matrix, Thickness } from './primitives.js';
export { type DrawingContext } from './drawing-context.js';
export {
    ApproximateTextMeasurer,
    APPROXIMATE_TEXT_MEASURER,
    type TextMeasurer,
    type TextMetrics,
} from './text-measurer.js';
