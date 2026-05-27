// The dispatcher in api/index.ts maps `status` + `type` to the HTTP
// response and the api_metrics row. Anything not deriving from ApiError
// is treated as a 500 with error_type='exception'.

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
