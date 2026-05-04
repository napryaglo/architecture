# Vocabulary Distance

Vocabulary distance is a measure of how different two architecture locations' technology vocabularies are. It determines which migration strategies are available when moving an application from one location to another.

---

## Structure

> Vocabulary distance between two locations is determined by the proportion of the source location's technology vocabulary that cannot be expressed in the destination location's technology vocabulary.

Zero distance means everything transfers: the application can move without changing its implementation. Maximum distance means nothing transfers: the application must be rebuilt from scratch in the destination vocabulary.

In practice, distance exists on a spectrum and does not need to be computed precisely. What matters is the practical implication: can the application's existing implementation survive the move, partially survive, or must it be discarded?

---

## Distance Determines the Strategy Envelope

This is the key relationship in the model.

Small distance → Rehost and Replatform are available. The implementation survives with little or no change.

Medium distance → Replatform and Refactor are available. The implementation structure survives but significant adaptation is required.

Large distance → Rebuild and Replace are the only options. The implementation cannot survive. The business capability is carried forward; the code is not.

See [Strategy Envelope](strategy-envelope.md) for the full treatment of how distance maps to applicable strategies.

---

## Examples

**On-Premises → Azure IaaS: small distance**

VMs on physical hardware move to VMs on cloud hardware. The OS, runtime, middleware, and application code are identical. The application does not know it has moved. This is the definitional example of small vocabulary distance — Rehost is trivially available.

**On-Premises → Azure PaaS: medium distance**

The application can no longer assume control of the OS or runtime. Self-managed databases must be replaced with managed database services. Infrastructure concerns (patching, backups, scaling) are absorbed by the platform. The application's business logic survives, but its infrastructure plumbing must be rewritten. Refactor is the natural strategy.

**On-Premises → AKS: deceptively small distance**

AKS is an Azure PaaS service, which might suggest medium distance. But containers are a packaging primitive — the application logic runs unchanged inside a Docker image. The vocabulary distance is effectively small. Rehost in containerised form is a legitimate strategy even though the destination is technically PaaS. AKS is a special case: it provides a managed container orchestration platform while preserving maximum freedom over what runs inside the container.

**On-Premises → Power Platform: maximum distance**

Power Platform's vocabulary — canvas apps, model-driven forms, Dataverse tables, Power Automate flows — has no equivalent for arbitrary application code. There is no concept in Power Platform that maps to a C# class, a stored procedure, or a custom authentication mechanism. Nothing from the source vocabulary survives. This is maximum distance. Only Rebuild and Replace are available, and the distinction between them is whether the business capability is expressed in custom Power Platform development (Rebuild) or satisfied by out-of-the-box Dynamics 365 or other SaaS functionality (Replace).

---

## Distance Is Asymmetric

Distance is not necessarily the same in both directions.

On-Premises to Power Platform has maximum distance. But Power Platform to On-Premises — moving a Power Platform application back to on-premises infrastructure — is also maximum distance in the opposite direction, for a different reason: On-Premises can technically run anything, but Power Platform applications are built on proprietary platform primitives (Dataverse, connectors, the Power Platform runtime) that have no on-premises equivalent. You would need to rebuild the application using a different technology stack.

Always reason about distance in the direction the modernization path travels, not in the abstract.

---

## Practical Application

In a workshop, vocabulary distance can be communicated without using the term. The question is simply: "How much of this application can we keep when it moves?" 

- If the answer is "almost all of it" → small distance, Rehost/Replatform conversation
- If the answer is "the business logic, but we need to replumb the infrastructure" → medium distance, Refactor conversation  
- If the answer is "only the business process, not the code" → large distance, Rebuild conversation
- If the answer is "we can buy something that does this" → Replace conversation, distance is irrelevant

The architecture location model makes this conversation systematic rather than intuitive.
