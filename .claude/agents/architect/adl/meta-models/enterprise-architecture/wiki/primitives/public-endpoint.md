# Public Endpoint

A public endpoint is a component or surface that is addressable from outside the enterprise trust boundary. It is the point at which the architecture becomes visible to the world.

---

## Structure

> A public endpoint is an externally reachable surface that sits at or beyond the enterprise trust boundary, exposed to consumers who are not authenticated members of the enterprise.

Public endpoints are distinct from other components in a critical way: their existence implies exposure. Every public endpoint is a potential entry point for external actors, and its design must account for that.

---

## Examples

A customer-facing web portal. A partner API. A public mobile application backend. A citizen-facing government service. In the reference diagram, "Public Applications" is the public endpoint — it sits visually outside the Azure PaaS zone boundary, beneath the Cross-Tenant Area, accessible to consumers who are not enterprise users.

---

## Why a Separate Primitive

Most components in an architecture diagram serve internal actors — enterprise users, integration processes, administrative tooling. The fact that something is externally exposed changes the architectural conversation entirely: authentication model, DDoS protection, rate limiting, content security policies, legal terms of service, regulatory obligations (GDPR, accessibility standards), and penetration testing scope.

By marking public endpoints as a distinct primitive, the diagram forces that conversation. It is easy to overlook the external exposure of a component when it is drawn identically to all the internal components around it.

---

## Relation to Other Primitives

A public endpoint typically lives within an architecture location — usually Azure PaaS or a SaaS location. Its location determines what technology is available to secure and operate it.

External consumer actors interact *through* public endpoints. The endpoint is the architectural surface; the actor is the entity on the other side.

A public endpoint is not the same as a third-party system boundary. Third-party systems are external systems you consume (inbound or outbound system-to-system). Public endpoints are surfaces you expose to external consumers (primarily human-facing or partner-facing).
