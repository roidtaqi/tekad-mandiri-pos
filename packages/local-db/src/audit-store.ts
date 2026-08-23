import type { Dexie } from "dexie";

export interface LocalAuditEventRecord {
  readonly id: string;
  readonly business_id: string;
  readonly location_id: string | null;
  readonly actor_type: "USER" | "SYSTEM" | "SYNC" | "AUTOMATION";
  readonly actor_user_id: string | null;
  readonly actor_role_snapshot: string | null;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly occurred_at: string;
  readonly recorded_at: string;
  readonly device_id: string | null;
  readonly session_id: string | null;
  readonly reason: string | null;
  readonly before_data: Readonly<Record<string, unknown>> | null;
  readonly after_data: Readonly<Record<string, unknown>> | null;
  readonly correlation_id: string | null;
  readonly authorization_version: number | null;
  readonly sync_status: "PENDING" | "SYNCED" | "REQUIRES_REVIEW";
}

export class PosAuditStore {
  constructor(private readonly db: Dexie) {}

  async getEventsForEntity(
    businessId: string,
    entityType: string,
    entityId: string,
  ): Promise<readonly LocalAuditEventRecord[]> {
    const events = await this.db
      .table<LocalAuditEventRecord>("audit_events")
      .where("[business_id+entity_type+entity_id]")
      .equals([businessId, entityType, entityId])
      .toArray();

    return events.sort((left, right) =>
      left.occurred_at.localeCompare(right.occurred_at),
    );
  }
}
