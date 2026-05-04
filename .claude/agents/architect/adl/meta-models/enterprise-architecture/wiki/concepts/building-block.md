# Building Block

A building block is an architecture component that enables a specific step within an architecture scenario.

---

## Structure

> A building block is a component whose presence in the architecture is justified by the scenario step it enables.

The definition has two parts that must both be satisfied. First, the building block is a component — it lives inside an architecture location, inherits that location's technology vocabulary, and has an operational boundary. Second, it enables a step — there is a named scenario step that would not be possible without it. A component that cannot be tied to a scenario step has no basis for inclusion in the foundation architecture.

---

## Building Block Category vs. Building Block Instance

These are two distinct levels and the distinction matters.

**Building Block Category** — the role the component plays, expressed in technology-neutral terms. Examples: Chat Surface, Orchestrator, Language Model, Knowledge Index, Identity Boundary. A category names the capability without specifying the implementation. It belongs to the architecture model.

**Building Block Instance** — the specific technology or service that fills the category in a given deployment. Examples: Microsoft Teams (Chat Surface), Copilot Studio (Orchestrator), Azure OpenAI GPT-4o (Language Model), Azure AI Search (Knowledge Index), Entra ID (Identity Boundary). An instance belongs to the solution design, where technology choices are made concrete.

The architecture model is built from categories. Solution design resolves categories to instances. This separation allows the same architecture model to be implemented with different technology choices, and allows technology choices to change without invalidating the model.

---

## Reuse Across Scenarios

A building block category is scenario-agnostic as a catalogue entry. The same category — and often the same instance — participates in multiple scenarios. A Language Model enables the response generation step in a Conversational scenario and the reasoning step in an Agentic scenario. The building block is defined once; its role is contextualised by each scenario it participates in.

This means the building block catalogue for a foundation architecture is not a per-scenario list — it is a shared library of capabilities. Each scenario draws from the catalogue and specifies which building blocks participate and at which steps.

---

## Visual Representation

A building block is rendered differently depending on whether it stands alone or contains components.

**Standalone building block** (no components) — rendered as a lettered icon with a label below it, enclosed in an invisible bounding box (the BorderControl pattern). The bounding box has no visible border and no title. Connectors attach to the edges of the invisible box, perpendicular to the edge.

**Compound building block** (contains one or more components) — the bounding box becomes visible: it gains a border in the building block's colour and a name rendered as a title in the top-left corner of the box, matching the style of a location label. The icon and label of the building block itself are replaced by the title on the box; the box boundary is the primary visual identity. Components are nested inside the visible boundary. Connectors still attach to the outer edges of the boundary box, perpendicular to the edge.

The rule is: **the border appears if and only if there is something inside to contain.** A visible border on an empty box is meaningless; an invisible border on a box with nested components hides the containment relationship.

---

## Composition

A building block is realised by one or more architecture components. A component is a concrete technology or service that implements the building block's role in a specific deployment. The building block names the capability; components fulfil it.

One component is the minimum. Multiple components are the norm when the role requires more than one technology — for example, an Orchestrator building block may be composed of an agent runtime component and an API gateway component. Both are required; neither alone is complete.

The building block boundary contains its components. In a diagram, components are nested inside the building block's boundary rectangle.

See [Component](../primitives/component.md) for the full definition.

---

## Relationship to Other Concepts

**Component** — the unit that realises a building block. A building block is fully specified at the solution design level when each category has been resolved to one or more components.

**Architecture Scenario** — the scenario is the primary context for a building block. A building block is always defined in relation to the step it enables in a scenario.

**Architecture Location** — every building block instance lives in exactly one location. The location determines the technology vocabulary available to the instance and constrains which technologies can fill the category.

**Foundation Architecture** — the foundation architecture is the complete set of building block categories (and their instances, resolved to components) required across all defined scenarios. It is the union of all scenario-level building block requirements.

---

## Example

In the Conversational interaction pattern:

| Building Block Category | Scenario Step Enabled |
|---|---|
| Chat Surface | Receives the actor's request and presents the response |
| Orchestrator | Routes the request, manages context, coordinates model and knowledge |
| Language Model | Generates the response |
| Knowledge Index | Grounds the response in authoritative enterprise content |
| Identity Boundary | Scopes content access to what the actor is authorised to see |
