import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type {
  IsolatedWorkspace,
  IsolatedWorkspaceRequest,
  VcsIsolationProvider,
  VcsState
} from "./types.js";

/**
 * Deterministic in-memory VCS isolation fake. Never touches Git. The
 * `createIsolatedWorkspace` returns a handle whose `location` points at a
 * temp directory name but whose `clean` flag is always true and whose
 * `close` is a no-op. Tests exercise contract behavior without host writes.
 */
export class DeterministicVcsIsolationFake implements VcsIsolationProvider {
  readonly #state: VcsState;
  readonly #workspaces: IsolatedWorkspace[] = [];

  constructor(state: VcsState) {
    this.#state = state;
  }

  async inspect(_root: string): Promise<VcsState> {
    return { ...this.#state, reasons: [...this.#state.reasons] };
  }

  async createIsolatedWorkspace(
    request: IsolatedWorkspaceRequest
  ): Promise<IsolatedWorkspace> {
    const location = path.join(
      os.tmpdir(),
      "soren-sdk-workspaces",
      request.workspaceId
    );
    const workspace: IsolatedWorkspace = {
      workspaceId: request.workspaceId,
      location,
      createdFrom: request.sourceRoot,
      clean: !this.#state.dirty,
      closed: false,
      close: async () => {
        workspace.closed = true;
      }
    };
    this.#workspaces.push(workspace);
    return workspace;
  }

  /** Test helper: list created workspaces. */
  createdWorkspaces(): readonly IsolatedWorkspace[] {
    return this.#workspaces;
  }
}

/**
 * Temporary-copy isolation fake that physically copies a seed tree into a
 * temp directory. Used to prove the original tree remains byte-for-byte
 * unchanged.
 */
export class TempCopyIsolationFake implements VcsIsolationProvider {
  readonly #state: VcsState;
  readonly #seedTree: string | null;
  readonly #workspaces: IsolatedWorkspace[] = [];

  constructor(state: VcsState, seedTree: string | null = null) {
    this.#state = state;
    this.#seedTree = seedTree;
  }

  async inspect(_root: string): Promise<VcsState> {
    return { ...this.#state, reasons: [...this.#state.reasons] };
  }

  async createIsolatedWorkspace(
    request: IsolatedWorkspaceRequest
  ): Promise<IsolatedWorkspace> {
    const location = path.join(
      os.tmpdir(),
      "soren-sdk-workspaces",
      request.workspaceId
    );
    if (this.#seedTree !== null) {
      await copyTree(this.#seedTree, location);
    } else {
      await fsp.mkdir(location, { recursive: true });
    }
    const workspace: IsolatedWorkspace = {
      workspaceId: request.workspaceId,
      location,
      createdFrom: request.sourceRoot,
      clean: !this.#state.dirty,
      closed: false,
      close: async () => {
        workspace.closed = true;
      }
    };
    this.#workspaces.push(workspace);
    return workspace;
  }

  /** Test helper: list created workspaces. */
  createdWorkspaces(): readonly IsolatedWorkspace[] {
    return this.#workspaces;
  }
}

async function copyTree(source: string, destination: string): Promise<void> {
  await fsp.mkdir(destination, { recursive: true });
  const entries = await fsp.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyTree(src, dst);
    } else if (entry.isFile()) {
      await fsp.copyFile(src, dst);
    }
    // Symlinks and special files in the seed tree are intentionally not
    // copied: the isolated workspace is a plain regular-file copy.
  }
}