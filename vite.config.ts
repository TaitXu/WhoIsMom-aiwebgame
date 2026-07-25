import type { IncomingMessage, ServerResponse } from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { defineConfig, loadEnv, type Plugin } from "vite";
import agentHandler from "./api/agent";

export default defineConfig(({ mode }) => {
  const modelEnv = loadEnv(mode, process.cwd(), "MODEL_");
  Object.entries(modelEnv).forEach(([key, value]) => { process.env[key] = value; });

  return {
    plugins: [localAgentApi()],
    server: {
      host: "127.0.0.1",
    },
    build: {
      sourcemap: true,
    },
  };
});

function localAgentApi(): Plugin {
  return {
    name: "local-agent-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/agent", async (request, response) => {
        await agentHandler(
          await toVercelRequest(request),
          toVercelResponse(response),
        );
      });
    },
  };
}

async function toVercelRequest(request: IncomingMessage): Promise<VercelRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  let body: unknown;
  try {
    const raw = Buffer.concat(chunks).toString("utf8");
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    body = undefined;
  }
  return { method: request.method, headers: request.headers, body } as VercelRequest;
}

function toVercelResponse(response: ServerResponse): VercelResponse {
  const adapter = {
    setHeader(name: string, value: string) {
      response.setHeader(name, value);
      return adapter;
    },
    status(code: number) {
      response.statusCode = code;
      return adapter;
    },
    json(payload: unknown) {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(payload));
      return adapter;
    },
  };
  return adapter as unknown as VercelResponse;
}
