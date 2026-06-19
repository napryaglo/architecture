// VM type references — every [DataType=…] below must be backed by an
// import so the compiler emits a real Function key, not a string.
import ShapeNodeVM from "./diagram-vm.mjs"
import GroupVM     from "./diagram-vm.mjs"

// Per-node DataTemplate for the diagrammer. After the geometry-first
// refactor every node — Rectangle, Heart, Flower, Pixel-Triangle —
// shares ONE template: a Canvas with a single `Shape` primitive whose
// `Geometry` is supplied by the VM. The per-kind silhouette comes
// from `shape-catalog.mjs`: each kind's unit-1 PathGeometry is built
// once from the matching Shape subclass's RenderOverride, then the VM
// composes it with a per-node `ScaleTransform(Width, Height)` so
// resizing stretches the figure without re-extracting the path.
//
// Selection chrome rides the `SelectionResizeAdorner` overlay (since
// the orange-on-select trigger was removed), so the per-node template
// no longer needs an `IsSelected` Stroke swap.
//
// Width / Height bind to the VM so the same template paints both the
// 80×80 canvas node and the 48×48 toolbox preview.
//
// Merged into Application.Resources from diagram.mjs alongside the
// `DiagramDemo` bundle so DataTemplate dispatch by Content's type
// (ContentControl / ContentPresenter) finds the matching entry.
resources DiagramShapeTemplates {

    DataTemplate [DataType=ShapeNodeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Shape x:name="chrome"
                 [Width=$Width, Height=$Height,
                  Fill=$FillBrush, Stroke=$Stroke,
                  Geometry=$Geometry]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
    }

    // Group bbox chrome. The GroupVM sits in DiagramVM.Nodes alongside
    // shapes; its container's X / Y come from the same DiagramNodeStyle
    // (bound to $X / $Y, which on a GroupVM are the COMPUTED bbox top-
    // left). The container auto-sizes to this Border, which paints at
    // $Width × $Height (the COMPUTED bbox size).
    //
    // BorderBrush is transparent (#00000000) by default so the chrome
    // is invisible when the group isn't selected. The bridge flips
    // GroupVM.IsSelected to true when any member of this group's tree
    // is clicked → the trigger paints the border orange.
    DataTemplate [DataType=GroupVM] {
        Border x:name="bbox"
               [Width=$Width, Height=$Height,
                BorderBrush=#00000000, BorderThickness=(2),
                IsHitTestVisible=false]
        when( $IsSelected ){ bbox.BorderBrush = #f97316; }
    }
}
