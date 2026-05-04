# Azure AI Search

## Purpose

Hosted search and retrieval service: keyword, vector, and hybrid search with a built-in semantic ranker, integrated chunking and embedding pipelines, and skillsets for enrichment during indexing. The workhorse retrieval store behind RAG architectures on Azure — Foundry agents, Copilot Studio knowledge sources, and "OpenAI On Your Data" all sit on top of it.

## Trade-offs

- **Hybrid retrieval out of the box.** Vector + BM25 + semantic re-rank in a single query removes the need to stitch together a vector DB and a separate keyword index for production-quality recall and precision.
- **Capacity tiers shape cost and ceiling.** Replicas, partitions, and SKU choice determine throughput, index size, and feature availability (semantic ranker, integrated vectorisation). Capacity planning errors are expensive — re-tiering an index is a re-build, not a knob.
- **Index design is durable.** Field types, analysers, vector dimensions, and chunking strategy all bake into the index; correcting mistakes typically means a re-index, which on large knowledge bases is hours-to-days of compute and embedding cost.
- **Tight integration with the Microsoft AI stack — and weaker portability.** Foundry, AI Search skillsets, and Copilot Studio integrations are well-paved; lift-and-shift onto a third-party vector DB requires re-implementing the surrounding pipeline.
