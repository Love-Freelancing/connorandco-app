import type { Session } from "@api/utils/auth";
import type { Scope } from "@api/utils/scopes";
import type { Database } from "@connorco/db/client";

export type Context = {
  Variables: {
    db: Database;
    session: Session;
    teamId: string;
    userId?: string;
    clientIp?: string;
    scopes?: Scope[];
  };
};
