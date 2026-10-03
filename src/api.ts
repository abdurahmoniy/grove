import { demoRequest } from "./demo";
export const isDesktop = Boolean(window.grove);
export function request<T>(
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  return window.grove
    ? window.grove.request<T>(method, payload)
    : demoRequest<T>(method, payload);
}
export function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );
}
