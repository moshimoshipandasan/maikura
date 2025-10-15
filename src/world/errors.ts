export type ErrorReporter = {
  warn: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
};

let reporter: ErrorReporter = {
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
  info: (m) => console.info(m),
};

export function setErrorReporter(r: ErrorReporter) {
  reporter = r;
}

export function getErrorReporter(): ErrorReporter {
  return reporter;
}

export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

