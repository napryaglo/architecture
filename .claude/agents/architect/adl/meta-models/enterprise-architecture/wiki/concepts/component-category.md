# Component Category

A component category is a named archetype that classifies architecture components by the role they play, independently of the specific technology that realises them.

---

## Structure

> A component category is to an architecture component what a class is to an object in object-oriented programming. The category defines the role and carries a default icon; the component is a concrete instantiation of that category in a specific technology context.

Every architecture component belongs to exactly one component category. The category is technology-neutral — it describes *what kind of thing* the component is, not *which product* it is. The component is technology-specific — it names the actual technology and places it in a location.

---

## Attributes

**Name** — a short, role-descriptive label. The name should be meaningful to a business or architecture stakeholder without technical knowledge of any specific product. Examples: Chat Channel, Orchestration Engine, Language Model, RAG, Knowledge Source, Semantic Index, Internal MCP Server, Public MCP Server, Legacy Application.

**Fundamental Role** — the universal structural role this category specialises. One of six values: Application, Service, Data Store, Capability Surface, Public Surface, or Federated Surface. Every specialised category traces to exactly one fundamental role. The fundamental role determines how the component participates in scenarios and what boundaries it sits at.

**Default Icon** — a visual symbol representing the category. All components that belong to this category inherit the default icon unless the component defines its own. This inheritance makes diagrams compact: when a building block contains many components of the same category, the category icon provides a consistent visual shorthand rather than requiring a unique image for every individual component.

---

## Relationship to Component

The component-to-category relationship is instantiation, not inheritance. A component does not extend a category — it *is* a specific instance of it.

| Concept | Analogy | Example |
|---|---|---|
| Component Category | Class | Chat Channel |
| Component | Object | Microsoft Teams |
| Component | Object | SharePoint Embedded |
| Component | Object | M365 Copilot |

Multiple components can instantiate the same category. There is no limit on how many components belong to a single category. A category with no components is a valid placeholder — it names a capability that has not yet been assigned a technology.

---

## Icon Inheritance

When a component is rendered in a diagram:

1. If the component has its own icon defined, that icon is used.
2. If the component has no icon of its own, the default icon of its component category is used.
3. If neither the component nor its category has an icon, the component is rendered using the standard lettered-icon fallback (the first letter of the component name in a coloured box).

This three-level resolution keeps diagrams consistent without requiring a unique icon for every component.

---

## Relationship to Other Concepts

**Component** — every component belongs to exactly one component category. The category provides the component's default icon and a shared semantic label for its role.

**Building Block** — a building block is composed of one or more components. Components within the same building block may belong to different categories, reflecting different sub-roles within the building block's overall responsibility.

**Foundation Architecture** — component categories form a vocabulary of reusable roles across the foundation architecture. The same category may appear in multiple building blocks across multiple scenarios.

---

## Fundamental Taxonomy

Every component category is a specialisation of one of six fundamental roles. These roles are universal — they apply to any architecture regardless of technology context. Specialised categories refine them with additional constraints and meaning.

**Processing role categories** — classify what the component does within a capability:

**Application** — a user-facing component through which actors perform their work and receive outcomes. Applications are the entry and exit points for human actors in any scenario. Actors never interact with services or data stores directly — always through an application. An application either initiates a call sequence (the actor triggers processing) or presents a deferred result (the actor reviews an outcome stored by a prior step).

**Service** — a system-facing processing component called by applications or other services. No user-facing interface. Receives inputs, performs computation or transformation, calls other services, writes to data stores. Distinguished from an application by the absence of human interaction; distinguished from a data store by the fact that it processes rather than persists.

**Data Store** — a persistence component where outcomes land and from which actors retrieve results via an application. Holds state — content, records, documents, events — between steps in a capability flow or between capability executions.

**Boundary role categories** — classify where the component sits relative to capability and enterprise boundaries:

**Capability Surface** — sits at the boundary between organisational units within the enterprise. Exposes one capability to other capabilities for consumption as inputs to their own flows. The delivering OU controls what it exposes; internal components remain hidden. Its presence marks an inter-capability dependency: the consuming capability cannot complete its flow without what this surface exposes.

**Public Surface** — sits at the enterprise perimeter. Exposes a capability to external parties — customers, partners, external systems, external AI agents — operating outside the enterprise trust boundary. Must enforce authentication, authorisation, and rate controls appropriate for untrusted external callers.

**Federated Surface** — spans multiple capabilities rather than sitting at the edge of one. No single capability owns it; multiple capabilities contribute to it; consumers access many underlying systems through one surface. Introduces a platform ownership question: someone must govern the federation layer even if no contributing capability does.

The two dimensions are not mutually exclusive in implementation. A capability surface is often implemented as a service; a public surface may be implemented as an application. The category captures the primary role that justifies the component's existence, not the technology used to realise it.

---

## Specialised Categories

In a specific architecture, the fundamental roles are refined into more specific categories that carry architecture-specific knowledge. Specialised categories inherit the structural meaning of their fundamental parent and add context-specific attributes.

### Catalogue

Generic specialised categories for building modern functional capabilities. Each is a specialisation of one of the six fundamental roles. Entries are technology-neutral — they name an architectural role, not a product.

#### Application

Components through which actors interact with a capability.

**Web Portal** — browser-based interface through which actors perform work or review outcomes. The primary actor-facing surface for capabilities that require rich interaction or data entry.

**Mobile App** — native or hybrid application running on a mobile device. Used where actors need to perform capability functions while away from a desktop environment.

**Desktop App** — native application running on a workstation. Used where performance, offline capability, or deep OS integration is required.

**Conversational Interface** — chat or voice surface through which actors interact using natural language. Delegates intent resolution to an orchestrating service rather than through structured forms or navigation.

**Legacy Application** — application built before modern API and integration patterns, typically without native API exposure, event capability, or agent integration. Holds significant business data and logic but requires an adapter or integration layer to participate in modern capability flows. Its presence identifies integration obligations: data that must be extracted, actions that must be wrapped, or workflows that must be bridged.

**Embedded Widget** — UI component embedded within another application. Surfaces capability functionality inside a host application without requiring the actor to switch context.

**Reporting Surface** — read-only interface presenting aggregated data, metrics, or outcomes to actors. Does not initiate processing — it presents results produced by other components.

#### Service

Components that perform processing within a capability. Actors never interact with services directly.

**API Service** — exposes capability functionality through a programmable interface. Called by applications, other services, or surfaces. Stateless by default; state is delegated to a data store.

**Workflow Engine** — orchestrates multi-step business processes involving sequences of service calls, human approvals, and conditional branching. Manages state across steps.

**Orchestration Engine** — coordinates a multi-step AI reasoning pipeline: retrieves context from knowledge sources, constructs prompts, dispatches to a language model, invokes tools or agents, and assembles the final response. Differs from a Workflow Engine in that its primary coordination target is a language model rather than a business process, and its sequencing decisions are driven by model output rather than a predefined process graph.

**Integration Adapter** — bridges incompatible systems or protocols. Translates data formats, maps identifiers, and mediates between a modern capability and a legacy or third-party system.

**Event Processor** — consumes events from a stream or queue and executes logic in response. The triggering mechanism is an event, not a direct call.

**Notification Service** — delivers alerts, messages, or updates to actors through channels such as email, push notification, or messaging platform.

**AI Agent** — autonomous or semi-autonomous service that perceives context, reasons over it, and takes action to achieve a goal. Differs from an API service in that it exercises judgment rather than executing a deterministic function.

**Language Model** — generative AI service providing reasoning, language understanding, and response generation capability. Called by AI agents or orchestrators to produce grounded or synthesised output.

**RAG** — retrieval-augmented generation service. Indexes one or more knowledge sources, retrieves content relevant to a query, and delivers that content to augment a language model's response. Its defining structural relationship is the connection to knowledge sources.

**Scheduler** — triggers actions based on time, recurrence, or deadline conditions. Initiates processing without an actor initiating the scenario directly.

**Authorization Service** — evaluates access rights for actors and components. Called at entry points and sensitive steps to enforce permission boundaries.

#### Data Store

Components that hold state within a capability.

**Relational Store** — structured data with schema enforcement and transactional consistency. Used where data integrity and complex querying are required.

**Document Store** — semi-structured data without a fixed schema. Used where data shapes vary or evolve frequently.

**File Store** — unstructured content: documents, images, video, binaries. Used where the unit of storage is a file rather than a record.

**Event Log** — ordered, append-only record of events. Used as the authoritative record of what happened in a capability over time.

**Message Queue** — temporary holding for messages between producers and consumers. Decouples the timing of production and consumption.

**Knowledge Source** — content repository that feeds a RAG pipeline. Holds the documents, records, or structured data that the RAG service indexes and retrieves from. May be a file store, relational store, or document store in implementation.

**Analytical Store** — optimised for query and aggregation over large datasets. Used for reporting, business intelligence, and trend analysis rather than transactional operations.

**Cache** — in-memory store for fast repeated access to frequently used data. Reduces latency and load on primary data stores.

#### Capability Surface

Components that sit at the boundary between functional capabilities within the enterprise.

**Internal API Gateway** — controlled access point through which other capabilities call this capability's services. Enforces authentication, rate limits, and versioning for internal consumers.

**Message Topic** — published event stream to which other capabilities subscribe. The publishing capability emits events; consuming capabilities react to them independently.

**Internal MCP Server** — capability surface using the Model Context Protocol, exposing capability functions as tools callable by AI agents in other functional capabilities.

#### Public Surface

Components that sit at the enterprise perimeter, exposing capability to external parties.

**Public API** — externally addressable interface for customers, partners, or third-party systems. Enforces authentication and rate controls appropriate for untrusted callers.

**Partner Integration Endpoint** — structured data exchange point for B2B integration with a specific partner or partner category. Governed by an agreed data contract.

**Public MCP Server** — public surface using the Model Context Protocol, exposing enterprise capabilities as tools callable by external AI agents.

#### Federated Surface

Components that span multiple functional capabilities, providing unified access over independently governed systems.

**Enterprise API Catalogue** — aggregated registry of internal APIs from multiple functional capabilities. Consumers discover and access capabilities through a single governed surface.

**Federated Identity Provider** — unified identity and authentication layer spanning multiple systems and capabilities. Actors authenticate once; the provider asserts identity across the estate.

**Semantic Index** — unified search and retrieval surface over knowledge sources from multiple functional capabilities. Consumers query one surface and receive results drawn from multiple independently governed repositories.

### Specialisation in an AI Enterprise Architecture

A specific architecture selects from the catalogue and adds its own specialisations where the generic categories don't capture domain-specific structure. In an AI enterprise architecture, the fundamental roles are specialised as follows:

| Fundamental Role | Specialised Category | Specialisation |
|---|---|---|
| Application | Chat Channel | User-facing component specifically designed for conversational interaction |
| Application | Legacy Application | User-facing component without native API exposure, requiring adaptation |
| Service | AI Agent | Processing component that exercises judgment and reasoning, not deterministic computation |
| Service | Orchestration Engine | Processing component that manages multi-step reasoning workflows |
| Service | Language Model | Processing component providing language reasoning and generation capability |
| Service | RAG | Processing component that retrieves content from Knowledge Sources to ground Language Model responses |
| Data Store | Knowledge Source | Content repository whose primary purpose is to be indexed and queried by a RAG service |
| Capability Surface | Internal MCP Server | MCP server exposing one capability's tools to AI agents in other capabilities within the enterprise |
| Public Surface | Public MCP Server | MCP server exposing enterprise capabilities to AI agents operating outside the enterprise trust boundary |
| Federated Surface | Semantic Index | Unified retrieval surface spanning knowledge sources across multiple independently governed capabilities |

---

## Example

In the Conversational scenario, the Chat Surface building block contains four components, all belonging to the same specialised category:

| Component Category | Fundamental Role | Component | Location |
|---|---|---|---|
| Chat Channel | Application | Microsoft Teams | Microsoft 365 |
| Chat Channel | Application | SharePoint Embedded | Microsoft 365 |
| Chat Channel | Application | M365 Copilot | Microsoft 365 |
| Chat Channel | Application | Dynamics 365 | Microsoft 365 |

Because all four share a category, the diagram can use the category icon as a fallback when a specific product icon is unavailable, and the model can answer queries like "show me all Chat Channel components in the foundation architecture" without inspecting each building block individually. The fundamental role column makes it possible to answer the broader query: "show me all Application-role components across the entire architecture."
