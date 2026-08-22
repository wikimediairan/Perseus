import { vi } from "vitest";

export function mockFetchOnce(
  status: number,
  body: unknown,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as ReturnType<typeof vi.fn>;

  vi.stubGlobal("fetch", fn);
  return fn;
}

export function mockFetchRejectOnce(error: Error): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    throw error;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export function lastRequestBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit] | undefined;
  return call?.[1]?.body ? JSON.parse(String(call[1].body)) : undefined;
}

export function lastRequestHeaders(
  fetchMock: ReturnType<typeof vi.fn>,
): Record<string, string> {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit] | undefined;
  return (call?.[1]?.headers as Record<string, string>) ?? {};
}

export function lastRequestUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit] | undefined;
  return String(call?.[0] ?? "");
}
