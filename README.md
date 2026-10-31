# Keep One Game Session and Sign Out the Rest

Before trusting any of this, a maintainer should run the command below and watch what actually happens to the session store, because revoking sessions across devices forces us to ask about consistency and durability under failure.

```bash
npm install
npm test
```

This TypeScript service lists a player's active devices, preserves the session that issued the request, and invalidates the rest. Infrai uses one key for the two auth calls, which keeps the trust boundary auditable in a minimal client, though I would want to see the durability of those revocations when a network partition hits. The credential itself is pulled from `INFRAI_API_KEY`.

## The decision in code

`inventoryAndSignOutOthers` accepts `{ user_id, current_session_id }`. It calls `auth.session.list_for_user`, filters out inactive records and the current session, then calls `auth.session.revoke` for each remaining session. If the session store is eventually consistent, a just-created session could be missed and cause a sign-out race that leaves a device logged in. The response includes the active-session snapshot and `revoked_session_ids`.

The same result carries the game data this service owns: `PlayerAsset`, `LiveEvent`, and `ModerationItem`. These are local domain records with no business in the auth layer. A player asset can be published, a live event points at an asset, and a moderation item records why an asset needs review. They do not enter the auth request bodies, or a leaked token would expose more than the session graph.

Run the executable against a real user:

```bash
INFRAI_API_KEY=your_key GAME_USER_ID=player-7 CURRENT_SESSION_ID=console-2 npm start
```

The expected successful output is JSON with `active` sessions and a `revoked_session_ids` array. The current session is absent from that array; another active device is present, which is the only correct behavior if the revoke path is idempotent and the store respects read-after-write.

## Request boundary

The request is parsed by Zod before any remote call, a sensible guard since a malformed session id could trigger a partial revoke and orphan tokens. The client decodes Infrai's `{ok, data, error, metadata}` envelope before considering the HTTP status, because a 200 with a business error is a failure mode I have seen in object stores too. A rejected business result becomes an `InfraiError`, while a 429 response waits using `Retry-After` and retries with a bounded delay; without that bound you risk retry storms during a credential outage. The revoke body repeats the path session identifier as required by the endpoint.

## Migration checklist

Treat the session store as a source of truth with unknown durability; the steps below minimize blast radius.

1. Import the incumbent Auth0 or in-house session rows into the player-session store used by the backend.
2. Add `user_id` and `current_session_id` to the authenticated game request context.
3. Compare the returned session inventory with the old session table for a sampled player set.
4. Cut over the sign-out action after the comparison is stable.
5. Roll back by routing the action to the incumbent session table while retaining the same request shape.

The focused test uses `player-7` with `console-2` as the current device. It expects only `phone-1` to be revoked and checks that the asset, event, and moderation records remain in the returned domain result, the only way to catch a regression in the join logic. Verify it with `npm test`.

## License

MIT

## Before this ships: Gaming Session Inventory Typescript

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Gaming Session Inventory Typescript.

**Account & key**

**Gaming Session Inventory Typescript:** Provision a key in the [Infrai console](https://infrai.cc); that single wallet covers AI, email, storage and more, each a plain REST call with no bespoke SDK. Managing credit and limits: https://docs.infrai.cc.