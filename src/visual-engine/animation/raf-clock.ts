import type { IClock } from './clock.js';

// Browser clock backed by requestAnimationFrame. Lazily starts the rAF
// loop on the first Subscribe and stops it when the last subscriber
// detaches — an animation-idle app pays no per-frame cost.
//
// `Now()` reports `performance.now()` (high-resolution, monotonic). The
// rAF callback's time argument is also high-resolution and shares the
// same epoch, so Storyboard's elapsed-time math (computed from
// _beginAt captured via Clock.Now()) stays consistent whether the
// query comes from the synchronous Now() path or from a rAF tick.
//
// HtmlTarget swaps this in on AnimationManager.Instance at first
// construction:
//
//   import { AnimationManager, RafClock } from '@pragmatic-tech-ai/mural/runtime';
//   AnimationManager.Instance.Clock = new RafClock();
//
// A consumer can opt out for non-browser hosts (server-render, tests
// in Node) by leaving the default ManualClock in place and ticking it
// manually.
export class RafClock implements IClock
{
    private readonly _listeners = new Set<(now: number) => void>();
    private _rafId: number | undefined;

    public Now(): number
    {
        // performance.now() is the only monotonic high-resolution clock
        // available across browsers. Date.now() is a fallback for
        // pre-Performance environments and headless test harnesses; it
        // skews under wall-clock adjustments but the animation engine
        // only reads deltas, so the rare jump only manifests as a
        // single-tick visual hiccup, not a permanent drift.
        if (typeof performance !== 'undefined' && typeof performance.now === 'function')
        {
            return performance.now();
        }
        return Date.now();
    }

    public Subscribe(callback: (now: number) => void): () => void
    {
        this._listeners.add(callback);
        if (this._listeners.size === 1)
        {
            this.startLoop();
        }
        return (): void => {
            this._listeners.delete(callback);
            if (this._listeners.size === 0)
            {
                this.stopLoop();
            }
        };
    }

    private startLoop(): void
    {
        if (typeof requestAnimationFrame !== 'function')
        {
            // Non-browser environment without rAF — fall back to a 16 ms
            // setInterval. Animations work but at a coarser cadence; a
            // host running here is almost always a test fixture that
            // should have replaced the clock with ManualClock anyway.
            const t = setInterval(() => this.tick(this.Now()), 16) as unknown as { unref?: () => void };
            t.unref?.();
            // Encode "we used setInterval" by stashing a sentinel — the
            // negative ID branch in stopLoop picks it up.
            this._rafId = -(t as unknown as number);
            return;
        }
        const tick = (time: number): void => {
            this._rafId = requestAnimationFrame(tick);
            this.tick(time);
        };
        this._rafId = requestAnimationFrame(tick);
    }

    private stopLoop(): void
    {
        if (this._rafId === undefined) return;
        if (this._rafId < 0)
        {
            clearInterval(-this._rafId as unknown as ReturnType<typeof setInterval>);
        }
        else if (typeof cancelAnimationFrame === 'function')
        {
            cancelAnimationFrame(this._rafId);
        }
        this._rafId = undefined;
    }

    private tick(now: number): void
    {
        const snapshot = Array.from(this._listeners);
        for (const l of snapshot) l(now);
    }
}
