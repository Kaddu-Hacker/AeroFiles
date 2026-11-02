# Security Notes & Threat Model — AeroFiles

This document records the trust model of AeroFiles and the disposition of
findings raised in an external audit received 2026-11-02.

## What AeroFiles is (and is not)

AeroFiles is a **local desktop application** (Tauri 2 / Rust) for browsing the
filesystem of the machine it runs on.

- The shipped binary exposes **no network listeners**. Communication between
  the UI (webview) and the Rust core happens over Tauri's IPC bridge, which is
  only reachable from the application's own webview pages.
- There are **no upload endpoints, no HTTP API, no CORS surface** in the
  product. (The optional developer preview server `scripts/serve_dev.py` binds
  `127.0.0.1` only and serves static UI files with mock data; it is not part
  of the built application.)
- File operations requested through the UI run **as the logged-in user**, with
  the same privileges and the same Recycle Bin semantics as Windows Explorer.
  Browsing arbitrary local paths is the product's purpose, not a vulnerability.

## Disposition of audit findings (2026-11-02)

| Finding | Severity claimed | Disposition |
|---|---|---|
| VULN-001 Path traversal via client-supplied upload filenames | Critical | **Not applicable.** The audit describes a web file-hosting service. AeroFiles has no upload routes, no storage directories, and no remote clients. File paths originate from the local UI acting on behalf of the local user. |
| VULN-002 MIME-type spoofing on ingested files | High | **Not applicable.** No file ingestion exists. Preview type is chosen by extension as a UX heuristic; nothing is executed or served to third parties. |
| VULN-003 Memory exhaustion from buffering whole payloads | High | **Partially accepted — real bug found and fixed in v0.1.1.** `preview_file` previously read the entire file before truncating to the 96 KB preview window; it now performs a bounded read of at most `cap + 1` bytes. Transfers and zip creation were already streamed in chunks. |
| VULN-004 Permissive wildcard CORS | Medium | **Not applicable.** No HTTP API exists to carry CORS headers. |
| VULN-005 Unhandled stream/promise rejections | Low | **Accepted with mitigations.** Frontend async paths surface errors via toasts; backend commands return `Result`. Continuous hardening applies. |
| No automated tests | — | **Accepted — fixed in v0.1.1.** Unit tests for path-conflict logic, metadata parsing, and search filtering now run in CI (`cargo test`). |
| Redis/BullMQ TTL garbage collection, TUS resumable uploads, JWT/RBAC auth, S3/R2 storage abstraction | — | **Declined as out of scope.** These are features of a multi-tenant web storage service; a local explorer has no server, no tenants, and no uploads. |
| Tauri asset-protocol scope `**` (thumbnail/image loading) | — | **Accepted risk, documented.** The scope is broad because browsing every mounted drive is the product's core function; exposure is limited to the app's own webview. |

## Hardening notes for contributors

- Keep all IPC command handlers returning `Result<T, String>` — never panic on
  user-controlled input.
- Any future networking (e.g. optional update checks) must be opt-in,
  documented here, and default-off.
- New filesystem commands should validate absolute-path inputs and prefer
  bounded reads over whole-file buffers.
