import { DOMParser } from "linkedom";

let holders = 0;

export async function withDomEnvironment<T>(
  fn: () => Promise<T> | T,
): Promise<T> {
  if (holders === 0) {
    (globalThis as Record<string, unknown>).DOMParser = DOMParser;
  }
  holders++;

  try {
    return await fn();
  } finally {
    holders--;
    if (holders === 0) {
      delete (globalThis as Record<string, unknown>).DOMParser;
    }
  }
}
