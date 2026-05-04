# Technology Vocabulary

A technology vocabulary is the set of tools, services, patterns, and primitives available for building and running software components within a given architecture location.

The technology vocabulary is what makes an architecture location architecturally meaningful. Without it, a location is just a named box. With it, the location becomes a constraint that shapes every design decision made within it.

---

## The Vocabulary Defines What Is Expressible

Every software system can be thought of as a statement written in the vocabulary of its location. A Power Platform application is written in canvas app controls, Power Automate flow steps, Dataverse tables, and connector actions. A containerised microservice running on AKS is written in Docker images, Kubernetes manifests, and whichever language and framework the application developer chose.

These are not interchangeable. You cannot run a Kubernetes workload in Power Platform, and you cannot express a canvas app as a container. The vocabulary of each location defines what can be built there, which in turn defines what cannot.

This is why technology choice is the right organising principle for architecture locations. The vocabulary is not a preference or a recommendation — it is a constraint. It sets the boundaries of the possible.

---

## Vocabulary Size and Developer Freedom

Larger vocabulary = more degrees of freedom. On-Premises has the largest vocabulary: any software that runs on hardware you own. IaaS narrows it slightly (you are still responsible for the OS and runtime, but you are constrained to what the hyperscaler makes available as compute and networking). PaaS narrows it further (managed runtimes, specific database services, specific integration patterns). SaaS platforms have the smallest vocabulary — you configure and extend, you do not write arbitrary code.

The inverse relationship between vocabulary size and leverage is fundamental. Small vocabularies come with large amounts of managed infrastructure, built-in governance surfaces, and faster development cycles for in-scope problems. Large vocabularies give you more control but require more of your own investment in operations, security, and governance.

Neither end of the spectrum is universally better. The architecture question is: which vocabulary does this application's requirements fit within?

---

## Vocabulary Compatibility

Two locations are vocabulary-compatible to the degree that an application built in one location's vocabulary can be expressed in the other's.

IaaS and On-Premises are highly compatible — almost any application running on bare metal can run on an IaaS VM. Power Platform and On-Premises are minimally compatible — almost nothing written in traditional application development can be carried forward to Power Platform.

This compatibility dimension is formalised as [Vocabulary Distance](vocabulary-distance.md).
