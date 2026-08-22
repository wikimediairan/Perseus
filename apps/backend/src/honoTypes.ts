import type { Env } from "@/config/env";
import type { QuotaStatus } from "@/repositories/quota";
import type { UserRow } from "@/repositories/usersRepo";

interface HonoVariables {
  requestId: string;
  quotaStatus: QuotaStatus;
  /** The authenticated Perseus user -- set by either `sessionMiddleware`
   * (cookie) or `authMiddleware` (Bearer session token). Both resolve
   * through the same `sessions` table (see services/sessionService.ts),
   * so there is only ever one "authenticated user" shape now that
   * api_keys is gone. */
  sessionUser: UserRow;
}

export interface AppEnv {
  Bindings: Env;
  Variables: HonoVariables;
}
