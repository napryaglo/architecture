// AnimationVM — drives the imperative animation showcase. Each row's
// click handler is wired in OnViewMounted via FindName; the VM keeps
// per-row Storyboard references so a fresh click stops the prior
// animation before starting the next one.
//
// Pure markup-trigger forms live in the sibling demos
// (animation-declarative, animation-named, animation-triggers).
import { MuralBase } from '@pragmatic-lab/mural/runtime';
import { Color, DoubleAnimation, Easings, LinearThicknessKeyFrame, StoryboardState, Storyboard, Thickness, ThicknessAnimationUsingKeyFrames, cubicBezier, } from '@pragmatic-lab/mural/runtime';
import { SolidColorBrushAnimation } from '@pragmatic-lab/mural/visual-engine';
export class AnimationVM extends MuralBase {
    OnViewMounted(view) {
        // ── Row 1: slide ─────────────────────────────────────────────
        const slideBtn = view.FindName('slideBtn');
        const slideTarget = view.FindName('slideTarget');
        let slideSb;
        slideBtn.AddClickHandler(() => {
            // Stop any previous slide so two overlapping storyboards
            // don't both write to the animation slot every frame.
            slideSb?.Stop();
            // Reset to the From end. The local-write goes to the Local
            // slot regardless of the (now-cleared) animation slot, so
            // the new BeginAnimation captures baseValue = 100.
            slideTarget.Width = 100;
            slideSb = slideTarget.BeginAnimation('Width', new DoubleAnimation({
                To: 300,
                Duration: 600,
                Easing: Easings.CubicOut,
            }));
        });
        // ── Row 2: bouncing loop ─────────────────────────────────────
        const loopBtn = view.FindName('loopBtn');
        const loopTarget = view.FindName('loopTarget');
        const loopLabel = loopBtn.Content; // TextBlock inside the Button
        let loopSb;
        loopBtn.AddClickHandler(() => {
            if (loopSb !== undefined && loopSb.State === StoryboardState.Running) {
                loopSb.Stop();
                loopLabel.Text = 'Start';
                return;
            }
            loopSb = loopTarget.BeginAnimation('Width', new DoubleAnimation({
                From: 100,
                To: 250,
                Duration: 800,
                Easing: Easings.QuadInOut,
                AutoReverse: true,
                RepeatBehavior: Number.POSITIVE_INFINITY,
            }));
            loopLabel.Text = 'Stop';
        });
        // ── Row 3: keyframe Padding ripple ───────────────────────────
        const pulseBtn = view.FindName('pulseBtn');
        const pulseTarget = view.FindName('pulseTarget');
        let pulseSb;
        pulseBtn.AddClickHandler(() => {
            pulseSb?.Stop();
            pulseSb = pulseTarget.BeginAnimation('Padding', new ThicknessAnimationUsingKeyFrames({
                KeyFrames: [
                    new LinearThicknessKeyFrame({
                        KeyTime: 200, Value: new Thickness(24, 8, 24, 8),
                    }),
                    new LinearThicknessKeyFrame({
                        KeyTime: 400, Value: new Thickness(8, 24, 8, 24),
                    }),
                    new LinearThicknessKeyFrame({
                        KeyTime: 600, Value: new Thickness(8),
                    }),
                ],
            }));
        });
        // ── Row 4: brush colour fade ─────────────────────────────────
        const colorBtn = view.FindName('colorBtn');
        const colorTarget = view.FindName('colorTarget');
        const blue = new Color(25, 118, 210, 255); // matches #1976d2
        const green = new Color(76, 175, 80, 255); // matches #4caf50
        const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
        let colorSb;
        colorBtn.AddClickHandler(() => {
            colorSb?.Stop();
            // Compose a two-leg Storyboard: blue → green → blue, with
            // BeginTime offsetting the second leg until the first ends.
            colorSb = new Storyboard();
            colorSb.Add(colorTarget, 'Fill', new SolidColorBrushAnimation({
                From: blue, To: green, Duration: 500, Easing: easeInOut,
            }));
            colorSb.Add(colorTarget, 'Fill', new SolidColorBrushAnimation({
                BeginTime: 500,
                From: green, To: blue, Duration: 500, Easing: easeInOut,
            }));
            colorSb.Begin();
        });
        // ── Row 5: two cubic-bezier curves side-by-side ──────────────
        const bezierBtn = view.FindName('bezierBtn');
        const bezierA = view.FindName('bezierA');
        const bezierB = view.FindName('bezierB');
        const overshoot = cubicBezier(0.68, -0.55, 0.27, 1.55);
        let bezierSb;
        bezierBtn.AddClickHandler(() => {
            bezierSb?.Stop();
            bezierA.Width = 100;
            bezierB.Width = 100;
            bezierSb = new Storyboard();
            bezierSb.Add(bezierA, 'Width', new DoubleAnimation({
                From: 100, To: 320, Duration: 900, Easing: Easings.Linear,
            }));
            bezierSb.Add(bezierB, 'Width', new DoubleAnimation({
                From: 100, To: 320, Duration: 900, Easing: overshoot,
            }));
            bezierSb.Begin();
        });
    }
}
