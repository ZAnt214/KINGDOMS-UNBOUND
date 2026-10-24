import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const bad = (code: string, message: string) => new HttpError(400, code, message);
export const forbidden = (message = 'Sem permissão para esta ação.') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Não encontrado.') => new HttpError(404, 'not_found', message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

export function handler(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res)
      .then((result) => {
        if (!res.headersSent) res.json(result ?? { ok: true });
      })
      .catch(next);
  };
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw bad('invalid_input', issue ? `${issue.path.join('.') || 'entrada'}: ${issue.message}` : 'Entrada inválida.');
  }
  return result.data;
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === '23505') {
    res.status(409).json({ error: 'conflict', message: 'Registro já existe ou conflito de concorrência.' });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json', message: 'JSON inválido.' });
    return;
  }
  console.error(JSON.stringify({ level: 'error', msg: 'unhandled', err: String((err as Error)?.stack ?? err) }));
  res.status(500).json({ error: 'internal', message: 'Erro interno.' });
}

/** Token bucket em memória (instância única na Fase A). */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(
    private capacity: number,
    private perSeconds: number,
  ) {}

  take(key: string): boolean {
    const now = Date.now();
    const refill = this.capacity / (this.perSeconds * 1000);
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + (now - b.at) * refill);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 50000) this.buckets.clear();
    return true;
  }
}
