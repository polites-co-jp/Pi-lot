import type Database from 'better-sqlite3';

const migrations = [
  {
    version: 1,
    description: 'Create backup_jobs and job_executions tables',
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS backup_jobs (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          name            TEXT    NOT NULL,
          source_path     TEXT    NOT NULL,
          dest_path       TEXT    NOT NULL,
          schedule        TEXT    NOT NULL,
          enabled         INTEGER NOT NULL DEFAULT 1,
          filter_mode     TEXT    NOT NULL DEFAULT 'full',
          retention       INTEGER NOT NULL DEFAULT 0,
          notify_on_start   INTEGER NOT NULL DEFAULT 0,
          notify_on_error   INTEGER NOT NULL DEFAULT 1,
          notify_on_success INTEGER NOT NULL DEFAULT 0,
          created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS job_executions (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id          INTEGER NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
          status          TEXT    NOT NULL DEFAULT 'running',
          folder_name     TEXT    NOT NULL,
          files_copied    INTEGER NOT NULL DEFAULT 0,
          total_size      TEXT    NOT NULL DEFAULT '0B',
          error_message   TEXT,
          started_at      TEXT    NOT NULL DEFAULT (datetime('now')),
          finished_at     TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_executions_job    ON job_executions(job_id);
        CREATE INDEX IF NOT EXISTS idx_executions_status ON job_executions(status);
        CREATE INDEX IF NOT EXISTS idx_executions_start  ON job_executions(started_at);
      `);
    },
  },
  {
    version: 2,
    description: 'Add dispatch job support (job_type, file_action, dispatch_rules)',
    up(db: Database.Database) {
      db.exec(`
        ALTER TABLE backup_jobs ADD COLUMN job_type TEXT NOT NULL DEFAULT 'backup';
        ALTER TABLE backup_jobs ADD COLUMN default_dest_path TEXT;
        ALTER TABLE backup_jobs ADD COLUMN file_action TEXT NOT NULL DEFAULT 'copy';

        CREATE TABLE dispatch_rules (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id    INTEGER NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
          priority  INTEGER NOT NULL DEFAULT 0,
          pattern   TEXT    NOT NULL,
          dest_path TEXT    NOT NULL,
          UNIQUE(job_id, priority)
        );
        CREATE INDEX idx_dispatch_rules_job ON dispatch_rules(job_id);
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM _migrations').all().map((r: any) => r.version)
  );

  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      m.up(db);
      db.prepare('INSERT INTO _migrations (version, description) VALUES (?, ?)').run(
        m.version,
        m.description
      );
    })();
    console.log(`Migration v${m.version}: ${m.description}`);
  }
}
