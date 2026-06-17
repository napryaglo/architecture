// Text — FormattedText (the renderer-fed glyph description), the
// TextMeasurer implementations (Canvas 2D, opentype font metrics, SVG
// element fallback), and the Google Fonts loader.
export { FormattedText, FontWeight, FontStyle } from './formatted-text.js';
export { FontMetricsMeasurer } from './font-metrics-measurer.js';
export { CanvasTextMeasurer } from './canvas-text-measurer.js';
export { SvgTextMeasurer } from './svg-text-measurer.js';
export {
    loadGoogleFont,
    loadGoogleFontInto,
    type GoogleFontOptions,
    type LoadedGoogleFont,
} from './google-font-loader.js';
export { textOnPath, type TextOnPathOptions } from './text-on-path.js';
