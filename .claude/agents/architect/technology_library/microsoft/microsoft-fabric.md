# Microsoft Fabric

## Purpose

Microsoft's unified SaaS analytics platform: Data Factory, Synapse Data Engineering / Data Warehousing / Data Science / Real-Time Analytics, Power BI, and Data Activator delivered as integrated experiences on top of OneLake. Fabric is the strategic destination for analytics on the Microsoft estate — replacing the previous patchwork of Synapse, ADF, and standalone Power BI investments with a single capacity-billed surface that shares storage, security, and governance across workloads.

## Trade-offs

- **One platform reduces fragmentation.** Storage, lineage, identity, and governance line up across data engineering, warehousing, real-time, and BI; the previous overhead of stitching ADF + Synapse + Power BI is collapsed.
- **Capacity-based pricing rewards careful workload mix.** A single F-SKU runs everything but bursts and noisy-neighbour effects can starve interactive workloads; production tenants typically need either capacity headroom or workload-isolation patterns (workspaces per capacity).
- **Coexists awkwardly with prior Synapse / ADF investments.** Migration paths exist but are non-trivial; mature estates often run Fabric and Synapse side-by-side for a transitional period, which doubles operational surface.
- **Some workloads still maturing.** Newer Fabric workloads (Real-Time, Data Activator) are evolving in feature and pricing; greenfield architectures should validate the specific workload's maturity rather than assume parity with the older Synapse equivalents.
