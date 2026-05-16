import type { Visual } from '../../runtime/index.js';
import { PresentationTarget } from '../presentation-target.js';

// HtmlTarget construction options. `backend` picks the rendering pipeline
// inside the host element (SVG node tree for <=10k visible elements,
// Canvas commands for everything else). `devicePixelRatio` lets tests
// override the default `window.devicePixelRatio`.
export interface HtmlTargetOptions
{
    backend?: 'svg' | 'canvas';
    devicePixelRatio?: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// PresentationTarget for browser hosting. Owns:
//   * the host Element (passed by the consumer — a <div>, <section>, …)
//   * the rendering surface (<svg> or <canvas>) appended inside the host
//   * a ResizeObserver that translates host size changes into
//     Width / Height updates on the PresentationTarget
//   * a one-shot read of window.devicePixelRatio into DeviceScale
//   * (deferred until build-order step 12.8) the SvgRenderer /
//     CanvasRenderer instance that does the actual painting
//
// Until the renderer is wired up, setting `Content` has no visible
// effect — the DOM mount, resize observation, and DPI tracking are all
// live and observable through the inherited PresentationTarget
// property surface, but the Visual tree is not yet painted.
export class HtmlTarget extends PresentationTarget
{
    private readonly host: Element;
    private readonly surface: SVGSVGElement; // TODO: HTMLCanvasElement when backend='canvas'
    private readonly resize_observer: ResizeObserver;
    private readonly options: Required<Pick<HtmlTargetOptions, 'backend'>> & HtmlTargetOptions;
    // private renderer: SvgRenderer | undefined; // build-order step 12.8

    constructor(host: Element, options: HtmlTargetOptions = {})
    {
        super();
        this.host = host;
        this.options = { backend: 'svg', ...options };

        this.DeviceScale = options.devicePixelRatio ?? window.devicePixelRatio ?? 1;

        const rect = host.getBoundingClientRect();
        this.Width = rect.width;
        this.Height = rect.height;

        if (this.options.backend === 'svg')
        {
            this.surface = document.createElementNS(SVG_NS, 'svg');
            this.surface.style.display = 'block';
            this.surface.style.width = '100%';
            this.surface.style.height = '100%';
            this.surface.setAttribute('width',  String(this.Width));
            this.surface.setAttribute('height', String(this.Height));
            host.appendChild(this.surface);
        }
        else
        {
            // Canvas backend lands with the CanvasRenderer in a later
            // step — for now reject so it fails loudly instead of
            // silently producing nothing.
            throw new Error("HtmlTarget: backend 'canvas' is not implemented yet (deferred to a later build-order step).");
        }

        this.resize_observer = new ResizeObserver(entries =>
        {
            // We only ever observe one element (the host), so the first
            // entry's contentRect is the new size.
            const entry = entries[0];
            if (entry === undefined) return;
            const { width, height } = entry.contentRect;
            this.Width = width;
            this.Height = height;
            this.surface.setAttribute('width',  String(width));
            this.surface.setAttribute('height', String(height));
        });
        this.resize_observer.observe(this.host);

        // TODO build-order step 12.8: instantiate the renderer:
        //   this.renderer = new SvgRenderer(this.surface, this);
    }

    // Tear down DOM listeners and unmount the surface. Call before
    // discarding an HtmlTarget so the host element is left clean.
    public Dispose(): void
    {
        this.resize_observer.disconnect();
        this.surface.remove();
        // TODO step 12.8: this.renderer?.Dispose();
    }

    // The host element passed to the constructor. Read-only access for
    // debugging and for event-routing code that needs to attach
    // listeners at the host root rather than the surface.
    public get Host(): Element { return this.host; }

    // Exposed for the renderer (when it lands) to walk the live mount
    // without going through getElementsByTagName or similar.
    public get Surface(): SVGSVGElement { return this.surface; }

    // Convenience for setting Content via constructor-style call,
    // matching the ergonomic example in the design doc:
    //   new HtmlTarget(host).Show(rootVisual);
    public Show(content: Visual): this
    {
        this.Content = content;
        return this;
    }
}
