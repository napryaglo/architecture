// Targets — the abstract PresentationTarget plus its concrete host
// implementations (HtmlTarget for browsers, FileTarget for build-time
// export, HeadlessTarget for tests / SSR), and the OverlayLayer they
// paint popups into. The RafClock the browser target drives animations
// from lives in `runtime/animation` alongside the rest of the clock
// implementations.
export { PresentationTarget } from './presentation-target.js';
export { OverlayLayer } from './overlay-layer.js';
export { HtmlTarget, type HtmlTargetOptions } from './html-target.js';
export { FileTarget, type FileTargetOptions, type FileTargetFormat } from './file-target.js';
export { HeadlessTarget } from './headless-target.js';
