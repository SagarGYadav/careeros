// Typed application errors (SPEC §24). Shared by server and client: the client maps a code to a user message,
// the server never sends stack traces or internal details to the browser.

type ErrorInfo = { status: number; title: string; action: string };

export const ERROR_CATALOG = {
  UNAUTHENTICATED: { status: 401, title: "Please sign in again.", action: "Sign in" },
  FORBIDDEN: { status: 403, title: "You don't have access to this.", action: "Go back" },
  NOT_FOUND: { status: 404, title: "We couldn't find that.", action: "Go back" },
  VALIDATION: { status: 400, title: "Some details need fixing.", action: "Check the highlighted fields" },
  RATE_LIMITED: { status: 429, title: "Too many requests.", action: "Wait a minute and try again" },
  AI_NOT_CONFIGURED: {
    status: 503,
    title: "AI isn't set up yet.",
    action: "Add a free AI key in .env or use mock mode",
  },
  AI_TIMEOUT: { status: 504, title: "The AI took too long to respond.", action: "Try again" },
  AI_RATE_LIMITED: { status: 429, title: "The AI's free limit is used up for now.", action: "Try again later" },
  AI_INVALID_OUTPUT: {
    status: 502,
    title: "The AI returned an unusable answer.",
    action: "Try again or enter it manually",
  },
  SEARCH_NOT_CONFIGURED: {
    status: 503,
    title: "Job search isn't set up yet.",
    action: "Add a free search key in .env",
  },
  SEARCH_QUOTA_EXCEEDED: {
    status: 429,
    title: "This month's free searches are used up.",
    action: "Wait for the reset",
  },
  SEARCH_FAILED: { status: 502, title: "The job search service didn't respond.", action: "Try again" },
  FETCH_BLOCKED_BY_ROBOTS: {
    status: 403,
    title: "That site asks not to be read automatically.",
    action: "Paste the description instead",
  },
  URL_FETCH_BLOCKED: { status: 400, title: "That address can't be opened.", action: "Paste the description instead" },
  URL_FETCH_FAILED: { status: 502, title: "We couldn't read that page.", action: "Paste the description instead" },
  PARSE_FAILED: {
    status: 422,
    title: "We couldn't read that file.",
    action: "Try another file or enter details manually",
  },
  UNSUPPORTED_FILE: { status: 415, title: "That file type isn't supported.", action: "Upload a PDF or DOCX" },
  FILE_TOO_LARGE: { status: 413, title: "That file is too large.", action: "Upload a file under 5 MB" },
  DB_ERROR: { status: 500, title: "We couldn't save or load your data.", action: "Try again" },
  INTERNAL: { status: 500, title: "Something went wrong on our side.", action: "Try again" },
} as const satisfies Record<string, ErrorInfo>;

export type AppErrorCode = keyof typeof ERROR_CATALOG;

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** Safe-to-show details (e.g. which field failed). Never put secrets or personal data here. */
  readonly details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    options: { message?: string; cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(options.message ?? ERROR_CATALOG[code].title, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_CATALOG[code].status;
    this.details = options.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** What the UI shows for a code: a short title and the recovery action. */
export function describeError(code: AppErrorCode): { title: string; action: string } {
  const { title, action } = ERROR_CATALOG[code];
  return { title, action };
}

/** Serializable shape returned by Server Actions and Route Handlers instead of throwing raw errors. */
export type ErrorResult = { ok: false; code: AppErrorCode; message: string; correlationId?: string };
