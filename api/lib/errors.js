class ApiError extends Error {
  constructor(status, message, type = null) {
    super(message);
    this.status = status;
    this.type = type || `http_${status}`;
  }
}

class NotFoundError extends ApiError {
  constructor(message) {
    super(404, message, 'not_found');
  }
}

class ValidationError extends ApiError {
  constructor(message) {
    super(400, message, 'validation');
  }
}

class RateLimitError extends ApiError {
  constructor(message) {
    super(429, message, 'rate_limit');
  }
}

class MethodNotAllowedError extends ApiError {
  constructor(message = 'Method not allowed') {
    super(405, message, 'method_not_allowed');
  }
}

module.exports = {
  ApiError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  MethodNotAllowedError,
};
