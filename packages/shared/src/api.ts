export interface ApiFieldError {
  /** Dotted path, e.g. "email" or "items.0.name" */
  field: string;
  messages: string[];
}

/** Every non-2xx response from the API has exactly this shape. */
export interface ApiErrorResponse {
  statusCode: number;
  /** HTTP reason phrase, e.g. "Bad Request" */
  error: string;
  /** Stable machine-readable code, e.g. "VALIDATION_FAILED", "TICKET_NOT_FOUND" */
  code: string;
  /** Human-readable message */
  message: string;
  details?: ApiFieldError[];
  path: string;
  timestamp: string;
  requestId: string;
}

export interface PaginationQuery {
  /** 1-based, default 1 */
  page?: number;
  /** default 20, max 100 */
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
