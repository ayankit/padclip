# Clipped

Clipped is a temporary shared pad for Markdown and source code. Opening the app creates a short URL that anyone with access can use to read, edit, and manually save the pad.

The project is in early development. The current product plan includes:

- six-character pad IDs backed by a unique D1 key
- an in-place Markdown editor built with CodeMirror 6
- syntax highlighting for fenced code blocks
- optional password protection
- explicit saves with version-based conflict detection
- deletion of pads after 24 hours without a successful save

Pads remain readable while their D1 row exists. An hourly cleanup job removes expired rows. The application does not reject a read merely because the cleanup deadline has passed.

## Stack

- Svelte 5 and SvelteKit
- Cloudflare Workers
- Cloudflare D1
- Drizzle ORM
- CodeMirror 6 for editing and the planned merge view

The browser owns the editor UI. Password checks, D1 access, pad creation, and saves run in the Cloudflare Worker.

## Development

Install dependencies:

```sh
pnpm install
```

Apply D1 migrations to the local database:

```sh
pnpm db:migrate:local
```

Start the development server:

```sh
pnpm dev
```

Run type and Svelte checks:

```sh
pnpm check
```

Build the Cloudflare Worker bundle:

```sh
pnpm build
```

## Documentation

See [Clipped architecture](docs/architecture.md) for the current storage, expiry, editor, password, save, and conflict-handling decisions.
