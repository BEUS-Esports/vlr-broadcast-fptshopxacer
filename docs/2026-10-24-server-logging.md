# Server logging

Approved scope: TSLog terminal output and optional local rotating JSONL files. One shared server API owns formatting, filtering, request correlation and credential redaction. Logging must not change provider recovery, database writes, HTTP responses or broadcast state.

1. Consolidate the existing live logger and diagnostic redaction into shared server logging. Use TSLog for pretty console output and `rotating-file-stream` for the optional JSONL destination. Default to info; debug includes successful reads/polling. `LOG_DIR` enables `app.jsonl`, rotated at 10 MB with seven archives. File failures leave console logging available; bound pending file writes.
2. Add request correlation and completion/error records in SvelteKit hooks. Log route patterns, method, safe action names, status and duration. Do not record headers, bodies, arbitrary query values or unknown URL paths. Explicitly log background resource-sync/cleanup outcomes and post-game operations whose results can be hidden inside HTTP 200 form-action responses.
3. Preserve live-provider events and safe nested TLS/network errors. Update their tests to observe structured records rather than console formatting. Document environment settings, level selection and the shared API.
4. Prove pretty/JSON agreement, secret redaction, level filtering, rotation, file failure behavior and request isolation with focused tests. Run existing live/provider/hook checks, type checks, targeted formatting/lint and a production build. Use temporary files and disposable databases only.

Implementation stays in the current workspace because it extends the uncommitted logging work from this conversation. No logging UI, external log service, raw payload capture or database query logging is included.
