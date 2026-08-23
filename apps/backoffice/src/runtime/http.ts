export interface FetchImplementation {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface ApiEnvelope<T> {
  readonly data: T;
}

interface ApiErrorEnvelope {
  readonly error?: {
    readonly code?: unknown;
    readonly details?: unknown;
    readonly message?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface AuthenticatedHttpClientOptions {
  readonly apiBaseUrl?: string;
  readonly bearer: string;
  readonly fetchImplementation?: FetchImplementation;
}

function requestUrl(path: string, apiBaseUrl: string | undefined): string {
  if (apiBaseUrl === undefined || apiBaseUrl.length === 0) {
    return path;
  }

  return new URL(path, apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`).toString();
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return undefined;
  }

  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function toHttpError(response: Response, body: unknown): HttpError {
  const envelope = isRecord(body) ? (body as ApiErrorEnvelope) : undefined;
  const code =
    typeof envelope?.error?.code === "string"
      ? envelope.error.code
      : `HTTP_${response.status}`;
  const message =
    typeof envelope?.error?.message === "string"
      ? envelope.error.message
      : "Permintaan ke server tidak berhasil.";
  const details = isRecord(envelope?.error?.details)
    ? envelope.error.details
    : undefined;

  return new HttpError(response.status, code, message, details);
}

export class AuthenticatedHttpClient {
  private readonly apiBaseUrl: string | undefined;
  private readonly bearer: string;
  private readonly fetchImplementation: FetchImplementation;

  constructor(options: AuthenticatedHttpClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl;
    this.bearer = options.bearer;
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
  }

  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.requestData<T>(path, {
      method: "GET",
      ...(signal === undefined ? {} : { signal }),
    });
  }

  async post<T>(
    path: string,
    body: unknown,
    headers: Readonly<Record<string, string>> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    return this.requestData<T>(path, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      method: "POST",
      ...(signal === undefined ? {} : { signal }),
    });
  }

  async postUnwrapped<T>(
    path: string,
    body: unknown,
    headers: Readonly<Record<string, string>> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.request(path, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      method: "POST",
      ...(signal === undefined ? {} : { signal }),
    });
    return response as T;
  }

  async postVoid(path: string, signal?: AbortSignal): Promise<void> {
    await this.request(path, {
      method: "POST",
      ...(signal === undefined ? {} : { signal }),
    });
  }

  private async requestData<T>(path: string, init: RequestInit): Promise<T> {
    const body = await this.request(path, init);
    if (!isRecord(body) || !("data" in body)) {
      throw new HttpError(
        502,
        "INVALID_API_RESPONSE",
        "Server mengembalikan respons yang tidak dapat dibaca.",
      );
    }

    return (body as unknown as ApiEnvelope<T>).data;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("authorization", `Bearer ${this.bearer}`);

    let response: Response;
    try {
      response = await this.fetchImplementation(requestUrl(path, this.apiBaseUrl), {
        ...init,
        credentials: "same-origin",
        headers,
      });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      throw new HttpError(
        0,
        "NETWORK_ERROR",
        "Server tidak dapat dijangkau. Periksa koneksi lalu coba lagi.",
      );
    }

    const body = await readResponseBody(response);
    if (!response.ok) {
      throw toHttpError(response, body);
    }

    return body;
  }
}
