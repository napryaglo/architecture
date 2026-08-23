// Mandatory class-identity import so the [DataType=BouncingBallVM]
// match is a real Function reference (not a string lookup).
import BouncingBallVM from "./bouncing-ball-vm.mjs"

// bouncing-ball.mu — minimal scene: dark Border framing a Canvas;
// inside it, an Ellipse positioned via Canvas.Left=$X, Canvas.Top=$Y.
// The bouncing happens in the VM's per-tick Step; the view is purely a
// passive render of (X, Y) over time.

resources BouncingBallDemo {
    Pen x:key="BallPen" [ Brush = #f59e0b, Thickness = 1.5 ]

    DataTemplate [DataType = BouncingBallVM] {
        Border x:root
            [ Fill      = @InverseSurface,
              Stroke     = Pen [ Brush = @Outline ],
              Width           = 640,
              Height          = 360 ] {
            Canvas x:name="playArea" {
                Ellipse
                    [ Canvas.Left = $X,
                      Canvas.Top  = $Y,
                      Width       = $Diameter,
                      Height      = $Diameter,
                      Fill        = #fbbf24,
                      Stroke      = @BallPen ]
            }
        }
    }
}
