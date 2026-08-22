/** Total monthly community budget available to distribute as credit. */
export const MONTHLY_BUDGET = 10;

/** Every newly approved user starts with this weekly credit. */
export const INITIAL_WEEKLY_CREDIT = 0.16;

/** Weekly usage below this counts as a "low usage" week. */
export const LOW_USAGE_THRESHOLD = 0.1;

/** Consecutive low-usage weeks before a user is disabled. */
export const LOW_USAGE_WEEKS_LIMIT = 4;

/** Consecutive full-usage weeks before a user qualifies for an increase. */
export const FULL_USAGE_WEEKS_LIMIT = 4;

/** Amount a qualifying user's weekly credit increases by. */
export const CREDIT_INCREMENT = 0.04;

/** Ceiling on any single user's weekly credit. */
export const MAX_WEEKLY_CREDIT = 1.2;
