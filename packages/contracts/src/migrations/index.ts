export interface ContractMigration<TInput = unknown, TOutput = unknown> {
  fromVersion: string;
  toVersion: string;
  migrate(input: TInput): TOutput;
}

export class MigrationRegistry {
  readonly #migrations = new Map<string, ContractMigration>();

  register(migration: ContractMigration): void {
    const key = `${migration.fromVersion}->${migration.toVersion}`;
    if (this.#migrations.has(key)) {
      throw new Error(`Migration "${key}" is already registered.`);
    }
    this.#migrations.set(key, migration);
  }

  get(fromVersion: string, toVersion: string): ContractMigration | undefined {
    return this.#migrations.get(`${fromVersion}->${toVersion}`);
  }
}
