// Animation engine — pluggable clock, per-property Timelines, Storyboard
// composition, and an Application-wide AnimationManager. See individual
// files for the per-type contracts.
export { type IClock, ManualClock }                      from './clock.js';
export { RafClock }                                      from './raf-clock.js';
export { type EasingFunction, Easings }                  from './easing.js';
export {
    type Interpolator,
    interpolateColor,
    interpolateCornerRadius,
    interpolateNumber,
    interpolateThickness,
} from './interpolation.js';
export {
    type AnimationTimelineProps,
    type ColorAnimationProps,
    type DoubleAnimationProps,
    type ThicknessAnimationProps,
    type TimelinePhase,
    AnimationTimeline,
    ColorAnimation,
    DoubleAnimation,
    FillBehavior,
    ThicknessAnimation,
} from './timeline.js';
export { AnimationManager }                              from './manager.js';
export { Storyboard, StoryboardState }                   from './storyboard.js';
export {
    ColorAnimationUsingKeyFrames,
    ColorKeyFrame,
    DiscreteColorKeyFrame,
    DiscreteDoubleKeyFrame,
    DiscreteThicknessKeyFrame,
    DoubleAnimationUsingKeyFrames,
    DoubleKeyFrame,
    EasingColorKeyFrame,
    EasingDoubleKeyFrame,
    EasingThicknessKeyFrame,
    LinearColorKeyFrame,
    LinearDoubleKeyFrame,
    LinearThicknessKeyFrame,
    ThicknessAnimationUsingKeyFrames,
    ThicknessKeyFrame,
    type ColorAnimationUsingKeyFramesProps,
    type DoubleAnimationUsingKeyFramesProps,
    type ThicknessAnimationUsingKeyFramesProps,
} from './keyframes.js';
export { cubicBezier } from './easing.js';
export { PropertyTransition } from './property-transition.js';
export {
    registerImplicitTransitionBuilder,
    _resetImplicitTransitionBuildersForTests,
    type ImplicitTransitionBuilder,
} from './implicit-transition-engine.js';
