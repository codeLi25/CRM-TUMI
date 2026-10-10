export type Admin = { id: string; name: string; email: string };
export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string[]>) { super(message); }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new ApiError('No se pudo conectar. Comprueba tu conexión e inténtalo nuevamente.', 0); }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message ?? 'El servicio no está disponible. Inténtalo nuevamente.', response.status, data.fields);
  return data;
}
