# WhatsApp engine deployment

The `engine/` directory is the long-running Baileys service. Deploy it as a Docker web service on Koyeb; deploy the Next.js dashboard separately on Vercel.

## Required environment

- `MONGODB_URI` or `MONGODB_CONNECTION_STRING`
- `MONGODB_DB`
- `ENGINE_API_KEY`
- `ENGINE_INSTANCE` (`engine-1`, `engine-2`, etc.)
- `PORT=8080`

Koyeb health check: `GET /health` on port `8080`.

## Fresh start

The reset script deletes all Mongo collections in the configured database, including WhatsApp auth state and bot settings. Back up first, then run:

```bash
CONFIRM_FRESH_ENGINE_DATA=yes pnpm engine:reset
```

The script refuses to run without the explicit confirmation variable and never contains a fallback database credential.

## Scaling

Run one Koyeb service per engine instance. All instances may share MongoDB, but each bot number must be assigned to exactly one instance to avoid two Baileys sockets competing for the same WhatsApp session. Use `ENGINE_INSTANCE` to identify each service and an assignment layer before adding a number to another instance.

## Plugins

New commands belong in `src/plugins/`. Keep lifecycle, auth state, and transport code outside plugins so commands cannot accidentally own or restart sockets.
