# PadClip architecture

This document records the current decisions for PadClip. It describes the first version we intend to build, plus the few areas we have deliberately left for later.

## Product behavior

- Opening `/` shows a creation form. Submitting Markdown and a password creates a pad and redirects the browser to `/p/{id}`.
- Pad IDs contain six case-sensitive alphanumeric characters.
- The server generates an ID, attempts to insert it into D1, and retries if the primary key already exists. Random generation alone does not guarantee uniqueness.
- Every pad requires a password. There are no accounts, so a relevant user is someone who knows the pad password or already has a valid session for that pad.
- The Worker requires a valid pad session before it returns content or accepts a save.
- Password recovery, password changes, and administrator bypasses are deliberately absent.
- Saving is manual. There is no autosave, polling, WebSocket connection, or live collaboration.
- A pad remains readable while its D1 row exists. Reads do not apply a separate expiry check.

## Runtime architecture

The browser runs the Svelte editor UI. SvelteKit server routes run in a Cloudflare Worker and are the only code allowed to access D1 or verify passwords.

```text
Browser and CodeMirror
        |
        | HTTPS
        v
SvelteKit on Cloudflare Workers
        |
        +-- password verification and session checks
        +-- pad creation, reads, and versioned saves
        |
        v
Cloudflare D1
```

The browser must never receive the D1 binding, stored password verifier, or server signing secret.

## Storage

D1 stores the Markdown as `TEXT`. The content is mostly Markdown and source code, so a single D1 field is sufficient for the planned document size.

The service measures document size as UTF-8 bytes, not JavaScript string length:

```ts
new TextEncoder().encode(content).byteLength
```

The initial server-side content limit is 1,500,000 bytes. Both the browser and server may report the limit, but the server enforces it. This leaves room below D1's 2,000,000-byte string and row limit.

The proposed tables are:

```text
pads
  id                 TEXT PRIMARY KEY
  content            TEXT NOT NULL
  content_bytes      INTEGER NOT NULL
  version            INTEGER NOT NULL
  created_at         INTEGER NOT NULL
  updated_at         INTEGER NOT NULL

pad_auth
  pad_id             TEXT PRIMARY KEY, FOREIGN KEY -> pads.id ON DELETE CASCADE
  password_salt      BLOB NOT NULL
  password_verifier  BLOB NOT NULL
```

Timestamps use UTC Unix seconds. Keeping authentication data in a separate row makes the content row simpler. The KDF and its parameters are fixed in Worker code, so they are not repeated in every row. There is also no password version because passwords cannot be changed.

## Expiry and cleanup

Pads expire through deletion, not through read-time rejection.

The repository implements deletion of pads whose `updated_at` is more than 24 hours old. This makes the intended policy 24 hours since the last successful save.

```sql
DELETE FROM pads
WHERE updated_at < unixepoch() - 86400;
```

The foreign key removes the matching `pad_auth` row with the pad. Wiring this operation to an hourly Cloudflare Cron Trigger is deferred because the SvelteKit adapter generates an HTTP-only Worker entry point. That deployment step needs a custom wrapper entry point. Once enabled, periodic cleanup means a pad can remain available for part of the next hour; if cleanup deletes an open pad, its next save returns not found.

## Saving and conflicts

Every successful save increments `pads.version`. The browser keeps three values while editing:

```text
baseContent
baseVersion
currentContent
```

A save includes `currentContent` and `baseVersion`. The Worker performs an optimistic update:

```sql
UPDATE pads
SET content = ?,
    content_bytes = ?,
    version = version + 1,
    updated_at = unixepoch()
WHERE id = ? AND version = ?;
```

If the update changes no row, the Worker checks whether the pad was deleted or changed by another user. A deleted pad returns not found. A changed pad returns a conflict with the current server content and version. The server must not silently overwrite the newer document.

The first release may show a clear conflict message without resolving it. A later resolver will use the original content, the local edit, and the current server content for a three-way merge. Retaining `baseContent` now avoids having to redesign the save flow later.

## Markdown editor

CodeMirror 6 is the editor foundation. The Markdown string remains the only document source. The current proof of concept provides source editing and syntax highlighting without converting the document into a rich-text model and serializing it back.

This choice gives exact Markdown preservation, viewport rendering for large documents, language-aware fenced code blocks, and access to CodeMirror's merge view for a future conflict screen. Live-preview decorations can be layered onto the source editor later without replacing the source string.

### UI ownership

The UI is fully customisable:

- Svelte owns the page layout, header, password form, Save button, status messages, dialogs, and mobile behavior.
- `EditorView.theme` controls editor typography, spacing, selection, cursor, gutters, and light or dark colors.
- CodeMirror extensions control key bindings, line wrapping, search, history, indentation, bracket matching, and gutters.
- Highlight styles control Markdown tokens and fenced-code syntax colors.
- Decorations and widgets provide the in-place live preview.

CodeMirror supplies the editing engine, not a fixed application shell. We do not need to accept a bundled toolbar or visual design.

### Planned live-preview scope

The live-preview layer should cover the syntax that matters for code-heavy pads:

- ATX headings
- bold, italic, and strikethrough
- inline code and fenced code blocks
- links
- blockquotes
- ordered, unordered, and task lists
- horizontal rules
- GFM autolinks

Markdown markers can hide when the cursor leaves a line and reappear on the active line. Fenced code remains directly editable and receives syntax highlighting based on its language identifier. The initial language set should cover JavaScript, TypeScript, JSX, TSX, JSON, HTML, CSS, shell, Python, Go, Rust, Java, SQL, YAML, Dockerfile, and Markdown. Language parsers should load on demand.

Tables, images, diagrams, math, footnotes, and raw HTML can remain visible as Markdown in the first release. Raw HTML must never execute inside the editor.

CodeMirror touches browser DOM APIs, so the Svelte component creates it in `onMount` and destroys the `EditorView` when the component unmounts.

## Password protection

The password is never stored as plaintext. For each pad, the Worker generates a 16-byte random salt and uses PBKDF2-HMAC-SHA-256 with 600,000 iterations to derive an HMAC key. It signs a fixed context string with that key and stores the resulting verifier alongside the salt. Verification derives the same key from the submitted password and asks Web Crypto to verify the stored HMAC.

There is no deployment-wide pepper or secret involved in password derivation. Under the current threat model, D1 is trusted. Anyone who obtains both the salt and verifier can make offline password guesses, which is why the slow KDF and strong user passwords matter. They cannot reverse the verifier directly into the original password.

The iteration count and algorithm live only in Worker code. If either changes later, existing rows would require a version or migration strategy. That complexity is intentionally omitted while passwords are immutable.

After pad creation or a successful unlock, the Worker issues a pad-specific session cookie valid for 24 hours. Its JSON payload contains a format version, pad ID, issued-at time, and expiry. The Worker signs the encoded payload with HMAC-SHA-256 using `SESSION_SIGNING_KEY` and rejects altered, expired, or wrong-pad sessions.

The cookie uses a `__Host-` name plus `Path=/`, `HttpOnly`, `Secure`, and `SameSite=Strict`. Content reads and saves verify the signature and claims, so the expensive password KDF does not run on every request.

`SESSION_SIGNING_KEY` is a random deployment secret of at least 32 bytes. It proves that a session was issued by this Worker; it does not encrypt content and is not used for password hashing. Rotating the key logs everyone out because existing cookie signatures stop verifying, but stored password verifiers and pads remain valid.

Password hashing protects the password, not the stored document. Pad content remains plaintext in D1. Client-side document encryption is outside the current scope.

Password attempts are rate limited both by pad and by Cloudflare client address. Protected content and auth responses use `Cache-Control: no-store`. State-changing requests also require the request `Origin` to match the application origin.

## Markdown safety

Editor decorations must construct known DOM elements and set user content as text. They must not inject rendered HTML with `innerHTML`.

If a later read-only mode converts Markdown to HTML, it must sanitize the result and disable raw HTML by default. Links and images need an explicit URL policy that rejects schemes such as `javascript:`.

## Route shape

```text
POST /api/pads                 create a pad
GET  /p/[id]                   load the editor shell
GET  /api/pads/[id]            read unlocked content
PUT  /api/pads/[id]            save using an expected version
POST /api/pads/[id]/unlock     verify a password and start a session
```

Opening `/` displays the creation form. The successful `POST /api/pads` response creates a session for the new pad and the browser navigates to the returned URL.

## Deferred work

- Three-way merge UI and the exact conflict-resolution library
- Hourly Cron Trigger wrapper for expiry cleanup
- Abuse controls for pad creation
- More live-preview syntax
- Read-only rendered mode
- Pad download or export

Live collaboration, polling, autosave, R2 storage, and configurable expiry are explicitly out of scope.

## References

- [CodeMirror system guide](https://codemirror.net/docs/guide/)
- [CodeMirror Markdown language support](https://www.npmjs.com/package/@codemirror/lang-markdown)
- [CodeMirror merge API](https://codemirror.net/docs/ref/#merge.unifiedMergeView)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
