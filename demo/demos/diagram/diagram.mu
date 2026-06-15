// VM type references — every [DataType=…] below must be backed by an
// import so the compiler emits a real Function key, not a string.
import DiagramVM              from "./diagram-vm.mjs"
import ToolboxShapeVM         from "./diagram-vm.mjs"

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

// diagram.mu — node-only Visio-/drawio-style scene backed by the full
// 35-shape M3 shape library. The toolbox rail enumerates every shape
// (48×48 picture + label below), and dropping any tile onto the canvas
// creates a node of that kind. Per-Kind DataTemplate dispatch paints
// each shape with its actual primitive (Squircle, Pill, Diamond, …)
// rather than a generic Border-with-swatch.
//
// Diagram is a Selector (subclass), so:
//   * SelectionMode=Extended enables Ctrl-click toggle / Shift-click
//     range / plain-click replace.
//   * AllowMarqueeSelection=true wires the framework's rubber-band
//     behavior on the items panel — drag on empty area selects
//     intersecting nodes; click on empty area clears (Explorer parity).
//   * Per-ShapeNodeVM IsSelected stays the chrome trigger source — the
//     bootstrap mirrors Selector.SelectedItems → IsSelected on
//     SelectionChanged, so the existing `when($IsSelected)` triggers
//     keep working without per-shape template changes.

resources DiagramDemo {

    // ── Per-node container style ────────────────────────────────────
    Style x:key="DiagramNodeStyle" [TargetType=DiagramNode] {
        X = $X;
        Y = $Y;
    }

    // ── Shared Canvas ItemsPanel ────────────────────────────────────
    //
    // Canvas.MeasureOverride returns the union bounding box of its
    // children — so the canvas extent grows automatically as nodes are
    // moved / dropped past the previous bounds. The surrounding
    // ScrollViewer's scrollable extent tracks that growth because
    // Canvas.Left / Canvas.Top are flagged Measure | Arrange (see
    // src/basic/panels/canvas.ts); a position change cascades the
    // child's InvalidateMeasure up to the Canvas itself, the new
    // DesiredSize bubbles up to the ScrollViewer, and a new scrollbar
    // thumb extent is published in the same layout pass.
    ItemsPanelTemplate x:key="DiagramCanvasPanel"
    {
        PaginatedCanvas [PageWidth=800, PageHeight=600]
    }

    // ── Toolbox ItemsPanel — 2-column UniformGrid so 35 tiles fit in
    // a reasonable vertical footprint inside the 140-wide rail.
    ItemsPanelTemplate x:key="DiagramToolboxPanel"
    {
        UniformGrid [Columns=2]
    }

    // ── Toolbox tile template ───────────────────────────────────────
    //
    // ONE tile template — the picture is rendered by a ContentControl
    // hosting the ToolboxShapeVM's PreviewNode (a per-Kind ShapeNodeVM
    // sized at 48×48). The ContentControl dispatches by PreviewNode's
    // DataType, picking the matching per-Kind shape DataTemplate below.
    // That keeps the tile generic — adding a new shape Kind only needs
    // one new DataTemplate, not a new tile.
    DataTemplate x:key="DiagramTileTemplate" [DataType=ToolboxShapeVM] {
        Border x:root [IsDraggable=true, OnDragStart=$BeginKindDragData,
                       Background=@Surface, BorderBrush=@OutlineVariant,
                       BorderThickness=(1), CornerRadius=4,
                       Padding=(4,8,4,8), Margin=(2,0,2,4)]{
            StackPanel [Orientation=Vertical, HorizontalAlignment=Center]{
                ContentControl [Content=$PreviewNode,
                                Width=48, Height=48,
                                HorizontalAlignment=Center]
                TextBlock [Text=$Label, FontSize=10,
                           Foreground=@OnSurface, Margin=(0,4,0,0),
                           HorizontalAlignment=Center]
            }
        }
    }

    // ── Per-Kind canvas DataTemplates ───────────────────────────────
    //
    // Every shape kind uses the same wrapping structure: a Canvas at
    // $Width × $Height containing the shape primitive (Background=$FillBrush,
    // Stroke=blue-on-rest) and a TextBlock label centered over it. The
    // `when($IsSelected)` trigger flips the Stroke to orange. The shape
    // primitive class is the only per-Kind delta.
    //
    // Width / Height bind to the VM so the same template paints both
    // the 80×80 canvas node and the 48×48 toolbox preview.

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

    // ── Diagram shell ───────────────────────────────────────────────
    DataTemplate x:key="DiagramTemplate" [DataType=DiagramVM] {
        Border x:root [Background=@Surface, BorderBrush=@OutlineVariant,
                       BorderThickness=(1)]{
            DockPanel {

                // Header strip.
                Border[DockPanel.Dock=Top, Height=44,
                       Background=@Primary]{
                    StackPanel[Orientation=Horizontal,
                               Margin=(16,10,0,0)]{
                        TextBlock[Text="Diagrammer",
                                  FontSize=15, FontWeight=Bold,
                                  Foreground=@OnPrimary]
                        TextBlock[Text=$Status,
                                  FontSize=12,
                                  Foreground=@OnPrimary,
                                  Margin=(20,3,0,0)]
                    }
                }

                // Align / Distribute toolbar — PowerPoint-style strip
                // sitting between the header and the body row. Each
                // button binds to one of the alignment ICommands on the
                // VM; CanExecute gating drives the disabled chrome (a
                // single-shape selection disables all align buttons; <3
                // shapes disables both distribute buttons).
                //
                // Glyphs are Material Symbols Outlined ligatures —
                // matches the icon-font approach FAB uses. Each tile
                // pads the icon to a comfortable 32×32 hit target.
                Border[DockPanel.Dock=Top, Height=40,
                       Background=@SurfaceContainer,
                       BorderBrush=@OutlineVariant,
                       BorderThickness=(0,0,0,1),
                       Padding=(8,4,8,4)]{
                    StackPanel[Orientation=Horizontal]{
                        Button x:name="btnAlignLeft"
                               [Command=$AlignLeftCommand,
                                Margin=(0,0,2,0), MinWidth=32, MinHeight=32]{
                            TextBlock[Text="align_horizontal_left",
                                      FontFamily="Material Symbols Outlined",
                                      FontSize=20,
                                      HorizontalAlignment=Center,
                                      VerticalAlignment=Center]
                        }
                        Button x:name="btnAlignRight"
                               [Command=$AlignRightCommand,
                                Margin=(0,0,2,0), MinWidth=32, MinHeight=32]{
                            TextBlock[Text="align_horizontal_right",
                                      FontFamily="Material Symbols Outlined",
                                      FontSize=20,
                                      HorizontalAlignment=Center,
                                      VerticalAlignment=Center]
                        }
                        Button x:name="btnAlignTop"
                               [Command=$AlignTopCommand,
                                Margin=(8,0,2,0), MinWidth=32, MinHeight=32]{
                            TextBlock[Text="align_vertical_top",
                                      FontFamily="Material Symbols Outlined",
                                      FontSize=20,
                                      HorizontalAlignment=Center,
                                      VerticalAlignment=Center]
                        }
                        Button x:name="btnAlignMiddle"
                               [Command=$AlignMiddleCommand,
                                Margin=(0,0,2,0), MinWidth=32, MinHeight=32]{
                            TextBlock[Text="align_vertical_center",
                                      FontFamily="Material Symbols Outlined",
                                      FontSize=20,
                                      HorizontalAlignment=Center,
                                      VerticalAlignment=Center]
                        }
                        Button x:name="btnDistH"
                               [Command=$DistributeHorizontalCommand,
                                Margin=(8,0,2,0), MinWidth=32, MinHeight=32]{
                            TextBlock[Text="horizontal_distribute",
                                      FontFamily="Material Symbols Outlined",
                                      FontSize=20,
                                      HorizontalAlignment=Center,
                                      VerticalAlignment=Center]
                        }
                        Button x:name="btnDistV"
                               [Command=$DistributeVerticalCommand,
                                Margin=(0,0,0,0), MinWidth=32, MinHeight=32]{
                            TextBlock[Text="vertical_distribute",
                                      FontFamily="Material Symbols Outlined",
                                      FontSize=20,
                                      HorizontalAlignment=Center,
                                      VerticalAlignment=Center]
                        }
                    }
                }

                // Toolbox strip — ToolboxShapes drives an ItemsControl
                // bound through DiagramTileTemplate. ScrollViewer
                // accommodates the 35 tiles in the 2-column rail.
                Border[DockPanel.Dock=Left, Width=200,
                       Background=@SurfaceContainerLow,
                       BorderBrush=@OutlineVariant,
                       BorderThickness=(0,0,1,0),
                       Padding=(8)]{
                    DockPanel{
                        TextBlock[DockPanel.Dock=Top, Text="Shapes",
                                  FontSize=11, FontWeight=Bold,
                                  Foreground=@OnSurfaceVariant,
                                  Margin=(2,0,0,8)]
                        StackPanel[DockPanel.Dock=Bottom]{
                            TextBlock[Text="Document",
                                      FontSize=11, FontWeight=Bold,
                                      Foreground=@OnSurfaceVariant,
                                      Margin=(2,12,0,8)]
                            StackPanel[Orientation=Horizontal,
                                       Margin=(0,0,0,8)]{
                                Button x:name="btnSave"
                                       [Command=$SaveCommand,
                                        Margin=(0,0,4,0)]{
                                    TextBlock[Text="Save", FontSize=11]
                                }
                                Button x:name="btnLoad"
                                       [Command=$LoadCommand]{
                                    TextBlock[Text="Load", FontSize=11]
                                }
                            }
                            TextBlock[Text="Drag a shape onto the canvas to
                                            place it. Click a node to
                                            select; Ctrl-click to toggle;
                                            Shift-click to range-extend.
                                            Drag-rectangle on empty space
                                            for marquee. Click empty space
                                            to clear. Delete removes every
                                            selected node.",
                                      TextWrapping=Wrap,
                                      FontSize=10, Foreground=@OnSurfaceVariant,
                                      Margin=(2,4,2,0)]
                        }
                        ScrollViewer [IsAutoHideScrollBars=false]{
                            ItemsControl x:name="toolbox"
                                        [ItemsSource=$ToolboxShapes,
                                         ItemsPanel=@DiagramToolboxPanel]
                        }
                    }
                }

                // Drawing area — the Diagram fills the surface Border
                // directly. Its ItemsPanel is a Canvas, so DiagramNode
                // containers position themselves via Canvas.Left /
                // Canvas.Top (DiagramNode mirrors X / Y onto those
                // attached properties on each write).
                //
                // Selection wiring is declarative:
                //   * SelectionMode=Extended      — Ctrl-/Shift-click on nodes work as expected.
                //   * AllowMarqueeSelection=true  — rubber-band on the empty Canvas surface;
                //                                    plain click on empty area clears.
                //   * MarqueeBoundsPolicy=Intersect (default) — Explorer-style "touch to
                //                                    include" rather than Finder's "must enclose".
                // ScrollViewer-wrapped surface — the Canvas ItemsPanel's
                // MeasureOverride returns the union bounding box of every
                // child (max Canvas.Left + Width, max Canvas.Top + Height),
                // so dragging a node off the visible viewport (or dropping
                // one beyond the rail) grows the scrollable extent rather
                // than clipping it. `IsAutoHideScrollBars=false` keeps the
                // bars visible whenever there's overflow — handy on a
                // canvas where the user needs to know the surface extends
                // beyond what they see.
                Border x:name="surface"
                {
                    ScrollViewer x:name="scroll" [IsAutoHideScrollBars=false]{
                        Diagram x:name="nodes"
                               [ItemsSource = $Nodes,
                                ItemsPanel = @DiagramCanvasPanel,
                                ItemContainerStyle = @DiagramNodeStyle,
                                SelectionMode = Extended,
                                AllowMarqueeSelection = true,
                                Focusable = true]
                    }
                }
            }
        }
    }
}
