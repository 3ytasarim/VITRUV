import type { Principal } from './auth/principal';

/** Per-request context shared by all routes. */
export interface AppEnv {
  Variables: {
    requestId: string;
    principal?: Principal;
  };
}
