export function assertDefined<T>(
  value: T | undefined | null,
  message: string,
): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}
