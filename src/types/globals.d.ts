import type { PlatformRole } from "@/lib/platform-roles";

export type Roles = PlatformRole;

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      role?: Roles;
    };
  }
}

export {};
