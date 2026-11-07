export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
