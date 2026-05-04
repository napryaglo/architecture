# Architecture Definition Language — Wiki

This is a working knowledge base for an architecture definition and description standard built around a small set of precise semantic primitives. The goal is a language that is discoverable in workshops, honest about physical reality, and useful for both strategic planning and technical design.

The model grew out of a frustration with existing EA frameworks. ArchiMate is rigorous but requires training before it can be used in a room with non-architects. C4 is clear but scoped to software systems, not enterprise landscapes. TOGAF provides process but not notation. Most diagramming conventions are informal and inconsistent — the same box means different things on different diagrams.

This language tries to occupy a different position: precise enough to reason with, simple enough to use in a discovery workshop with a business stakeholder who has never heard of ArchiMate.

---

## Core Idea

Every enterprise architecture can be described using six primitive types. They are sufficient to express topology, technology strategy, governance, and modernization planning on a single canvas.

| Primitive | What it expresses |
|---|---|
| [Architecture Location](primitives/architecture-location.md) | Where components live; defines available technology choices |
| [Component](primitives/component.md) | What runs inside a location |
| [Actor](primitives/actor.md) | Who interacts with the system from outside |
| [Cross-Cutting Constraint](primitives/cross-cutting-constraint.md) | Rules that govern across location boundaries |
| [Modernization Path](primitives/modernization-path.md) | Available transformation trajectories between locations |
| [Public Endpoint](primitives/public-endpoint.md) | Externally addressable surfaces outside enterprise trust |

---

## Key Concepts

- [Technology Vocabulary](concepts/technology-vocabulary.md) — the set of tools, services, and patterns available inside a location
- [Vocabulary Distance](concepts/vocabulary-distance.md) — how much changes when moving between locations
- [Strategy Envelope](concepts/strategy-envelope.md) — which modernization strategies a path admits
- [Foundation Architecture](concepts/foundation-architecture.md) — the assembly of locations and components that covers a defined set of interaction scenarios
- [Architecture Scenario](concepts/architecture-scenario.md) — a component sequence initiated by an actor that leads to a desired outcome
- [Building Block](concepts/building-block.md) — a component that enables a specific step within an architecture scenario; exists at category level (role) and instance level (technology)
- [Component Category](concepts/component-category.md) — the archetype (class) of a component; carries a name and a default icon; components instantiate categories the way objects instantiate classes

Reference material that used to live in a separate `reference/` folder now folds into the relevant primitive or concept doc:

- The 6 Rs and the Path–Strategy Matrix → [Strategy Envelope](concepts/strategy-envelope.md)
- The standard Microsoft estate location taxonomy → [Architecture Location — Standard Taxonomy](primitives/architecture-location.md#standard-taxonomy-for-microsoft-enterprise-estates)
- The catalogue of generic specialised component categories → [Component Category — Catalogue](concepts/component-category.md#catalogue)

---

## Status

This is a living document. Definitions are stable. The visual representation standard (SVG/diagram conventions) is documented separately.

Last updated: April 2026
