# Architecture Scenario

An architecture scenario is a desired outcome together with one or more sequences of interactions between architecture components that deliver that outcome to whichever party initiates it.

---

## Structure

> A scenario has two essential elements: a desired outcome, and one or more sequences of component interactions that produce that outcome. Each sequence has its own entry point — the actor or component that initiates it — and its own ordered step list. A scenario begins at one of its entry points and ends when the outcome is delivered or the attempt fails.

**Desired outcome** — the condition that defines success. Expressed in terms meaningful to the party that initiated the scenario. A scenario without a defined outcome cannot be evaluated — there is no basis for determining whether any of its sequences are correct or complete.

**Sequences** — one or more ordered sets of interactions between architecture components that produce the outcome. Each interaction is a call from one component to another. A scenario carries multiple sequences when the same outcome is reachable from different entry points (e.g. a user-initiated path and an agent-initiated path that both end at the same delivered outcome). Each sequence is internally a single ordered flow; alternate paths to the same outcome are separate sequences, not branches inside one sequence.

**Entry point** — the participant that initiates a sequence. Typically an actor (a party outside the component graph) but may also be a component (a sequence may be triggered by another sequence's terminal step, by a scheduler, by an inbound integration). Each sequence carries exactly one entry point.

---

## Scope

A scenario is scoped to a functional capability — the organisational unit whose components are the primary participants. Components from other functional capabilities may appear in the sequence, but only via their published surfaces. Internal components of other capabilities are not directly addressable.

---

## Traceability

Each scenario traces to a value stream stage. The stage defines the outcome the scenario must achieve, the participants who trigger it, and the functions it must perform. The scenario resolves those functions to concrete technology components and their interactions.

The traceability runs in both directions: a scenario is traceable upward to its value stream stage; a stage is realised downward by its scenario. A scenario without a traceable stage has no verified business basis. A stage without a corresponding scenario identifies a capability gap in the architecture.

---

## Structural Constraints

The component sequence is not arbitrary. Each component in the sequence plays a structurally defined role determined by its component category:

- Actors always enter the sequence through an **application** — never directly through a service or data store
- **Services** are called by applications or other services; they process, transform, and delegate
- **Data stores** receive writes from services and are read by actors through applications
- Interactions that cross a functional capability boundary pass through a **capability surface**
- Interactions that cross the enterprise perimeter pass through a **public surface**
- Interactions with shared multi-capability infrastructure pass through a **federated surface**

Some outcomes are intermediate — produced and consumed within the capability boundary, never reaching the actor directly. Only the final outcome constitutes the scenario outcome.

---

## Relationship to Other Concepts

**Functional Capability** — the capability whose components are the primary participants. The scenario is one of potentially several that together define the full interaction surface of the functional capability.

**Value Stream Stage** — the business-layer origin of the scenario. See Traceability above.

**Component Category** — determines the structural role each component plays in the sequence and the rules governing how it may interact with others.

**Components** — a component that participates in no scenario has no justification for being in the architecture.

**Foundation Architecture** — the foundation architecture is the union of all components required by the defined scenario set. Scenarios are the demand; the foundation architecture is the supply.

**Interaction Pattern** — scenarios are instances of interaction patterns. The pattern defines the category; the scenario defines the specific flow. Multiple scenarios can share the same pattern.

---

## What a Scenario Is Not

**Not a user story** — a user story describes desired behaviour from the user's perspective without reference to the architecture. A scenario describes the same behaviour in terms of specific architectural components.

**Not a process model** — a process model includes decision points, exception paths, parallel branches, and loops. A scenario describes the primary sequence of component interactions that delivers the defined outcome on the successful path. Exception handling and branching belong to component implementations.

**Not a flow diagram** — a flow diagram is a representation of a scenario, not the scenario itself. The scenario is the semantic content; the diagram is one way to communicate it.

**Not an integration design** — integration design describes technical contracts between systems. A scenario uses components as named participants without specifying internal implementation or protocols.

---

## Notation

An architecture scenario can be expressed as:

1. A list of sequences, each one a numbered list of component interaction steps prefixed by its entry point
2. A sequence diagram per sequence, using component names as participants
3. A swimlane diagram per sequence, grouping components by location or functional capability

All three representations are equivalent. The choice depends on the audience and the level of detail required. When a scenario carries several sequences, each is rendered independently — the scenario itself is the pairing of an outcome with the set of flows that achieve it, not a single picture.
