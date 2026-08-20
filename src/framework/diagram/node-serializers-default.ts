// Built-in node serializer registrations.
//
// This module registers the three default NodeSerializer implementations —
// 'shape' (self-painting Figure), 'text' (TextNode), 'callout' (Callout) —
// as side effects on import.  diagram-document.ts imports this module once for its
// side effects so the registry is populated before any Save/Load call.
//
// Cycle-avoidance: this module imports FROM the concrete classes (Figure,
// TextNode, Callout) and FROM node-serialization (registry).  It does NOT
// import from diagram-document, so there is no cycle.  diagram-document.ts
// imports this module and may also import individual helpers exported here
// (serializeShapeText, applySerializedText).

import { type Brush, Color, FontStyle, FontWeight, pathGeometryFromSvgD, pathGeometryToSvgD, Pen, SolidColorBrush, TextAlignment, VerticalAlignment } from '../../visual-engine/index.js';
import { Point } from '../../runtime/index.js';
import { TextAutoFit, TextPlacement, type ShapeText } from './shape-text.js';
import {
    deserializeFlowDocument,
    serializeFlowDocument,
    type SerializedDoc,
} from './shape-text-document.js';
import { Figure } from './figure.js';
import { TextNode } from './text-node.js';
import { Callout } from './callout.js';
import { SHAPE_CATALOG_MAP } from './shape-catalog.js';
import { registerNodeSerializer } from './node-serialization.js';

// A solid brush's colour as a hex string, or undefined for a non-solid
// (gradient / image) brush that this serializer doesn't capture.
function solidHex(brush: Brush | undefined): string | undefined
{
    return brush instanceof SolidColorBrush ? brush.Color.ToHex() : undefined;
}

// ── SerializedText — internal type shared between text + callout ──────

export interface SerializedText
{
    readonly content:     string;
    readonly fontSize?:   number;
    readonly fontWeight?: FontWeight;
    readonly fontStyle?:  FontStyle;
    readonly align?:      TextAlignment;
    readonly offsetX?:    number;
    readonly offsetY?:    number;
    readonly angle?:      number;
    readonly placement?:  TextPlacement;
    readonly blockW?:     number;
    readonly blockH?:     number;
    readonly vAlign?:     VerticalAlignment;
    readonly autofit?:    TextAutoFit;
    readonly doc?:        SerializedDoc;
}

// ── Shared text-serialization helpers ────────────────────────────────
//
// These were private to diagram-document.ts; now exported here so that
// diagram-document.ts can import them back (avoiding code duplication).

/** Snapshot a ShapeText, returning undefined when there is nothing to save. */
export function serializeShapeText(st: ShapeText): SerializedText | undefined
{
    if (st.Content.length === 0 && st.Document === undefined) return undefined;
    const out: {
        content: string; fontSize?: number;
        fontWeight?: FontWeight; fontStyle?: FontStyle; align?: TextAlignment;
        offsetX?: number; offsetY?: number; angle?: number; placement?: TextPlacement;
        blockW?: number; blockH?: number; vAlign?: VerticalAlignment;
        autofit?: TextAutoFit; doc?: SerializedDoc;
    } = { content: st.Content };
    if (st.Document !== undefined)         out.doc        = serializeFlowDocument(st.Document);
    if (st.AutoFit !== TextAutoFit.None)   out.autofit    = st.AutoFit;
    if (st.FontSize      !== 12)                    out.fontSize   = st.FontSize;
    if (st.FontWeight    !== FontWeight.Normal)     out.fontWeight = st.FontWeight;
    if (st.FontStyle     !== FontStyle.Normal)      out.fontStyle  = st.FontStyle;
    if (st.TextAlignment !== TextAlignment.Center)  out.align      = st.TextAlignment;
    if (st.Offset.X !== 0)                          out.offsetX    = st.Offset.X;
    if (st.Offset.Y !== 0)                          out.offsetY    = st.Offset.Y;
    if (st.Angle !== 0)                             out.angle      = st.Angle;
    if (st.Placement !== TextPlacement.Center)      out.placement  = st.Placement;
    if (!Number.isNaN(st.BlockWidth))               out.blockW     = st.BlockWidth;
    if (!Number.isNaN(st.BlockHeight))              out.blockH     = st.BlockHeight;
    if (st.VerticalTextAlignment !== VerticalAlignment.Center) out.vAlign = st.VerticalTextAlignment;
    return out;
}

/** Hydrate a ShapeText from its snapshot. */
export function applySerializedText(st: ShapeText, data: SerializedText): void
{
    st.Content = data.content;
    if (data.fontSize   !== undefined) st.FontSize      = data.fontSize;
    if (data.fontWeight !== undefined) st.FontWeight    = data.fontWeight;
    if (data.fontStyle  !== undefined) st.FontStyle     = data.fontStyle;
    if (data.align      !== undefined) st.TextAlignment = data.align;
    if (data.offsetX !== undefined || data.offsetY !== undefined)
    {
        st.Offset = new Point(data.offsetX ?? 0, data.offsetY ?? 0);
    }
    if (data.angle     !== undefined) st.Angle                 = data.angle;
    if (data.placement !== undefined) st.Placement             = data.placement;
    if (data.blockW    !== undefined) st.BlockWidth            = data.blockW;
    if (data.blockH    !== undefined) st.BlockHeight           = data.blockH;
    if (data.vAlign    !== undefined) st.VerticalTextAlignment = data.vAlign;
    if (data.autofit   !== undefined) st.AutoFit               = data.autofit;
    if (data.doc       !== undefined) st.Document              = deserializeFlowDocument(data.doc);
}

// ── 'shape' serializer (self-painting Figure) ────────────────────────
//
// Serializers are geometry-free: `serialize` returns content only, `deserialize`
// builds the node at the origin. Geometry (position / size / rotation / scale
// baseline) lives in the `visuals` section and is applied by
// DiagramDocument._deserialize via the NodeVisualStore; the document also
// assigns Id.

registerNodeSerializer({
    type: 'shape',

    // A Figure in doc.Nodes is always a self-painting geometric shape node —
    // container Figures that wrap a content VM are transient and never enter
    // Nodes. Guard on a silhouette source as belt-and-suspenders.
    matches(node: unknown): boolean
    {
        return node instanceof Figure && node._getSource() !== undefined;
    },

    serialize(node: unknown): Record<string, unknown>
    {
        const fig = node as Figure;
        const source = fig._getSource();
        const out: Record<string, unknown> = {
            kind: fig.Kind ?? '',
            d:    source !== undefined ? pathGeometryToSvgD(source) : '',
        };
        // Persist the user-editable Fill / Stroke (Format Shape pane). Only
        // solid colours are captured; a gradient / image brush falls back to
        // the constructed default on reload (documented gap).
        const fillHex = solidHex(fig.Fill);
        if (fillHex !== undefined) out.fill = fillHex;
        const stroke = fig.Stroke;
        if (stroke !== undefined)
        {
            const strokeHex = solidHex(stroke.Brush);
            if (strokeHex !== undefined) out.stroke = strokeHex;
            out.strokeWidth = stroke.Thickness;
        }
        return out;
    },

    deserialize(data: Record<string, unknown>): Figure
    {
        const kind = typeof data.kind === 'string' ? data.kind : '';
        const d    = typeof data.d    === 'string' ? data.d    : '';
        let fig: Figure;
        if (kind !== '' && SHAPE_CATALOG_MAP.has(kind))
        {
            fig = Figure.fromKind(kind, 0, 0);
        }
        else if (d.length > 0)
        {
            fig = Figure.fromSource(pathGeometryFromSvgD(d), 0, 0, {
                kind: kind !== '' ? kind : undefined,
            });
        }
        else
        {
            // Fallback: empty source — reconstruct as a blank rectangle.
            fig = Figure.fromKind('rectangle', 0, 0);
        }
        // Restore Fill / Stroke over the constructed defaults. Geometry
        // (position / size / rotation / scale baseline) is applied by the
        // document from the visuals section.
        if (typeof data.fill === 'string') fig.Fill = new SolidColorBrush(Color.FromHex(data.fill));
        const strokeHex   = typeof data.stroke      === 'string' ? data.stroke      : undefined;
        const strokeWidth = typeof data.strokeWidth === 'number' ? data.strokeWidth : undefined;
        if (strokeHex !== undefined || strokeWidth !== undefined)
        {
            const width = strokeWidth ?? fig.Stroke?.Thickness ?? 1;
            const brush = strokeHex !== undefined ? new SolidColorBrush(Color.FromHex(strokeHex)) : fig.Stroke?.Brush;
            fig.Stroke = new Pen(brush, width);
        }
        return fig;
    },
});

// ── 'text' serializer (TextNode) ────────────────────────────────────

registerNodeSerializer({
    type: 'text',

    matches(node: unknown): boolean
    {
        // TextNode is a superclass of Callout; exclude Callout
        // so a callout doesn't match here.  The 'callout' serializer is
        // registered after this one and matches Callout explicitly.
        return node instanceof TextNode && !(node instanceof Callout);
    },

    serialize(node: unknown): Record<string, unknown>
    {
        const vm = node as TextNode;
        return { text: serializeShapeText(vm.Text) };
    },

    deserialize(data: Record<string, unknown>): TextNode
    {
        const vm = new TextNode();
        if (data.text !== undefined) applySerializedText(vm.Text, data.text as SerializedText);
        return vm;
    },
});

// ── 'callout' serializer (Callout) ─────────────────────────────
//
// NOTE: the leader-target wiring is intentionally NOT done here.
// Wiring requires all nodes to exist first.  The `leaderTargetId` is stored
// in `data` so DiagramDocument._deserialize can read it during the second
// pass (pendingLeaders) — exactly as before.  Payload byte-shape is
// identical to M3: { text, leaderTargetId }.

registerNodeSerializer({
    type: 'callout',

    matches(node: unknown): boolean
    {
        return node instanceof Callout;
    },

    serialize(node: unknown): Record<string, unknown>
    {
        const c = node as Callout;
        return {
            text:           serializeShapeText(c.Text),
            leaderTargetId: c.LeaderTargetId,
        };
    },

    deserialize(data: Record<string, unknown>): Callout
    {
        const callout = new Callout();
        if (data.text !== undefined) applySerializedText(callout.Text, data.text as SerializedText);
        // leaderTargetId is read by DiagramDocument._deserialize during the
        // second pass (pendingLeaders).  Nothing to do here.
        return callout;
    },
});
