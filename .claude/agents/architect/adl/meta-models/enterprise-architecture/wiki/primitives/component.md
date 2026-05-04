# Component

A component is a named, deployable or configurable unit that resides within an architecture location. Every component belongs to exactly one location. A component's location determines its technology vocabulary — what it can be built with, how it can be operated, and what it can connect to.

---

## Component Category

Every component belongs to exactly one component category. The category classifies the component by the structural role it plays — independently of the specific technology that realises it. See [Component Category](../concepts/component-category.md) for the full taxonomy.

The fundamental roles are: Application, Service, Data Store, Capability Surface, Public Surface, and Federated Surface. In a specific architecture, these are refined into more specific categories such as Chat Channel, Language Model, RAG, or Knowledge Source.

Distinguishing component categories is not formalism for its own sake. A diagram where every box looks identical obscures whether you have sufficient service coverage, whether data ownership is clear, whether boundary surfaces are in place. When categories are explicit — through icons, grouping, or colour — those gaps become visible. The category also determines what questions are worth asking in a review: the architectural questions for an Application are about user experience and access control; for a Data Store they are about schema, ownership, residency, and lineage; for a Capability Surface they are about what is exposed and to whom.

---

## Relationship to Building Blocks

A component implements a building block. Where a building block names a capability in technology-neutral terms, a component names the thing that actually delivers it. A building block can be realised by one component or by several components working together.

This maps to the building block category / instance distinction: a *building block instance* is the realisation of a building block category through a set of components. The building block names the capability; the component fulfils it.

One component is the minimum. Multiple components are the norm when the role requires more than one technology — for example, an Orchestrator building block may be realised by a Copilot Studio agent (the routing component) and an Azure API Management instance (the API gateway component). Both components together implement the building block; neither alone is complete.

A component that cannot be tied to a building block step has no justification for inclusion in the foundation architecture.

---

## Placement

A component is always placed inside either:

- **A building block** — when the component directly implements that building block's role. The component is contained within the building block's boundary rectangle.
- **A location** — when the component provides shared infrastructure consumed by multiple building blocks and is not exclusively owned by any one of them. Examples: a shared Azure API Management gateway, a shared Entra ID tenant, an Azure Key Vault instance.

A component is never placed outside a location. Its location determines the technology vocabulary it must conform to and the governance rules it operates under.

When a component is nested inside a building block, its presence changes the visual state of that building block: the building block's boundary becomes visible (bordered, titled). See [Building Block — Visual Representation](../concepts/building-block.md#visual-representation).

---

## Component vs. Location

A component is not a location, even when a platform name appears in both contexts.

Power Platform is an architecture location. Power Apps is a component that lives within that location. The distinction matters because the location defines what is possible; the component is a specific choice within that possibility space.

Fabric is a component within Azure PaaS (or can be treated as a SaaS location in its own right for large data estates — this is a modelling decision, not a fact). The level at which you treat something as a location versus a component depends on whether you need to express components *within it* in your diagram. If you are modelling data architecture in detail, Fabric becomes a location. If you are modelling enterprise topology, it is a component.

---

## Properties

Each component has:

**Name** — what it is called, preferably the name practitioners actually use in conversation.

**Location** — which architecture location it resides in.

**Component category** — the technology-neutral archetype the component instantiates. A required attribute. Determines the component's fundamental structural role, provides its default icon, and supplies a shared semantic label for its role. See [Component Category](../concepts/component-category.md).

**Ownership** — which team or organisational unit is responsible for this component. Optional on early-stage diagrams, required once governance conversations begin.

---

## Visual Representation

Components follow the same visual rules as building blocks:

- Rendered as an icon with a label below it, enclosed in an invisible bounding box (the BorderControl pattern).
- Icon size is smaller than a building block icon when nested, to express the containment hierarchy visually.
- Connectors attach to the edges of the invisible bounding box, perpendicular to the edge, with no intersections.
- When nested inside a building block, the component's bounding box sits within the building block's visible boundary rectangle.
- When placed directly in a location, the component's bounding box sits within the location's boundary rectangle.

Components inherit their icon from their component category unless the component defines its own. See [Component Category — Icon Inheritance](../concepts/component-category.md#icon-inheritance).

---

## Relationship to Other Primitives

**Architecture Location** — every component lives in exactly one location, either directly or via the building block it is contained in. Location determines technology vocabulary.

**Actor** — actors interact with the architecture from outside. Components serve actors through application surfaces but are not actors themselves.

---

## Example

In the Conversational scenario, the Orchestrator building block may be realised by the following components:

| Component | Role within Building Block |
|---|---|
| Copilot Studio | Visual agent authoring and runtime |
| Azure API Management | API gateway — rate limiting, auth relay, logging |

Both components sit inside the Orchestrator building block. Together they fulfil the orchestration role defined by that building block.
