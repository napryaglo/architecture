# Foundation Architecture

A foundation architecture is the assembly of architecture locations and components within them that covers a defined set of interaction scenarios.

It is the first complete architectural artefact for a given scope — the minimum viable architecture that can support the interaction patterns the organisation intends to enable. It does not describe every component that will ever exist in the estate; it describes the structural layer that everything else is built on top of.

---

## Structure

> A foundation architecture is an architecture location hierarchy populated with the components necessary to support a defined set of interaction scenarios.

The two parts of the definition are inseparable. The location hierarchy without components is a container with no content. The components without the location hierarchy have no structural context — no technology vocabulary, no operational boundary, no governance model. Together they produce the first legible picture of how the architecture intends to work.

---

## Scope

A foundation architecture is scoped to a set of interaction scenarios. The scenarios are defined before the architecture — they are the demand that the foundation exists to satisfy. This keeps the foundation minimal and purposeful: only the locations and components genuinely required by the scenarios are included.

The scenario set is not arbitrary. Each scenario traces to a value stream stage — a business-layer function with a defined outcome and participants. The foundation architecture therefore inherits its scope from the value stream: it covers exactly the capabilities that the identified value stream stages require. This traceability is what distinguishes a purposeful foundation architecture from an inventory of available technology.

Components that exist in the estate but are not required by any defined scenario do not belong in the foundation architecture. They may be added in subsequent increments as new scenarios are defined.

---

## Relationship to Other Primitives

**Architecture Locations** supply the structural frame. The foundation architecture inherits the full location hierarchy and selects the locations relevant to the defined scenarios.

**Components** are the units of capability. Each component belongs to exactly one location, inherits that location's technology vocabulary, and exists in the foundation because it is required by at least one interaction scenario.

**Interaction Scenarios** are the demand side. They determine which components are necessary and therefore which locations must be present. A foundation architecture without a defined scenario set has no basis for deciding what to include or exclude. Each scenario in the set traces to a value stream stage, making the foundation architecture's scope ultimately traceable to the business value stream.

**Value Stream** — the ultimate source of scope for the foundation architecture. The value stream stages determine which capabilities are needed; the capabilities determine which scenarios must be defined; the scenarios determine which components and locations must be present. The foundation architecture is the technology-layer answer to the question the value stream poses.

**Actors** are not part of the foundation architecture itself, but they constrain it. The actor taxonomy (and the trust boundaries it implies) determines what surfaces are required and what identity and access controls must be present.

---

## What a Foundation Architecture Is Not

A foundation architecture is not a complete inventory of the estate. It is not a target state. It is not a migration plan. It is the structural baseline that makes the defined interaction scenarios possible — nothing more, and nothing less.

---

## Relation to Foundation Architecture in ai_ea

In the ai_ea project, the foundation architecture covers the five interaction patterns defined in REQ-004: Conversational, Agentic, Orchestrated, Proactive, and Embedded. The location hierarchy is defined in REQ-002 and REQ-003. The components are defined in the model layer of the project, organised by interaction pattern.
