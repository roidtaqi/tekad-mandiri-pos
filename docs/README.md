# Kastur documentation index

This directory contains the repository's implementation authorities. Read [`../AGENTS.md`](../AGENTS.md) first; it defines the mandatory source-of-truth order and the rules for resolving conflicts.

## Primary implementation sources

1. [Product Foundation v1](./Kastur_Product_Foundation_v1.md)
2. Business rules:
   - [D01 — Product Catalog & Unit Management](./Kastur_Business_Rules_Domain_01_Product_Catalog_Unit_Management.md)
   - [D02 — Purchasing & Receiving](./Kastur_Business_Rules_Domain_02_Purchasing_Receiving.md)
   - [D03 — Costing & Inventory Valuation](./Kastur_Business_Rules_Domain_03_Costing_Inventory_Valuation.md)
   - [D04 — Pricing, Margin & Price Governance](./Kastur_Business_Rules_Domain_04_Pricing_Margin_Price_Governance.md)
   - [D05 — Inventory & Stock Control](./Kastur_Business_Rules_Domain_05_Inventory_Stock_Control.md)
   - [D06 — Sales, POS & Transaction](./Kastur_Business_Rules_Domain_06_Sales_POS_Transaction.md)
   - [D07 — Shift, Cash & Payment Control](./Kastur_Business_Rules_Domain_07_Shift_Cash_Payment_Control.md)
   - [D08 — Identity, Role, Permission & Audit](./Kastur_Business_Rules_Domain_08_Identity_Role_Permission_Audit.md)
   - [D09 — Customer, Return & Refund](./Kastur_Business_Rules_Domain_09_Customer_Return_Refund.md)
3. [Cross-Domain Matrix D01–D10](./Kastur_Business_Rules_Cross_Domain_Matrix_D01-D10.md)
4. [Cross-Domain Gap Resolution v1](./Kastur_Cross_Domain_Gap_Resolution_v1.md)
5. [User Journeys & Operational Flows v1](./Kastur_User_Journeys_Operational_Flows_v1.md)
6. [Information Architecture v1](./Kastur_Information_Architecture_v1.md)
7. [System Architecture v1](./Kastur_System_Architecture_v1.md)
8. [Database Domain Schema v1](./Kastur_Database_Domain_Schema_v1.md)
9. [API & Sync Contract v1](./Kastur_API_Sync_Contract_v1.md)
10. [Design System v1](./Kastur_Design_System_v1.md)
11. [Screen & UX Specifications v1](./Kastur_Screen_UX_Specifications_v1.md)
12. [Legacy Code Audit v1](./Kastur_Legacy_Code_Audit_v1.md)
13. [Implementation Roadmap v1](./Kastur_Implementation_Roadmap_v1.md)

Later explicit Gap Resolution documents or accepted [ADRs](./decisions/) supersede older rules. Otherwise, surface a conflict instead of selecting new business semantics.

## Implementation handoff

- [Codex Handoff v1](./handoff/CODEX_HANDOFF_v1.md)
- [First Task M0-001](./handoff/CODEX_FIRST_TASK_M0.md)
- [Execution Sequence v1](./handoff/CODEX_EXECUTION_SEQUENCE_v1.md)
- [Task Template](./handoff/CODEX_TASK_TEMPLATE.md)

The matching root handoff files remain as bootstrap entry points. The copies under `docs/handoff/` are included so the complete handoff package is available from this index.

## Supporting planning records

- [Business Rules v1](<./Kastur Retail System — Business Rules v1.md>)
- [PRD v2](<./Kastur Retail System — PRD v2.md>)

## Known source-layout gap

`AGENTS.md` refers to `docs/business-rules/D01...D10`, while the supplied locked domain files are currently flat under `docs/` and include D01–D09 only. No standalone D10 file was supplied. This index records the actual files without inventing or reorganizing business rules; a later documentation task should reconcile the path convention and missing D10 authority explicitly.
