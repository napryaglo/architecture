// VM type references — every [DataType=…] below must be backed by an
// import so the compiler emits a real Function key, not a string.
import RectangleShapeVM       from "./diagram-vm.mjs"
import EllipseShapeVM         from "./diagram-vm.mjs"
import SquircleShapeVM        from "./diagram-vm.mjs"
import SlantedShapeVM         from "./diagram-vm.mjs"
import PillShapeVM            from "./diagram-vm.mjs"
import DiamondShapeVM         from "./diagram-vm.mjs"
import PentagonShapeVM        from "./diagram-vm.mjs"
import GemShapeVM             from "./diagram-vm.mjs"
import ArchShapeVM            from "./diagram-vm.mjs"
import SemicircleShapeVM      from "./diagram-vm.mjs"
import TriangleShapeVM        from "./diagram-vm.mjs"
import ArrowShapeVM           from "./diagram-vm.mjs"
import FanShapeVM             from "./diagram-vm.mjs"
import ClamshellShapeVM       from "./diagram-vm.mjs"
import FourCookieShapeVM      from "./diagram-vm.mjs"
import SixCookieShapeVM       from "./diagram-vm.mjs"
import SevenCookieShapeVM     from "./diagram-vm.mjs"
import NineCookieShapeVM      from "./diagram-vm.mjs"
import TwelveCookieShapeVM    from "./diagram-vm.mjs"
import FourLeafCloverShapeVM  from "./diagram-vm.mjs"
import EightLeafCloverShapeVM from "./diagram-vm.mjs"
import SunnyShapeVM           from "./diagram-vm.mjs"
import VerySunnyShapeVM       from "./diagram-vm.mjs"
import BurstShapeVM           from "./diagram-vm.mjs"
import SoftBurstShapeVM       from "./diagram-vm.mjs"
import BoomShapeVM            from "./diagram-vm.mjs"
import SoftBoomShapeVM        from "./diagram-vm.mjs"
import FlowerShapeVM          from "./diagram-vm.mjs"
import PuffyShapeVM           from "./diagram-vm.mjs"
import PuffyDiamondShapeVM    from "./diagram-vm.mjs"
import GhostishShapeVM        from "./diagram-vm.mjs"
import BunShapeVM             from "./diagram-vm.mjs"
import HeartShapeVM           from "./diagram-vm.mjs"
import PixelCircleShapeVM     from "./diagram-vm.mjs"
import PixelTriangleShapeVM   from "./diagram-vm.mjs"

// Group entity — bbox-only chrome (transparent border that highlights
// when the GroupVM's IsSelected flips true via the bridge).
import GroupVM                from "./diagram-vm.mjs"

// Per-Kind DataTemplates for the 35-shape catalogue used by the
// diagram demo. Extracted into its own resource bundle so diagram.mu
// stays focused on the diagrammer shell (toolbar, toolbox, surface,
// group overlay) rather than the 500-line per-shape strip.
//
// Every shape kind uses the same wrapping structure: a Canvas at
// $Width × $Height containing the shape primitive (Background=$FillBrush,
// Stroke=blue-on-rest) and a TextBlock label centered over it. The
// `when($IsSelected)` trigger flips the Stroke to orange. The shape
// primitive class is the only per-Kind delta.
//
// Width / Height bind to the VM so the same template paints both the
// 80×80 canvas node and the 48×48 toolbox preview.
//
// Merged into Application.Resources from diagram.mjs alongside the
// `DiagramDemo` bundle so DataTemplate dispatch by Content's type
// (ContentControl / ContentPresenter) finds the matching entry.
resources DiagramShapeTemplates {

    DataTemplate [DataType=RectangleShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Rectangle x:name="chrome"
                     [Width=$Width, Height=$Height,
                      Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=EllipseShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Ellipse x:name="chrome"
                   [Width=$Width, Height=$Height,
                    Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=SquircleShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Squircle x:name="chrome"
                    [Width=$Width, Height=$Height,
                     Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=SlantedShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Slanted x:name="chrome"
                   [Width=$Width, Height=$Height,
                    Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=PillShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Pill x:name="chrome"
                [Width=$Width, Height=$Height,
                 Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=DiamondShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Diamond x:name="chrome"
                   [Width=$Width, Height=$Height,
                    Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=PentagonShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Pentagon x:name="chrome"
                    [Width=$Width, Height=$Height,
                     Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=GemShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Gem x:name="chrome"
               [Width=$Width, Height=$Height,
                Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=ArchShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Arch x:name="chrome"
                [Width=$Width, Height=$Height,
                 Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=SemicircleShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Semicircle x:name="chrome"
                      [Width=$Width, Height=$Height,
                       Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=TriangleShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Triangle x:name="chrome"
                    [Width=$Width, Height=$Height, CornerRadius=10,
                     Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=ArrowShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Arrow x:name="chrome"
                 [Width=$Width, Height=$Height, CornerRadius=10,
                  Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=FanShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Fan x:name="chrome"
               [Width=$Width, Height=$Height,
                Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=ClamshellShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Clamshell x:name="chrome"
                     [Width=$Width, Height=$Height, CornerRadius=8,
                      Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=FourCookieShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            FourSidedCookie x:name="chrome"
                           [Width=$Width, Height=$Height, CornerRadius=10,
                            Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=SixCookieShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            SixSidedCookie x:name="chrome"
                          [Width=$Width, Height=$Height, CornerRadius=8,
                           Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=SevenCookieShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            SevenSidedCookie x:name="chrome"
                            [Width=$Width, Height=$Height, CornerRadius=8,
                             Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=NineCookieShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            NineSidedCookie x:name="chrome"
                           [Width=$Width, Height=$Height, CornerRadius=6,
                            Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=TwelveCookieShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            TwelveSidedCookie x:name="chrome"
                             [Width=$Width, Height=$Height, CornerRadius=5,
                              Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=FourLeafCloverShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            FourLeafClover x:name="chrome"
                          [Width=$Width, Height=$Height,
                           Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=EightLeafCloverShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            EightLeafClover x:name="chrome"
                           [Width=$Width, Height=$Height,
                            Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=SunnyShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Sunny x:name="chrome"
                 [Width=$Width, Height=$Height,
                  Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=VerySunnyShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            VerySunny x:name="chrome"
                     [Width=$Width, Height=$Height,
                      Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=BurstShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Burst x:name="chrome"
                 [Width=$Width, Height=$Height,
                  Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=SoftBurstShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            SoftBurst x:name="chrome"
                     [Width=$Width, Height=$Height,
                      Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=BoomShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Boom x:name="chrome"
                [Width=$Width, Height=$Height,
                 Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=SoftBoomShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            SoftBoom x:name="chrome"
                    [Width=$Width, Height=$Height,
                     Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=FlowerShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Flower x:name="chrome"
                  [Width=$Width, Height=$Height,
                   Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=PuffyShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Puffy x:name="chrome"
                 [Width=$Width, Height=$Height,
                  Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=PuffyDiamondShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            PuffyDiamond x:name="chrome"
                        [Width=$Width, Height=$Height,
                         Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=GhostishShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Ghostish x:name="chrome"
                    [Width=$Width, Height=$Height,
                     Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=BunShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Bun x:name="chrome"
               [Width=$Width, Height=$Height,
                Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=HeartShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            Heart x:name="chrome"
                 [Width=$Width, Height=$Height,
                  Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=PixelCircleShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            PixelCircle x:name="chrome"
                       [Width=$Width, Height=$Height,
                        Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
    }

    DataTemplate [DataType=PixelTriangleShapeVM] {
        Canvas x:root [Width=$Width, Height=$Height]{
            PixelTriangle x:name="chrome"
                         [Width=$Width, Height=$Height,
                          Background=$FillBrush, Stroke=#1976d2, StrokeThickness=1.5]
            TextBlock [Canvas.Left=0, Canvas.Top=0,
                       Width=$Width, Height=$Height,
                       Text=$LabelText, FontSize=11,
                       Foreground=@OnSurface,
                       HorizontalAlignment=Center, VerticalAlignment=Center]
        }
        when( $IsSelected ){ chrome.Stroke = #f97316; }
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
