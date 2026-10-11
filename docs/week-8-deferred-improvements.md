# OWNLY AI Retail Manager — Week 8 Deferred Improvements

**Release Candidate Scope:** Week 8 Feature Freeze Hardening  
**Date:** September 28, 2026  
**Status:** Approved Deferred Backlog  

---

## Overview

In accordance with **Week 8 Feature Freeze Rules**, no new product or non-critical business features were added during Week 8. All items recorded here represent potential feature enhancements or architectural refactorings identified during system auditing and testing that are non-critical for release stability and security. They have been intentionally deferred to post-Week 8 release milestones.

---

## Backlog of Deferred Items

### 1. Multi-Store Switching UI & Cross-Store Management Dashboard
- **Category:** Feature Enhancement
- **Description:** Allow single owner accounts with multiple stores to seamlessly switch active store context from a top-nav dropdown without logging out or re-authenticating.
- **Rationale for Deferral:** Backend store isolation is fully enforced via `store_id` scoping across all APIs. Current single-store selection per user session fulfills all release security and operational criteria.

### 2. Real-Time WebSockets for Barcode Scanning & Live POS Updates
- **Category:** Infrastructure / Performance
- **Description:** Replace short-polling/REST scanning on POS register with full-duplex WebSockets for instant multi-cashier cart synchronization.
- **Rationale for Deferral:** Existing HTTP REST endpoint (`/api/inventory/barcode/:code`) executes sub-20ms indexed lookups, satisfying POS latency expectations without added socket complexity.

### 3. Automated SMS / WhatsApp Receipt Dispatching
- **Category:** Integrations
- **Description:** Integrate Twilio or WhatsApp Business API to automatically message digital invoices directly to customer phone numbers upon POS checkout.
- **Rationale for Deferral:** In-app printable receipts, browser PDF downloads, and customer email invoice generation are fully implemented and verified. Third-party messaging gateways require external production credentials.

### 4. Advanced Custom ML Model Training Pipeline UI
- **Category:** AI / ML Pipeline
- **Description:** Web GUI allowing store admins to fine-tune similarity embeddings or custom retrain ONNX/CLIP scoring weights on local store transaction history.
- **Rationale for Deferral:** The Week 7 feature-complete AI Restock pipeline (Transformers embeddings + pgvector cosine similarity + deterministic 5-factor scoring engine) operates offline with full historical backtesting capability.

### 5. Automated Cloud Database Backup Sync (S3/GCS)
- **Category:** Infrastructure
- **Description:** Automatic background upload of local JSON/SQL backup snapshots to AWS S3 or Google Cloud Storage buckets.
- **Rationale for Deferral:** The Week 5 local encrypted backup & restore system (`/api/backup/export` and `/api/backup/restore`) with SHA-256 checksum verification and health checks meets all local data protection requirements.

---

## Implementation Roadmap (Post-Release Candidate)

| Deferred Item | Target Milestone | Estimated Effort | Risk Tier |
|---------------|------------------|------------------|-----------|
| Multi-Store Switching UI | Release 1.1 | 3 Days | Low |
| Real-Time WebSockets POS | Release 1.2 | 5 Days | Medium |
| Automated SMS / WhatsApp Receipts | Release 1.1 | 2 Days | Low |
| Custom ML Retraining UI | Release 2.0 | 10 Days | High |
| Cloud Backup S3 Sync | Release 1.2 | 3 Days | Low |
