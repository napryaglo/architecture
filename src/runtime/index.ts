// Barrel re-exports for the runtime property/binding system.
// Consumers should import from here rather than the individual files.
export {
    MetaData,
    affectsMeasure,
    affectsArrange,
    affectsRender,
    inherits,
    bindsTwoWayByDefault,
    isNotDataBindable,
    isAnimationProhibited,
} from './metadata.js';
export {
    PropertyDescriptor,
    type PropertyMetadata,
    type CoerceValue,
    type ValidateValue,
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
export {
    Validation,
    type ValidationError,
    type ValidationResult,
    type ValidationRule,
} from './validation.js';
export { Model, PropertyKey } from './model.js';
export { Behavior } from './behavior.js';
export {
    Visual,
    Single,
    Panel,
    HorizontalAlignment,
    VerticalAlignment,
    type VisualHost,
    type IEffect,
} from './visual.js';
export { Adorner, AdornerLayer, AdornerDecorator, DragGhostAdorner } from './adorner.js';
export { NameScope } from './namescope.js';
export {
    ResourceDictionary,
    type ResourceChangeListener,
    type ResourceKey,
} from './resource-dictionary.js';
export { Application, type MountableTarget } from './application.js';
export { DynamicResource } from './dynamic-resource.js';
export { DataContextBinding } from './data-context-binding.js';
export { ElementNameBinding } from './element-name-binding.js';
export { MultiBinding, PriorityBinding } from './multi-binding.js';
export { AncestorBinding } from './ancestor-binding.js';
export { TemplateBinding } from './template-binding.js';
export {
    RoutedEventArgs,
    PointerEventArgs,
    WheelEventArgs,
    KeyEventArgs,
    TextInputEventArgs,
    FocusEventArgs,
    DragEventArgs,
    PointerButton,
    NoModifiers,
    buildRoute,
    dispatchPointer,
    dispatchPointerDirect,
    dispatchKey,
    dispatchTextInput,
    dispatchFocus,
    dispatchDrag,
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
    type DragEventInit,
    type DragEventHandlers,
} from './routed-event.js';
// InputManager moved to `@visualisation-sub/mural/framework`.
export {
    DataObject,
    DragDrop,
    DragDropEffects,
    DragSession,
    type DragDropOptions,
    type DragPreviewKind,
} from './drag-drop.js';
export {
    RelayCommand,
    type ICommand,
} from './command.js';
// RoutedCommand / CommandBinding / CommandManager / InputBinding /
// KeyBinding / MouseBinding / ICommandSource + CommandSourceHelper /
// ApplicationCommands etc. moved to
// `@visualisation-sub/mural/framework/commands`. Re-exports stay there
// — the runtime barrel keeps only the foundational `ICommand` +
// `RelayCommand` from `./command.js`.
export {
    Style,
    Setter,
    SetterFactory,
    PropertyTrigger,
    MultiTrigger,
    DataTrigger,
    type TriggerCondition,
} from './style.js';
export {
    AttachBehaviorAction,
    BeginStoryboardAction,
    DetachBehaviorAction,
    EventTrigger,
    InvokeCommandAction,
    PauseStoryboardAction,
    ResumeStoryboardAction,
    StopStoryboardAction,
    TriggerAction,
} from './trigger-actions.js';
export { type IScrollInfo, isScrollInfo } from './scroll-info.js';
export {
    ObservableCollection,
    type CollectionChange,
    type CollectionChangeListener,
    type IReadOnlyObservableCollection,
} from './observable-collection.js';
export { observe_array, subscribe_array, is_observed_array } from './observable-array.js';
export { Point, Size, Rect, Color, Matrix, Thickness } from './primitives.js';
export { type DrawingContext } from './drawing-context.js';
export {
    ApproximateTextMeasurer,
    APPROXIMATE_TEXT_MEASURER,
    type TextMeasurer,
    type TextMetrics,
} from './text-measurer.js';
export {
    AnimationManager,
    AnimationTimeline,
    ColorAnimation,
    ColorAnimationUsingKeyFrames,
    ColorKeyFrame,
    DiscreteColorKeyFrame,
    DiscreteDoubleKeyFrame,
    DiscreteThicknessKeyFrame,
    DoubleAnimation,
    DoubleAnimationUsingKeyFrames,
    DoubleKeyFrame,
    EasingColorKeyFrame,
    EasingDoubleKeyFrame,
    EasingThicknessKeyFrame,
    Easings,
    FillBehavior,
    LinearColorKeyFrame,
    LinearDoubleKeyFrame,
    LinearThicknessKeyFrame,
    cubicBezier,
    ManualClock,
    Storyboard,
    StoryboardState,
    ThicknessAnimation,
    ThicknessAnimationUsingKeyFrames,
    ThicknessKeyFrame,
    interpolateColor,
    interpolateNumber,
    interpolateThickness,
    type AnimationTimelineProps,
    type ColorAnimationProps,
    type ColorAnimationUsingKeyFramesProps,
    type DoubleAnimationProps,
    type DoubleAnimationUsingKeyFramesProps,
    type EasingFunction,
    type IClock,
    type Interpolator,
    type ThicknessAnimationProps,
    type ThicknessAnimationUsingKeyFramesProps,
    type TimelinePhase,
} from './animation/index.js';
