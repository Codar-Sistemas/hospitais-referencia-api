/**
 * State endpoints — thin HTTP adapters around the hospital-service.
 */

import { json } from '../core/http.js';
import * as service from '../services/hospital-service.js';
import type { Request, Response } from '../types/http.js';

export async function listStates(_req: Request, res: Response): Promise<void> {
  const states = await service.listStates();
  json(res, 200, { states });
}

export async function getState(_req: Request, res: Response, stateCode: string): Promise<void> {
  const row = await service.getState(stateCode);
  json(res, 200, row);
}
