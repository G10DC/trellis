import { validateToken } from './auth.js';
import express from 'express';

export async function handler(req) {
  const ok = validateToken(req.token);
  if (!ok) return { status: 401 };
  return { status: 200 };
}

export function healthcheck() {
  return { ok: true };
}
