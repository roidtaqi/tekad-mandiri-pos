import {
  SYSTEM_HEALTH_PATH,
  type SystemHealthResponse,
} from "@kastur/contracts";

const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
} as const;

export function handleRequest(request: Request): Response {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && pathname === SYSTEM_HEALTH_PATH) {
    const body = { status: "ok" } satisfies SystemHealthResponse;

    return Response.json(body, { headers: jsonHeaders });
  }

  return Response.json(
    { error: "NOT_FOUND" },
    { status: 404, headers: jsonHeaders },
  );
}

const worker = {
  fetch(request: Request): Response {
    return handleRequest(request);
  },
};

export default worker;
