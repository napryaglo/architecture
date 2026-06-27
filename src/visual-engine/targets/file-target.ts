import type { Visual } from '../../runtime/index.js';
import { PresentationTarget } from './presentation-target.js';

// Output formats supported by FileTarget. Each picks a different
// renderer internally — `svg` is direct serialization, `png` needs a
// raster pass through CanvasRenderer, `pdf` needs a pdf library
// (jsPDF / pdfkit / similar — choice deferred). Scaffold only.
export enum FileTargetFormat
{
    Svg = 'svg',
    Png = 'png',
    Pdf = 'pdf',
}

export interface FileTargetOptions
{
    // Output target — either a filesystem path (Node) or a destination
    // Blob URL / OPFS handle. Concrete type pending the first writer.
    path: string;
    format: FileTargetFormat;
    // DPI for raster output (png). Vector formats (svg, pdf) ignore.
    dpi?: number;
}

// PresentationTarget for file output. The user constructs one with a
// format/path plus optional dimensions; omitted dimensions size to
// Content.DesiredSize at Save time (auto mode, same as HeadlessTarget).
//
// Scaffold only — the actual writers (SVG serializer, PNG rasterizer,
// PDF emitter) come once the renderer pipeline exists. The constructor
// signature and dimension/Content properties are settled so dependent
// code can be sketched against the API.
export class FileTarget extends PresentationTarget
{
    public readonly options: FileTargetOptions;

    constructor(options: FileTargetOptions, content?: Visual, width?: number, height?: number)
    {
        super(width, height, content);
        this.options = options;
        if (options.dpi !== undefined) this.DeviceScale = options.dpi / 96;
    }

    // Serialize Content into the configured format and write to options.path.
    // Resolves once the write completes. Implementation pending the
    // SVG / Canvas renderers — until then this throws.
    public Save(): Promise<void>
    {
        return Promise.reject(new Error(
            `FileTarget.Save: writer for format '${this.options.format}' is not implemented yet (deferred to a later build-order step).`,
        ));
    }
}
