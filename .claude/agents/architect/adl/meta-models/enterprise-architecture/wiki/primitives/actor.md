# Actor

An actor is an entity that interacts with the architecture from outside its boundaries. Actors are not components — they do not reside inside any architecture location. They sit at the edge of the diagram and initiate or receive interactions.

---

## Structure

> An actor is a principal with identity, intent, and an entry point into the system, but no internal structure expressed in the architecture diagram.

The phrase "no internal structure expressed" is deliberate. Actors can be complex organisations or systems in their own right. The architecture diagram does not model their internals — it models their relationship to your system. An actor's detail lives in other documents: personas, user research, partner agreements, API contracts.

---

## Actor Types

### Internal — Business Users
Employees consuming AI-enabled functions as part of their work. They interact with application surfaces and are unaware of the architecture beneath. Their access is governed by enterprise identity (e.g. Entra ID) and role-based permissions tied to their organisational function.

### Internal — Operations Stakeholders
Employees responsible for the operational concerns of the architecture: IT administration, security, compliance, and governance. Unlike business users, they interact with the architecture itself — its configuration, monitoring, access controls, audit logs, and policies. They are the human enforcement layer for cross-cutting constraints.

The distinction between business users and operations stakeholders matters architecturally: they require different surfaces, different trust levels, and different audit trails. Collapsing them into a single "internal user" actor obscures governance requirements.

### External B2B
Users from partner or customer organisations operating in structured business relationships. They cross the enterprise trust boundary but do so under contractual agreements — federation, API keys, managed identities, or partner portals. Their interactions are bounded by those agreements.

### Individual Clients
End consumers interacting with the organisation's digital services. They are outside the enterprise boundary with no assumed trust relationship. All interactions happen through public endpoints, and the architecture must treat them as untrusted until authenticated through a consumer-facing identity mechanism.

### External AI Agent
An autonomous AI agent operating outside the enterprise boundary that communicates with the enterprise programmatically — typically by calling MCP servers, APIs, or other machine-readable endpoints the enterprise publishes to the internet. Unlike the human actor types above, there is no person behind each individual interaction. The agent acts autonomously, driven by its own reasoning loop, on behalf of an operator (an organisation or platform) who is the accountable principal.

This actor type arises from the **enterprise-as-MCP-server** pattern: the enterprise publishes capability endpoints that external agents discover and invoke, rather than only consuming external services itself. The trust model is therefore inverted compared to the internal MCP pattern — the enterprise is now the provider, and the external agent is the consumer.

Authentication is operator-level (API keys, OAuth 2.0 client credentials, mutual TLS). The agent itself carries no enterprise-managed identity. All access must be strictly scoped to the capabilities the published endpoint explicitly exposes, and requests must be treated as untrusted until authenticated at the boundary.

---

## Why Decomposing Actors Matters

A monolithic actor — "Enterprise Users and Administrators" — is fine for communicating topology to a senior audience. It becomes inadequate the moment you need to reason about:

- **Access control** — different roles require different permissions across different components
- **Trust boundaries** — an IT administrator in a data centre has different privileges than a business user in a browser
- **Compliance** — regulatory frameworks often require evidence that specific roles have access to specific data categories, and no others
- **Threat modelling** — an attacker is also an actor; the diagram should be able to express which entry points are exposed to which principals

Decomposing actors is one of the highest-value extensions to an enterprise topology diagram when moving from strategic framing to governance design.

---

## Actor vs. Component

The boundary matters. An actor does not run inside your architecture. A component does.

If a system is something your organisation owns, operates, and is responsible for, it is a component (or a set of components within an architecture location). If it is something outside your control that interacts with your system, it is an actor or an external system boundary.

Third-party SaaS services that your components call can be modelled either as actors (if you consume them) or as locations (if your components run within them). The right choice depends on whether you need to express what lives inside them on your diagram.
