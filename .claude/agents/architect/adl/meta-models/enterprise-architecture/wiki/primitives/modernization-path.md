# Modernization Path

A modernization path is a directed trajectory between two architecture locations, representing a viable option for moving an application from its current location to a target location.

Modernization paths are not integration connections. They do not describe data flowing between components at runtime. They describe *transformation options* — strategic choices available to the organisation about where an application could live in the future.

---

## Structure

> A modernization path connects a source architecture location to a destination architecture location and constrains the set of applicable migration strategies to those compatible with the technology vocabulary distance between the two locations.

Each path carries two things: a direction (where you can go) and a strategy envelope (what you can do when you get there).

---

## Strategy Envelope

Not every migration strategy is available on every path. The technology vocabulary distance between the source and destination location determines which of the 6 Rs are applicable.

See [Vocabulary Distance](../concepts/vocabulary-distance.md) for the formal definition of distance.

See [Strategy Envelope](../concepts/strategy-envelope.md) for how distance maps to applicable strategies.

See [Strategy Envelope — Path–Strategy Matrix](../concepts/strategy-envelope.md#pathstrategy-matrix) for the complete mapping across standard paths.

---

## The Distance Insight

A small vocabulary distance means the application's existing implementation can survive the journey, at least partially. Rehost and Replatform are available because the destination location understands the same (or very similar) primitives.

A large vocabulary distance means the implementation cannot survive. The destination location's technology vocabulary is too different or too constrained to express what the application currently does. Only Rebuild or Replace are available — you carry the *business capability* forward, not the code.

**Example — small distance:** On-Premises to Azure IaaS. The application runs on a VM either way. Rehost (lift-and-shift) is straightforward. The OS, runtime, and application stack are identical; only the hardware ownership changes.

**Example — large distance:** On-Premises to Power Platform. Power Platform's vocabulary — canvas apps, model-driven apps, Power Automate flows, Dataverse — has no equivalent to a custom-developed C# application with its own database schema and business logic. The application must be rebuilt from scratch using the platform's primitives. Rehost is not even theoretically possible.

**Example — deceptive distance:** On-Premises to AKS (containerize). The destination is Azure PaaS, which might imply a large vocabulary shift. But containers are a *packaging primitive*, not a vocabulary change. The application logic runs unchanged inside the container. The distance for AKS is effectively small, even though the destination location is PaaS. Rehost in containerized form is a valid strategy.

---

## Numbered Paths

In diagram notation, each modernization path is assigned a number. The number is an identity — it allows the path to be referenced from a companion legend, a strategy document, or a workshop discussion without annotating the diagram itself.

The legend defines for each path:
- Source location (or location type, if the path applies broadly)
- Destination location
- Applicable strategy envelope (which Rs)
- Brief label (e.g., "Rebuild on Power Platform", "Containerize to AKS")

The diagram surface shows trajectories. The legend surface shows strategy. Keeping them separate prevents diagram clutter while preserving the semantic connection.

---

## Path vs. Decision

A modernization path is an *option*, not a prescription. Its presence on the diagram means an application at the source location *could* travel this route — not that it should. The decision for any specific application involves:

1. Which paths originate from the application's current location
2. Which strategies within those paths' envelopes are viable given the application's characteristics
3. Business constraints — cost, risk tolerance, timelines, team capability

The path narrows the conversation. The application assessment makes the decision.

---

## What a Path Is Not

A path is not a migration project plan. It describes the option; execution is a separate concern.

A path is not an integration connection. Runtime data flows between components are a different primitive entirely.

A path is not bidirectional by default. The fact that On-Premises applications can modernize to Power Platform does not mean Power Platform applications should move to On-Premises. Directionality matters and should be drawn explicitly.
