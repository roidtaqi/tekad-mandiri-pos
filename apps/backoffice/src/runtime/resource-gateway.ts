import { AuthenticatedHttpClient } from "./http";

export type BackofficeResource =
  | "attention"
  | "inventory"
  | "overview"
  | "pricing"
  | "purchases"
  | "reports"
  | "returns"
  | "sales"
  | "terminals"
  | "users";

export interface BackofficeResourceGateway {
  get<T>(resource: BackofficeResource, signal?: AbortSignal): Promise<T>;
}

export class HttpBackofficeResourceGateway implements BackofficeResourceGateway {
  constructor(private readonly client: AuthenticatedHttpClient) {}

  get<T>(resource: BackofficeResource, signal?: AbortSignal): Promise<T> {
    return this.client.get<T>(`/api/v1/backoffice/${resource}`, signal);
  }
}
