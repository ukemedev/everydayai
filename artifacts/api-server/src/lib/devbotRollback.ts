import { logger } from "./logger.js";

export interface Snapshot {
  id: string;
  label: string;
  timestamp: string;
  files: Record<string, string>;
  agentId?: string;
}

const snapshots: Snapshot[] = [];

export async function saveSnapshot(
  label: string,
  files: Record<string, string>,
  agentId?: string,
): Promise<Snapshot> {
  const snap: Snapshot = {
    id: crypto.randomUUID(),
    label,
    timestamp: new Date().toISOString(),
    files,
    agentId,
  };
  snapshots.push(snap);
  logger.info({ id: snap.id, label }, "devbotRollback: snapshot saved");
  return snap;
}

export async function getSnapshots(agentId?: string): Promise<Snapshot[]> {
  if (agentId) return snapshots.filter((s) => s.agentId === agentId);
  return snapshots;
}

export async function getSnapshotById(id: string): Promise<Snapshot | null> {
  return snapshots.find((s) => s.id === id) ?? null;
}

export async function getAllSnapshots(): Promise<Snapshot[]> {
  return snapshots;
}
