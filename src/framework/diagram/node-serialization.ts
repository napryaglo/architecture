// Generic per-VM node serialization registry.
//
// Each node type registers a NodeSerializer against this registry.
// DiagramDocument._serialize / _deserialize dispatch through it so
// new node kinds (ArchNodeVM, etc.) never require editing DiagramDocument.
//
// This module is deliberately class-free so concrete class modules
// (ShapeNodeVM, TextNodeVM, CalloutNodeVM) can import from here without creating
// circular dependencies.  The concrete registrations live in
// node-serializers-default.ts and are imported by diagram-document.ts for
// their side-effects.

import type { Figure } from './figure.js';
import type { NodeViewModel } from './node-view-model.js';

// ── Shared type aliases ───────────────────────────────────────────────

/** Base positional fields every serialized node record carries. */
export interface NodeBaseRecord
{
    id:   string;
    left: number;
    top:  number;
    w:    number;
    h:    number;
}

/** V2 node record: typed with a `data` bag per serializer. */
export interface SerializedNodeV2 extends NodeBaseRecord
{
    type: string;
    data: Record<string, unknown>;
}

// ── Serializer contract ───────────────────────────────────────────────

export interface NodeSerializer
{
    /** Stable discriminator tag: 'shape' | 'text' | 'callout' | … */
    readonly type: string;

    /** Return true when this serializer handles the given node instance. */
    matches(node: unknown): boolean;

    /**
     * Produce the `data` payload for this node.
     * The base fields (id, left, top, w, h) are written by DiagramDocument;
     * this callback fills only the type-specific inner record.
     */
    serialize(node: unknown): Record<string, unknown>;

    /**
     * Reconstruct the node from its `data` payload + base positional record.
     * The returned object has its `.Id` set to `base.id` and is placed at
     * `(base.left, base.top)` with size `(base.w × base.h)`.
     */
    deserialize(data: Record<string, unknown>, base: NodeBaseRecord): Figure | NodeViewModel;
}

// ── Registry ─────────────────────────────────────────────────────────

const REGISTRY: NodeSerializer[] = [];

/** Register a serializer.  Call once per type, typically at module load. */
export function registerNodeSerializer(s: NodeSerializer): void
{
    REGISTRY.push(s);
}

/** Find the serializer that handles this node instance. */
export function serializerFor(node: unknown): NodeSerializer | undefined
{
    return REGISTRY.find(s => s.matches(node));
}

/** Find the serializer for the given stable type tag. */
export function serializerByType(type: string): NodeSerializer | undefined
{
    return REGISTRY.find(s => s.type === type);
}
