import { z } from "zod";
import { InfraiAuth, type RemoteSession } from "./infrai_client.ts";

export const SessionInventoryRequest = z.object({
  user_id: z.string().min(1),
  current_session_id: z.string().min(1)
});
export type SessionInventoryRequest = z.infer<typeof SessionInventoryRequest>;

export type SessionInventory = {
  active: RemoteSession[];
  revoked_session_ids: string[];
  assets: PlayerAsset[];
  live_events: LiveEvent[];
  moderation_queue: ModerationItem[];
};

export type PlayerAsset = { asset_id: string; owner_user_id: string; state: "draft" | "published" };
export type LiveEvent = { event_id: string; asset_id: string; kind: "match" | "release" };
export type ModerationItem = { asset_id: string; reason: "player_report" | "automated_review" };

export function sessionsToRevoke(sessions: RemoteSession[], currentSessionId: string): string[] {
  return sessions.filter((session) => session.active !== false && session.session_id !== currentSessionId).map((session) => session.session_id);
}

export async function inventoryAndSignOutOthers(
  input: SessionInventoryRequest,
  client: Pick<InfraiAuth, "listSessions" | "revokeSession">,
  domain: Omit<SessionInventory, "active" | "revoked_session_ids">
): Promise<SessionInventory> {
  const request = SessionInventoryRequest.parse(input);
  const active = await client.listSessions(request.user_id);
  const revoked_session_ids = sessionsToRevoke(active, request.current_session_id);
  for (const sessionId of revoked_session_ids) await client.revokeSession(sessionId);
  return { active, revoked_session_ids, ...domain };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const user_id = process.env.GAME_USER_ID;
  const current_session_id = process.env.CURRENT_SESSION_ID;
  if (!user_id || !current_session_id) throw new Error("GAME_USER_ID and CURRENT_SESSION_ID are required");
  const result = await inventoryAndSignOutOthers(
    { user_id, current_session_id },
    new InfraiAuth(),
    { assets: [], live_events: [], moderation_queue: [] }
  );
  console.log(JSON.stringify(result, null, 2));
}
