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
    AncestorBinding,
    Binding,
    BindingMode,
    DataContextBinding,
    DynamicResource,
    EffectiveValueDescriptor,
    ElementNameBinding,
    MultiBinding,
    PriorityBinding,
    PropertyValueSource,
    TemplateBinding,
    Validation,
    type BindingOptions,
    type PropertyChangeCallback,
    type ValidationError,
    type ValidationResult,
    type ValidationRule,
    type ValueConverter,
} from './binding/index.js';
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
export {
    Application,
    type ApplicationInitOptions,
    type MountableTarget,
} from './application.js';
// InputManager moved to `@visualisation-sub/mural/framework`.
// RoutedCommand / CommandBinding / CommandManager / InputBinding /
// KeyBinding / MouseBinding / ICommandSource + CommandSourceHelper /
// ApplicationCommands etc. moved to
// `@visualisation-sub/mural/framework/commands`. The runtime barrel
// keeps only the foundational `ICommand` + `RelayCommand` from
// `./input/command.js`.
export {
    DataObject,
    DragDrop,
    DragDropEffects,
    DragEventArgs,
    DragSession,
    EventTrigger,
    FocusEventArgs,
    InvokeCommandAction,
    KeyEventArgs,
    NoModifiers,
    PointerButton,
    PointerEventArgs,
    RelayCommand,
    RoutedEventArgs,
    TextInputEventArgs,
    WheelEventArgs,
    buildRoute,
    dispatchDrag,
    dispatchFocus,
    dispatchKey,
    dispatchPointer,
    dispatchPointerDirect,
    dispatchTextInput,
    type DragDropOptions,
    type DragEventHandlers,
    type DragEventInit,
    type DragPreviewKind,
    type FocusEventHandlers,
    type ICommand,
    type KeyEventInit,
    type KeyboardEventHandlers,
    type ModifierKeys,
    type PointerEventHandlers,
    type PointerEventInit,
    type RoutedEventKind,
    type TextInputEventInit,
    type WheelDeltaMode,
    type WheelEventInit,
} from './input/index.js';
export {
    Style,
    Setter,
    SetterFactory,
    PropertyTrigger,
    MultiTrigger,
    DataTrigger,
    MultiDataTrigger,
    type DataTriggerBindingFactory,
    type DataTriggerCondition,
    type TriggerCondition,
} from './style.js';
export {
    AttachBehaviorAction,
    BeginStoryboardAction,
    DetachBehaviorAction,
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
export { CornerRadius } from './corner-radius.js';
export {
    Density,
    M3_BREAKPOINTS,
    MediaWatcher,
    Pointer,
    PreferredScheme,
    PrefersContrast,
    Scheme,
    Theme,
    ThemeManager,
    ViewportClass,
    classifyViewport,
    defineScheme,
    defineTheme,
    getSchemeTransitionAnimator,
    registerSchemeTransitionAnimator,
    type ActivateThemeOptions,
    type AutoSchemeOptions,
    type SchemeOptions,
    type SchemeTransition,
    type SchemeTransitionAnimatorFactory,
    type ThemeOptions,
    type TokenCatalog,
    type TokenSpec,
    type TokenType,
    type ViewportBreakpoints,
} from './theme/index.js';
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
    PropertyTransition,
    registerImplicitTransitionBuilder,
    _resetImplicitTransitionBuildersForTests,
    type ImplicitTransitionBuilder,
    RafClock,
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
