import type {
  AuthenticatedPrincipal,
  AuthorizationDecision,
  Authorizer,
  IncomingRequest,
  RequestAuthenticator
} from "./types.js";

export class AnonymousAuthenticator implements RequestAuthenticator {
  async authenticate(): Promise<AuthenticatedPrincipal> {
    return { id: "anonymous", roles: ["reader"] };
  }
}

export class DenyByDefaultAuthorizer implements Authorizer {
  authorize(): AuthorizationDecision {
    return { allowed: false, reason: "No authorization policy was configured." };
  }
}

export class AllowReadOnlyAuthorizer implements Authorizer {
  authorize(
    _principal: AuthenticatedPrincipal,
    action: string
  ): AuthorizationDecision {
    return action.endsWith(":read")
      ? { allowed: true }
      : { allowed: false, reason: `Action ${action} is not read-only.` };
  }
}

export function incomingRequest(
  method: string,
  path: string,
  headers: Record<string, string | undefined> = {}
): IncomingRequest {
  return { method, path, headers };
}
