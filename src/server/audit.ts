import "server-only";
import type { SessionUser } from "@/lib/roles";
import { env } from "./config";
import { schema, type DB } from "./db";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Append to the audit log (who did what, when). */
export async function audit(d: DB | Tx, user: SessionUser | null, entity: string, entityId: string, action: string, summary?: string) {
  await d.insert(schema.auditLog).values({
    orgId: env.orgId,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    entity,
    entityId,
    action,
    summary: summary?.slice(0, 500) ?? null,
  });
}
