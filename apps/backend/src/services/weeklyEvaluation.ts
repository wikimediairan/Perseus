import type { Env } from "@/config/env";
import { runWeeklyEvaluation } from "@/services/creditEngine";
import { RequestLogger } from "@/shared/logger";

export async function handleWeeklyEvaluation(env: Env): Promise<void> {
  const logger = new RequestLogger("cron-weekly-evaluation");
  logger.info("Starting weekly credit evaluation");

  try {
    await runWeeklyEvaluation(env.DB);
    logger.info("Weekly credit evaluation complete");
  } catch (err) {
    logger.error("Weekly credit evaluation failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
