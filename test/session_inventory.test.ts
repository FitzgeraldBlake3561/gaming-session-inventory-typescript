import assert from "node:assert/strict";
import test from "node:test";
import { sessionsToRevoke, inventoryAndSignOutOthers } from "../src/session_inventory_service.ts";

test("keeps the current game session and signs out other active devices", async () => {
  const calls: string[] = [];
  const sessions = [
    { session_id: "phone-1", user_id: "player-7", active: true },
    { session_id: "console-2", user_id: "player-7", active: true },
    { session_id: "old-web", user_id: "player-7", active: false }
  ];
  assert.deepEqual(sessionsToRevoke(sessions, "console-2"), ["phone-1"]);
  const result = await inventoryAndSignOutOthers(
    { user_id: "player-7", current_session_id: "console-2" },
    { listSessions: async () => sessions, revokeSession: async (id) => { calls.push(id); } },
    {
      assets: [{ asset_id: "skin-9", owner_user_id: "player-7", state: "published" }],
      live_events: [{ event_id: "event-3", asset_id: "skin-9", kind: "release" }],
      moderation_queue: [{ asset_id: "skin-9", reason: "player_report" }]
    }
  );
  assert.deepEqual(calls, ["phone-1"]);
  assert.deepEqual(result.revoked_session_ids, ["phone-1"]);
});
