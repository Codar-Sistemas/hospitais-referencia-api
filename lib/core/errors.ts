/**
 * Error hierarchy for the API. Every error thrown by handlers/services/
 * repositories should derive from `ApiError` — the top-level dispatcher in
 * api/index.ts maps the `status` and `type` fields to the HTTP response and
 * the api_metrics row.
 *
 * Anything else (TypeError, unhandled fetch failures, etc.) is treated as
 * a 500 with `error_type='exception'` and logged to stderr.
 */

export class ApiError extends Error {
  public readonly status: number;
  public readonly type: string;

  constructor(status: number, message: string, type: string | null = null) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.type = type ?? `http_${status}`;
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(404, message, 'not_found');
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, message, 'validation');
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string) {
    super(429, message, 'rate_limit');
  }
}

export class MethodNotAllowedError extends ApiError {
  constructor(message = 'Method not allowed') {
    super(405, message, 'method_not_allowed');
  }
}
