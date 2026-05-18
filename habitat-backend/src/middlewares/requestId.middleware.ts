import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

/**
 * Adopt an incoming `x-request-id` header (so upstream tracing carries
 * through) or mint a new UUIDv4. The id is echoed back on the response so
 * client-side error reports can quote it.
 *
 * Sits before pino-http; pino-http reads `req.id` and adds it to every log
 * line for the request.
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header("x-request-id");
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  (req as any).id = id;
  res.setHeader("x-request-id", id);
  next();
};
