// Layout-affecting metadata flags for a registered property. Values are
// powers of two so callers can combine them with the bitwise OR operator
// (e.g. `MetaData.Measure | MetaData.Render`), mirroring WPF's
// FrameworkPropertyMetadataOptions.
export enum MetaData
{
    None                 = 0,
    Measure              = 1 << 0,
    Arrange              = 1 << 1,
    Render               = 1 << 2,
    Inherits             = 1 << 3,
    BindsTwoWayByDefault = 1 << 4,
    // Reject Binding installs on this property. Used for structural
    // DPs that the framework needs to resolve at parse / template-build
    // time — Style.TargetType, DataTemplate.DataType, Setter.Property,
    // and similar — where a runtime-resolved binding would silently
    // break style/template lookup or NameScope registration.
    IsNotDataBindable    = 1 << 5,
    // Reject Storyboard / SetAnimatedValue on this property. Used for
    // reference-type identity DPs (DataContext, ItemsSource) and
    // structural collections (RowDefinitions) where interpolation is
    // nonsensical and would yield undefined intermediate states.
    IsAnimationProhibited = 1 << 6,
}

export function affectsMeasure(meta: MetaData): boolean
{
    return (meta & MetaData.Measure) !== 0;
}

export function affectsArrange(meta: MetaData): boolean
{
    return (meta & MetaData.Arrange) !== 0;
}

export function affectsRender(meta: MetaData): boolean
{
    return (meta & MetaData.Render) !== 0;
}

export function inherits(meta: MetaData): boolean
{
    return (meta & MetaData.Inherits) !== 0;
}

export function bindsTwoWayByDefault(meta: MetaData): boolean
{
    return (meta & MetaData.BindsTwoWayByDefault) !== 0;
}

export function isNotDataBindable(meta: MetaData): boolean
{
    return (meta & MetaData.IsNotDataBindable) !== 0;
}

export function isAnimationProhibited(meta: MetaData): boolean
{
    return (meta & MetaData.IsAnimationProhibited) !== 0;
}
