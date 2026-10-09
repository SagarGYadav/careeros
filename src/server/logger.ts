import "server-only";

// Minimal structured logger: one JSON line per event, so logs are searchable on any host (Vercel, local).
// Sensitive keys are redacted (SPEC §23: logs never contain CV content, documents, secrets or personal details).

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === "production" ? "info" : "debug");

/** Keys whose values are never logged. Matched case-insensitively against each key name. */
const REDACTED_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|email|phone|cv|resume|content|text/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        REDACTED_KEY.test(key) ? "[redacted]" : redact(inner, depth + 1),
      ]),
    );
  }
  return value;
}

function write(level: Level, message: string, fields: Fields) {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg: message, ...(redact(fields) as Fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export type Logger = {
  debug: (message: string, fields?: Fields) => void;
  info: (message: string, fields?: Fields) => void;
  warn: (message: string, fields?: Fields) => void;
  error: (message: string, fields?: Fields) => void;
  /** A logger that adds `bindings` (e.g. { correlationId, userId }) to every line. */
  child: (bindings: Fields) => Logger;
};

function createLogger(bindings: Fields = {}): Logger {
  return {
    debug: (message, fields = {}) => write("debug", message, { ...bindings, ...fields }),
    info: (message, fields = {}) => write("info", message, { ...bindings, ...fields }),
    warn: (message, fields = {}) => write("warn", message, { ...bindings, ...fields }),
    error: (message, fields = {}) => write("error", message, { ...bindings, ...fields }),
    child: (more) => createLogger({ ...bindings, ...more }),
  };
}

export const logger = createLogger();

/** Short id shown to the user next to an error, to find the matching log line. */
export function newCorrelationId(): string {
  return crypto.randomUUID().slice(0, 8);
}
