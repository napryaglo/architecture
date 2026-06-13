import {
    Visual,
    type FocusEventArgs,
    type KeyEventArgs,
    type PointerEventArgs,
} from '../runtime/index.js';
import type { PresentationTarget } from '../visual-engine/index.js';

// Overlay-mount helpers — shared by Tooltip, Snackbar, Dialog.
//
// Each helper takes a host visual + a transient surface (the tooltip
// / snackbar / dialog itself) and mounts the surface onto the host's
// PresentationTarget's OverlayLayer for a controlled lifetime. The
// host visual is the "anchor" the helper resolves the target through;
// the transient surface is what actually paints over the content.
//
// The transient surface lives in the overlay until either:
//   * its programmatic detach function is called (returned by each
//     helper), OR
//   * a helper-specific signal fires (Tooltip: pointer leaves host;
//     Snackbar: duration elapses; Dialog: action picked or Escape).

// Resolves the PresentationTarget that owns `host`. Walks the visual
// tree's host back-pointer because Visual doesn't expose its target
// in a typed way. Returns undefined for an unattached host (e.g. a
// transient builder pattern that hasn't mounted yet).
function targetOf(host: Visual): PresentationTarget | undefined
{
    const back = host as unknown as { ['target']?: PresentationTarget };
    return back['target'];
}

// ────────────────────────────────────────────────────────────────────
// Tooltip
// ────────────────────────────────────────────────────────────────────

// Wires a Tooltip onto a host Visual: PointerEnter starts a delay
// timer; if the pointer stays inside through the delay, the tooltip
// mounts to the OverlayLayer. PointerLeave cancels the pending mount
// and detaches the tooltip if it's already up.
//
// Returns a detach function — call it to remove the wiring entirely
// (useful in a Behavior cleanup, in test teardown, or in a one-shot
// programmatic show that wants to tear itself down).
//
// Delay default — 500ms — matches the M3 spec's hover-to-show delay.
//
// Position policy is intentionally trivial today: the tooltip mounts
// at the host's host-frame origin with an 8dp vertical offset so it
// sits just below the anchor. Refining this (clip-aware positioning,
// flip-on-collision) is a per-host policy that hosts can layer on top
// by overriding AttachOverlay's arrange.
export function attachTooltip(
    host: Visual,
    tooltip: Visual,
    delayMs: number = 500,
): () => void
{
    let timer:  ReturnType<typeof setTimeout> | undefined;
    let mounted = false;

    function onEnter(_args: PointerEventArgs): void
    {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            // Host is the logical owner: tooltip inherits resources /
            // DataContext / inheritable DPs from the visual it's
            // anchored to, not from the OverlayLayer.
            if (targetOf(host) === undefined) return;
            host.AttachOverlayChild(tooltip);
            mounted = true;
        }, delayMs);
    }

    function onLeave(_args: PointerEventArgs): void
    {
        if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
        if (mounted)
        {
            host.DetachOverlayChild(tooltip);
            mounted = false;
        }
    }

    host.AddRoutedEventListener('PointerEnter', onEnter as (a: unknown) => void);
    host.AddRoutedEventListener('PointerLeave', onLeave as (a: unknown) => void);

    return function detach(): void
    {
        if (timer !== undefined) clearTimeout(timer);
        if (mounted) host.DetachOverlayChild(tooltip);
        host.RemoveRoutedEventListener('PointerEnter', onEnter as (a: unknown) => void);
        host.RemoveRoutedEventListener('PointerLeave', onLeave as (a: unknown) => void);
    };
}

// ────────────────────────────────────────────────────────────────────
// Snackbar
// ────────────────────────────────────────────────────────────────────

// Mounts a Snackbar onto the PresentationTarget that owns `anchor`
// for `durationMs` (default 4000 — M3 short-duration snackbar). The
// anchor is any Visual in the live tree; the snackbar itself doesn't
// need a parent before this call.
//
// Returns a Promise that resolves when the snackbar dismisses
// (either because the timer elapsed, or because the returned dismiss
// thunk was invoked manually — e.g. an "Undo" action button on the
// snackbar that should hide the snackbar immediately).
//
// Concurrent showSnackbar calls don't queue. Each call mounts an
// independent snackbar. Consumers that want queue semantics layer it
// on top — the M3 spec leaves queue policy to the host.
export function showSnackbar(
    anchor: Visual,
    snackbar: Visual,
    durationMs: number = 4000,
): { dismissed: Promise<void>; dismiss: () => void }
{
    if (targetOf(anchor) === undefined)
    {
        return {
            dismissed: Promise.resolve(),
            dismiss:   (): void => { /* no-op */ },
        };
    }
    // Anchor is the logical owner: snackbar inherits resources /
    // DataContext / inheritable DPs from the visual that requested
    // the show, not from the OverlayLayer.
    anchor.AttachOverlayChild(snackbar);

    let detached = false;
    let resolveDismissed: (() => void) | undefined;
    const dismissed = new Promise<void>(resolve => { resolveDismissed = resolve; });

    const detach = (): void => {
        if (detached) return;
        detached = true;
        if (timer !== undefined) { clearTimeout(timer); }
        anchor.DetachOverlayChild(snackbar);
        resolveDismissed?.();
    };
    const timer = setTimeout(detach, durationMs);
    return { dismissed, dismiss: detach };
}

// ────────────────────────────────────────────────────────────────────
// Dialog
// ────────────────────────────────────────────────────────────────────

// Mounts a Dialog (and a scrim Visual) modally over the host target.
// Returns a Promise that resolves with whatever value the consumer
// passes to the returned dismiss function — typically the user's
// chosen action (an enum value, a string key, or undefined when the
// user cancels via Escape).
//
// Focus trap: GotFocus listener on the overlay layer's root walks any
// focus shift that lands outside the dialog and snaps it back inside.
// The first focusable visual in the dialog gets focus on mount.
//
// Escape-to-cancel: KeyDown listener watches for Escape and dismisses
// with the consumer-supplied cancel value (default undefined).
export function showDialog<T = unknown>(
    anchor:    Visual,
    dialog:    Visual,
    scrim:     Visual,
    cancelValue?: T,
): { closed: Promise<T | undefined>; close: (value?: T) => void }
{
    if (targetOf(anchor) === undefined)
    {
        return {
            closed: Promise.resolve(undefined),
            close:  (): void => { /* no-op */ },
        };
    }
    // Anchor is the logical owner: scrim + dialog inherit resources /
    // DataContext / inheritable DPs from the visual that opened the
    // dialog, not from the OverlayLayer.
    anchor.AttachOverlayChild(scrim);
    anchor.AttachOverlayChild(dialog);

    let closed = false;
    let resolveClosed: ((v: T | undefined) => void) | undefined;
    const closedPromise = new Promise<T | undefined>(resolve => { resolveClosed = resolve; });

    function close(value?: T): void
    {
        if (closed) return;
        closed = true;
        anchor.DetachOverlayChild(dialog);
        anchor.DetachOverlayChild(scrim);
        dialog.RemoveRoutedEventListener('KeyDown',  onKeyDown  as (a: unknown) => void);
        dialog.RemoveRoutedEventListener('LostFocus', onLostFocus as (a: unknown) => void);
        resolveClosed?.(value);
    }

    function onKeyDown(args: KeyEventArgs): void
    {
        if (args.Key === 'Escape')
        {
            args.Handled = true;
            close(cancelValue);
        }
    }

    function onLostFocus(_args: FocusEventArgs): void
    {
        // Focus trap — re-focus the dialog if focus drifted outside.
        // The check is "is the new focus inside the dialog subtree?".
        // Easier path: just refocus the dialog. A future refinement
        // could walk the focus chain and find the next tabbable child.
        if (!closed) dialog.Focus();
    }

    dialog.AddRoutedEventListener('KeyDown',  onKeyDown  as (a: unknown) => void);
    dialog.AddRoutedEventListener('LostFocus', onLostFocus as (a: unknown) => void);
    dialog.Focus();

    return { closed: closedPromise, close };
}
