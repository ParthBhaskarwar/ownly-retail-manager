/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Enough to blunt password / verification-code guessing on a single server
 * process. (Behind several instances, swap for a shared store such as Redis.)
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@/shared/AppError';

interface Bucket { count: number; resetAt: number }

export function rateLimit(opts: { windowMs: number; max: number; message?: string }) {
  const buckets = new Map<string, Bucket>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  }, opts.windowMs);
  sweep.unref();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > opts.max) {
      next(new AppError(429, opts.message ?? 'Too many attempts. Please wait a few minutes and try again.'));
      return;
    }
    next();
  };
}
