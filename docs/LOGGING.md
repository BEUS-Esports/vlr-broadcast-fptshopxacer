# Server logs

The Node server logs with TSLog. Each terminal line shows the timestamp, level, the `VLR` label, the event and its details:

```text
15:56:36.000 WARN [VLR] Live failure — error code: ETIMEDOUT
```

- Debug/info go to stdout; warn/error go to stderr.
- Colors follow terminal support. `NO_COLOR=1` disables them.
- Embedded newlines and terminal control characters are escaped. Nested diagnostic fields get readable labels.
- Vite and package-manager output keep their own formatting.

## Configuration

Set in `.env`, then restart the server:

```dotenv
LOG_LEVEL=info
LOG_DIR=./data/logs
```

- `LOG_LEVEL`: `debug`, `info` (default), `warn` or `error`. Filters both outputs. Invalid values fall back to `info`.
- `LOG_DIR`: optional structured copy in `app.jsonl`, rotated at 10 MB, keeping seven archives plus the current file. Leave it unset for terminal output only. Paths are relative to the server's working directory; use one directory per server process. `data/logs` is ignored by Git.

## What gets logged

- Successful GET/HEAD/OPTIONS requests, including polling, only at `debug`.
- Explicit events for mutations, form rejections, HTTP errors, the live-provider lifecycle, post-game operations, resource sync, asset cleanup and startup/shutdown.
- `http.completed` records the route pattern, method, named action, status and duration. For streaming responses, the duration covers opening the response, not the stream's lifetime.
- Enhanced forms and resource streams also log operation failures, because their HTTP status can stay 200.
- Each JSON line carries `time`, uppercase `level`, `event` and operation fields, with nested errors kept structured. Events from one request share a generated `requestId` across asynchronous work.

## Redaction

Both outputs use the same redacted records. Credentials, group codes, request headers and bodies, raw match payloads and SQL values are excluded. Provider network/TLS errors keep bounded diagnostic fields.

For new server operations, use the shared API and pass only safe metadata:

```ts
import { logEvent } from '#lib/server/logging.ts';

logEvent('info', 'example.completed', { gameId, durationMs });
// Pass known credentials as the final argument when a transport error may echo them.
logEvent('warn', 'example.failed', { provider }, cause, [accessKey, groupCode]);
```

## Reliability

- File writes are asynchronous and flush on normal Node-adapter shutdown.
- A file failure emits `logging.file.failed` and disables the file sink until restart. Terminal logging continues.
- When the pending file queue exceeds 1 MiB, new file records are dropped with a `logging.file.backpressure` warning.
- Sudden termination or disk failure can lose buffered records. These logs are for troubleshooting, not a durable audit trail.
