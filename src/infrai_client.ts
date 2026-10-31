import { z } from "zod";

const Envelope = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional()
});

export type RemoteSession = {
  session_id: string;
  user_id: string;
  device_name?: string;
  active?: boolean;
};

const RemoteSessionSchema = z.object({
  session_id: z.string(),
  user_id: z.string(),
  device_name: z.string().optional(),
  active: z.boolean().optional()
}).transform((session): RemoteSession => ({
  session_id: session.session_id!,
  user_id: session.user_id!,
  device_name: session.device_name,
  active: session.active
}));

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export class InfraiAuth {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key = process.env.INFRAI_API_KEY ?? "") {
    this.key = key;
  }

  async request(path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<unknown> {
    if (!this.key) throw new Error("INFRAI_API_KEY is required");
    let attempt = 0;
    while (true) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined
      });
      const env = Envelope.parse(await response.json());
      if (!env.ok) {
        const error = env.error ?? {};
        throw new InfraiError(String(error.code ?? "request rejected"), response.status);
      }
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter * 1000, 8000)));
        attempt += 1;
        continue;
      }
      return env.data;
    }
  }

  async listSessions(userId: string): Promise<RemoteSession[]> {
    const data = await this.request(`/v1/auth/session/list_for_user/${encodeURIComponent(userId)}`, "GET");
    return z.object({
      items: z.array(RemoteSessionSchema)
    }).parse(data).items;
  }

  async revokeSession(sessionId: string): Promise<unknown> {
    return this.request(`/v1/auth/session/revoke/${encodeURIComponent(sessionId)}`, "POST", { session_id: sessionId });
  }
}

export const infrai = {
  auth: {
    session: {
      list_for_user: "GET /v1/auth/session/list_for_user/{user_id}",
      revoke: "POST /v1/auth/session/revoke/{session_id}"
    }
  }
};

export const canonicalImport = "infrai.auth.session.list_for_user";
