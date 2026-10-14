// request-logger: a dev-only proxy with no dependencies. It sits between a coding agent (e.g. Claude Code)
// and the Anthropic API and writes one readable Markdown file per /v1/messages request.
//
// Usage:
//   npm run request-logger                                   (listens on http://localhost:8787)
//   ANTHROPIC_BASE_URL=http://localhost:8787 claude          (in another terminal)
//
// Logs go to request-logger/logs/ (git-ignored: they contain your full conversations).
// Request headers are never written to disk, so API keys and OAuth tokens stay out of the logs.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.REQUEST_LOGGER_PORT ?? 8787);
const UPSTREAM = new URL(process.env.REQUEST_LOGGER_UPSTREAM ?? "https://api.anthropic.com");
const LOG_DIR = join(import.meta.dirname, "logs");

mkdirSync(LOG_DIR, { recursive: true });
let requestCount = 0;

type Block = { type: string; [key: string]: unknown };
type Message = { role: string; content: string | Block[] };
type Tool = { name?: string; description?: string; input_schema?: unknown; type?: string };
type MessagesBody = {
  model?: string;
  max_tokens?: number;
  system?: string | Block[];
  tools?: Tool[];
  messages?: Message[];
};

function fence(text: string, lang = ""): string {
  // Use a fence longer than any backtick run inside the text, so nested code blocks don't break the Markdown.
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${lang}\n${text}\n${ticks}`;
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case "text":
      return String(block.text ?? "");
    case "thinking":
      return `> _thinking:_\n${fence(String(block.thinking ?? ""))}`;
    case "redacted_thinking":
      return "> _redacted thinking_";
    case "tool_use":
      return `**tool_use** \`${String(block.name)}\` (id \`${String(block.id)}\`)\n${fence(JSON.stringify(block.input, null, 2), "json")}`;
    case "tool_result": {
      const content = block.content;
      const body = Array.isArray(content)
        ? (content as Block[]).map(renderBlock).join("\n\n")
        : String(content ?? "");
      const error = block.is_error ? " — **error**" : "";
      return `**tool_result** for \`${String(block.tool_use_id)}\`${error}\n${fence(body)}`;
    }
    case "image":
    case "document":
      return `_[${block.type} omitted]_`;
    default:
      return fence(JSON.stringify(block, null, 2), "json");
  }
}

function renderContent(content: string | Block[] | undefined): string {
  if (content === undefined) return "";
  if (typeof content === "string") return content;
  return content.map(renderBlock).join("\n\n");
}

function toMarkdown(body: MessagesBody, path: string, when: Date): string {
  const parts: string[] = [
    `# Request ${requestCount} — ${when.toISOString()}`,
    `- **Endpoint:** \`POST ${path}\``,
    `- **Model:** \`${body.model ?? "?"}\``,
    `- **max_tokens:** ${body.max_tokens ?? "?"}`,
    `- **Tools:** ${body.tools?.length ?? 0} · **Messages:** ${body.messages?.length ?? 0}`,
    "",
    "## System prompt",
    renderContent(body.system) || "_(none)_",
    "",
    "## Tools",
  ];

  for (const tool of body.tools ?? []) {
    parts.push(`### ${tool.name ?? tool.type ?? "(unnamed)"}`, tool.description ?? "");
    if (tool.input_schema) parts.push(fence(JSON.stringify(tool.input_schema, null, 2), "json"));
    parts.push("");
  }
  if (!body.tools?.length) parts.push("_(none)_", "");

  parts.push("## Messages");
  (body.messages ?? []).forEach((message, index) => {
    parts.push(`### ${index + 1}. ${message.role}`, renderContent(message.content), "");
  });

  return parts.join("\n");
}

function logRequest(path: string, raw: Buffer): void {
  let body: MessagesBody;
  try {
    body = JSON.parse(raw.toString("utf8")) as MessagesBody;
  } catch {
    return; // Not JSON: forward it, but there is nothing readable to log.
  }
  requestCount += 1;
  const when = new Date();
  const stamp = when.toISOString().replace(/[:.]/g, "-");
  const file = join(LOG_DIR, `${stamp}-${String(requestCount).padStart(4, "0")}.md`);
  writeFileSync(file, toMarkdown(body, path, when), "utf8");
  console.log(`[request-logger] #${requestCount} ${body.model ?? "?"} → ${file}`);
}

function forward(req: IncomingMessage, res: ServerResponse, raw: Buffer): void {
  const headers = { ...req.headers, host: UPSTREAM.host };
  const upstream = httpsRequest(
    { hostname: UPSTREAM.hostname, port: UPSTREAM.port || 443, path: req.url, method: req.method, headers },
    (upstreamRes) => {
      // Stream the response straight back so SSE streaming keeps working.
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    console.error("[request-logger] upstream error:", error.message);
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(`request-logger: upstream error: ${error.message}`);
  });
  upstream.end(raw);
}

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "POST" && path.endsWith("/v1/messages")) logRequest(path, raw);
    forward(req, res, raw);
  });
}).listen(PORT, () => {
  console.log(`[request-logger] listening on http://localhost:${PORT} → ${UPSTREAM.origin}`);
  console.log(`[request-logger] logs: ${LOG_DIR}`);
});
