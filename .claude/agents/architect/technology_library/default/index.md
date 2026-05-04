# Default Library — Component Catalogue

The full set of generic specialised component categories from the Pragmatic Architecture Framework's [Component Category](../../adl/meta-model/concepts/component-category.md#catalogue) catalogue, with default icons. Every category is a specialisation of one of the six fundamental roles.

Icons follow the Pragmatic Labs design system: 24×24 viewBox, 1.5px stroke, `currentColor`, no fills (filled accents only for small dots and sparkles). Themeable — picks up whatever foreground colour the surrounding context uses.

The wiring of categories → icons in YAML lives in [`index.yaml`](index.yaml). Some entries there use shorter pragmatic names (`ai-chat`, `service`, `api`, …); this doc enumerates the full meta-model vocabulary.

---

## Application

User-facing components through which actors perform work.

| Category | Icon | Description |
|---|---|---|
| Web Portal | [resources/web-portal.svg](resources/web-portal.svg) | Browser-based interface; primary actor surface for rich interaction or data entry. |
| Mobile App | [resources/mobile-app.svg](resources/mobile-app.svg) | Native or hybrid app on a mobile device. |
| Desktop App | [resources/desktop-app.svg](resources/desktop-app.svg) | Native workstation app where performance, offline, or deep OS integration is required. |
| Conversational Interface | [resources/conversational-interface.svg](resources/conversational-interface.svg) | Chat or voice surface; intent resolution delegated to an orchestrator. |
| Legacy Application | [resources/legacy_application.svg](resources/legacy_application.svg) | Pre-modern app without native API exposure; needs an adapter to participate in modern flows. |
| Embedded Widget | [resources/embedded-widget.svg](resources/embedded-widget.svg) | UI component embedded within a host application. |
| Reporting Surface | [resources/reporting-surface.svg](resources/reporting-surface.svg) | Read-only interface presenting aggregated data, metrics, or outcomes. |

## Service

System-facing processing components. Actors never interact with services directly.

| Category | Icon | Description |
|---|---|---|
| API Service | [resources/api-service.svg](resources/api-service.svg) | Programmable interface called by apps or other services. Stateless by default. |
| Workflow Engine | [resources/workflow-engine.svg](resources/workflow-engine.svg) | Orchestrates multi-step business processes, approvals, branching. |
| Orchestration Engine | [resources/orchestration-engine.svg](resources/orchestration-engine.svg) | Coordinates a multi-step AI reasoning pipeline (RAG → LM → tools). |
| Integration Adapter | [resources/integration-adapter.svg](resources/integration-adapter.svg) | Bridges incompatible systems or protocols. |
| Event Processor | [resources/event-processor.svg](resources/event-processor.svg) | Consumes events from a stream/queue and reacts. |
| Notification Service | [resources/notification-service.svg](resources/notification-service.svg) | Delivers alerts to actors via email, push, messaging. |
| AI Agent | [resources/ai-agent.svg](resources/ai-agent.svg) | Service that exercises judgement and reasoning toward a goal. |
| Language Model | [resources/language-model.svg](resources/language-model.svg) | Generative AI service for reasoning, language understanding, generation. |
| RAG | [resources/rag.svg](resources/rag.svg) | Retrieval-augmented generation; indexes knowledge sources, augments LM output. |
| Scheduler | [resources/scheduler.svg](resources/scheduler.svg) | Triggers actions by time, recurrence, or deadline. |
| Authorization Service | [resources/authorization-service.svg](resources/authorization-service.svg) | Evaluates access rights at entry points and sensitive steps. |

## Data Store

Components that hold state.

| Category | Icon | Description |
|---|---|---|
| Relational Store | [resources/relational-store.svg](resources/relational-store.svg) | Structured data with schema and transactional consistency. |
| Document Store | [resources/document-store.svg](resources/document-store.svg) | Semi-structured data without a fixed schema. |
| File Store | [resources/file-store.svg](resources/file-store.svg) | Unstructured content: documents, images, video, binaries. |
| Event Log | [resources/event-log.svg](resources/event-log.svg) | Ordered, append-only record of events. |
| Message Queue | [resources/message-queue.svg](resources/message-queue.svg) | Temporary holding for messages between producers and consumers. |
| Knowledge Source | [resources/knowledge-source.svg](resources/knowledge-source.svg) | Content repository indexed by a RAG pipeline. |
| Analytical Store | [resources/analytical-store.svg](resources/analytical-store.svg) | Optimised for query/aggregation over large datasets (BI, reporting). |
| Cache | [resources/cache.svg](resources/cache.svg) | In-memory store for fast repeated access. |

## Capability Surface

Components at the boundary between functional capabilities within the enterprise.

| Category | Icon | Description |
|---|---|---|
| Internal API Gateway | [resources/internal-api-gateway.svg](resources/internal-api-gateway.svg) | Controlled access point through which other capabilities call this one. |
| Message Topic | [resources/message-topic.svg](resources/message-topic.svg) | Published event stream consumed by other capabilities. |
| Internal MCP Server | [resources/mcp.svg](resources/mcp.svg) | MCP server exposing capability tools to AI agents in other capabilities. |

## Public Surface

Components at the enterprise perimeter, exposing capability to external parties.

| Category | Icon | Description |
|---|---|---|
| Public API | [resources/public-api.svg](resources/public-api.svg) | Externally addressable interface for customers, partners, third parties. |
| Partner Integration Endpoint | [resources/partner-integration-endpoint.svg](resources/partner-integration-endpoint.svg) | Structured B2B exchange under an agreed data contract. |
| Public MCP Server | [resources/public-mcp-server.svg](resources/public-mcp-server.svg) | MCP server exposing enterprise capabilities to external AI agents. |

## Federated Surface

Components that span multiple capabilities, providing unified access over independently governed systems.

| Category | Icon | Description |
|---|---|---|
| Enterprise API Catalogue | [resources/enterprise-api-catalogue.svg](resources/enterprise-api-catalogue.svg) | Aggregated registry of internal APIs across capabilities. |
| Federated Identity Provider | [resources/federated-identity-provider.svg](resources/federated-identity-provider.svg) | Unified identity and authentication layer across systems. |
| Semantic Index | [resources/semantic-index.svg](resources/semantic-index.svg) | Unified retrieval surface across knowledge sources from many capabilities. |
