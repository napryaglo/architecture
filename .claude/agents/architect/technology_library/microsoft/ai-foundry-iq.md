# AI Foundry IQ

## Purpose

Foundry's managed grounding layer — the equivalent role to Copilot Studio's knowledge sources, exposed for pro-code agents on Azure. Indexes enterprise content (SharePoint, OneDrive, Azure data sources, web), runs the chunking and embedding pipeline, and serves retrieval to Foundry-hosted agents through a single managed surface so each agent doesn't rebuild its own RAG plumbing.

## Trade-offs

- **Pro-code grounding without rolling your own RAG.** Embedding choice, chunking, ingestion scheduling, and re-indexing are managed; the agent just declares which sources to ground in. Saves the team from a multi-month custom-retrieval programme.
- **Connectors centred on the Microsoft estate.** SharePoint, OneDrive, Graph-reachable content, and Azure data services are first-class; non-Microsoft sources require custom ingestion or third-party connectors and lose some of the managed-pipeline value.
- **Cost vs build-your-own.** Managed retrieval is more expensive per query than a hand-rolled vector store on Azure AI Search, but less expensive than the team-time to build and operate equivalent retrieval at production quality.
- **Tied to the Foundry agent path.** IQ-grounded retrieval is most valuable when consumed from Foundry agents; using IQ from non-Foundry runtimes is possible but loses some of the integration and governance affordances.
