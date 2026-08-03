import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  Authorizer,
  RequestAuthenticator,
  SorenApplication
} from "@soren-sdk/application";

export interface RestServerOptions {
  application: SorenApplication;
  authenticator?: RequestAuthenticator;
  authorizer?: Authorizer;
  allowedProjectRoots?: string[];
  maxBodyBytes?: number;
  timeoutMs?: number;
}

export type RestHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<void>;
