import { createClient } from "@supabase/supabase-js";

function getClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export interface TaskResult {
  task: string;
  status: "processing" | "done";
  result?: string;
}

export interface QueueRow {
  id: string;
  session_id: string;
  tasks: string[];
  status: "pending" | "processing" | "completed";
  current_task_index: number;
  results: TaskResult[];
  created_at: string;
  updated_at: string;
}

export async function createQueue(sessionId: string, tasks: string[]): Promise<QueueRow> {
  const sb = getClient();
  if (!sb) throw new Error("Supabase not configured");

  const { data, error } = await sb
    .from("devbot_task_queue")
    .insert({
      session_id: sessionId,
      tasks,
      status: "pending",
      current_task_index: 0,
      results: [],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as QueueRow;
}

export async function getQueue(queueId: string): Promise<QueueRow | null> {
  const sb = getClient();
  if (!sb) return null;

  const { data, error } = await sb
    .from("devbot_task_queue")
    .select("*")
    .eq("id", queueId)
    .single();

  if (error) return null;
  return data as QueueRow;
}

export async function updateQueue(
  queueId: string,
  updates: Partial<Pick<QueueRow, "status" | "current_task_index" | "results">>
): Promise<void> {
  const sb = getClient();
  if (!sb) return;

  await sb
    .from("devbot_task_queue")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", queueId);
}

export async function processQueue(queueId: string, _sessionId: string): Promise<TaskResult[]> {
  const queue = await getQueue(queueId);
  if (!queue) throw new Error(`Queue ${queueId} not found`);

  const tasks = queue.tasks as string[];
  const results: TaskResult[] = [];

  await updateQueue(queueId, { status: "processing", current_task_index: 0, results: [] });

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    results.push({ task, status: "processing" });
    await updateQueue(queueId, { current_task_index: i, results: [...results] });

    const taskResult = `Task "${task}" queued — will execute when Claude API is funded`;

    results[results.length - 1] = { task, status: "done", result: taskResult };
    await updateQueue(queueId, { current_task_index: i, results: [...results] });
  }

  await updateQueue(queueId, { status: "completed", current_task_index: tasks.length - 1, results });
  return results;
}
