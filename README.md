# PadClip

PadClip is a temporary shared pad for Markdown and source code. Opening the app creates a short URL that anyone with access can use to read, edit, and manually save the pad.

The current proof of concept includes:

- mandatory password protection with no password recovery or change flow
- salted PBKDF2 password verifiers stored in Cloudflare D1
- signed, pad-specific session cookies
- rate-limited password attempts
- rate-limited pad creation with a 10,000-active-pad capacity guard
- explicit saves with version-based conflict detection
- request-time expiry plus hourly deletion after 24 hours without a save
- a 1,500,000-byte content limit
- CodeMirror Markdown and fenced-code syntax highlighting

The Markdown string is always the canonical document. CodeMirror edits that string directly, so opening and copying a pad does not run it through a Markdown serializer or normalize untouched source.

## Stack

- Svelte 5 and SvelteKit
- Cloudflare Workers
- Cloudflare D1
- Drizzle ORM
- CodeMirror 6
- Tailwind CSS

## Local development

Install dependencies:

```sh
pnpm install
```

Copy the local secret template and replace its placeholder with a random value of at least 32 bytes:

```sh
cp .dev.vars.example .dev.vars
openssl rand -base64 32
```

Apply the D1 migration:

```sh
pnpm db:migrate:local
```

Start the development server:

```sh
pnpm dev
```

## Verification

```sh
pnpm test
pnpm check
pnpm build
```

## Deployment setup

Store the signing key as a Worker secret. It signs session cookies and is not used to derive password verifiers.

```sh
pnpm exec wrangler secret put SESSION_SIGNING_KEY
pnpm db:migrate:remote
pnpm deploy:cleanup
```

Use a random value with at least 32 bytes of entropy. Rotating it invalidates existing sessions but does not affect passwords or pad content.

The application rejects expired pads at request time. The separate `padclip-cleanup` Worker runs hourly and deletes expired rows from D1. Deploy both Workers against the same database.

## Documentation

See [PadClip architecture](docs/architecture.md) for the current storage, expiry, editor, password, save, and conflict-handling decisions.
