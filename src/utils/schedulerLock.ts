import { pool } from "../db";

export const ADVISORY_LOCK_IDS = {
  DEADLINE_MANAGEMENT: 81001,
  DAILY_TASK_REMINDERS: 81002,
  WEEKLY_DIGEST: 81003,
  WEEKLY_PENDING_WORK: 81004,
  OVERDUE_TICKET_CHECK: 81005,
  ESCALATION_CHECK: 81006,
} as const;

export interface AdvisoryLockResult<T> {
  executed: boolean;
  result?: T;
  reason?: "already_running" | "connection_error" | "execution_error";
}

/**
 * Executes an asynchronous function under a PostgreSQL session-level advisory lock.
 * If another worker or instance currently holds the lock, pg_try_advisory_lock returns false,
 * and this execution skips cleanly without blocking or duplicating.
 *
 * If the process or connection drops unexpectedly, PostgreSQL automatically releases the advisory lock.
 */
export async function withAdvisoryLock<T>(
  lockId: number,
  jobName: string,
  fn: () => Promise<T>
): Promise<AdvisoryLockResult<T>> {
  let client;
  try {
    client = await pool.connect();
  } catch (connErr: any) {
    console.error(
      `[AdvisoryLock] Could not acquire database client for "${jobName}":`,
      connErr?.message || connErr
    );
    return { executed: false, reason: "connection_error" };
  }

  try {
    const res = await client.query("SELECT pg_try_advisory_lock($1) AS acquired", [lockId]);
    const acquired = res.rows[0]?.acquired === true;
    if (!acquired) {
      console.log(
        `[AdvisoryLock] Job "${jobName}" (Lock ID: ${lockId}) is currently active on another instance. Skipping.`
      );
      return { executed: false, reason: "already_running" };
    }

    try {
      const result = await fn();
      return { executed: true, result };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [lockId]).catch((unlockErr) => {
        console.error(`[AdvisoryLock] Failed to release lock ${lockId} for "${jobName}":`, unlockErr);
      });
    }
  } catch (execErr: any) {
    console.error(`[AdvisoryLock] Error executing job "${jobName}":`, execErr);
    return { executed: false, reason: "execution_error" };
  } finally {
    client.release();
  }
}

