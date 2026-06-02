// Barrel re-exports for the runtime property/binding system.
// Consumers should import from here rather than the individual files.
export {
    MetaData,
    affectsMeasure,
    affectsArrange,
    affectsRender,
    inherits,
    bindsTwoWayByDefault,
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
export { NameScope } from './namescope.js';
export {
    ResourceDictionary,
    type ResourceChangeListener,
    type ResourceKey,
} from './resource-dictionary.js';
export { Application, type MountableTarget } from './application.js';
export { DynamicResource } from './dynamic-resource.js';
export { DataContextBinding } from './data-context-binding.js';
export { MultiBinding } from './multi-binding.js';
export { TemplateBinding } from './template-binding.js';
export {
    RoutedEventArgs,
    PointerEventArgs,
    WheelEventArgs,
    KeyEventArgs,
    TextInputEventArgs,
    FocusEventArgs,
    PointerButton,
    NoModifiers,
    buildRoute,
    dispatchPointer,
    dispatchPointerDirect,
    dispatchKey,
    dispatchTextInput,
    dispatchFocus,
    type RoutedEventKind,
    type PointerEventInit,
    type WheelEventInit,
    type WheelDeltaMode,
    type ModifierKeys,
    type PointerEventHandlers,
    type KeyEventInit,
    type TextInputEventInit,
    type KeyboardEventHandlers,
    type FocusEventHandlers,
} from './routed-event.js';
export { InputManager } from './input-manager.js';
export {
    RelayCommand,
    type ICommand,
} from './command.js';
export {
    Style,
    Setter,
    SetterFactory,
    PropertyTrigger,
    MultiTrigger,
    type TriggerCondition,
} from './style.js';
export { type IScrollInfo, isScrollInfo } from './scroll-info.js';
export {
    ObservableCollection,
    type CollectionChange,
    type CollectionChangeListener,
    type IReadOnlyObservableCollection,
} from './observable-collection.js';
export { Point, Size, Rect, Color, Matrix, Thickness } from './primitives.js';
export { type DrawingContext } from './drawing-context.js';
export {
    ApproximateTextMeasurer,
    APPROXIMATE_TEXT_MEASURER,
    type TextMeasurer,
    type TextMetrics,
} from './text-measurer.js';
