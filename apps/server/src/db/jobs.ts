import { getDb } from './connection.js';

export interface BackupJob {
  id: number;
  name: string;
  source_path: string;
  dest_path: string;
  schedule: string;
  enabled: number;
  filter_mode: 'full' | 'incremental';
  retention: number;
  notify_on_start: number;
  notify_on_error: number;
  notify_on_success: number;
  job_type: 'backup' | 'dispatch';
  default_dest_path: string | null;
  file_action: 'move' | 'copy';
  created_at: string;
  updated_at: string;
}

export interface DispatchRule {
  id: number;
  job_id: number;
  priority: number;
  pattern: string;
  dest_path: string;
}

export interface JobExecution {
  id: number;
  job_id: number;
  status: 'running' | 'success' | 'failed';
  folder_name: string;
  files_copied: number;
  total_size: string;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface CreateJobInput {
  name: string;
  source_path: string;
  dest_path?: string;
  schedule: string;
  enabled?: boolean;
  filter_mode?: 'full' | 'incremental';
  retention?: number;
  notify_on_start?: boolean;
  notify_on_error?: boolean;
  notify_on_success?: boolean;
  job_type?: 'backup' | 'dispatch';
  default_dest_path?: string | null;
  file_action?: 'move' | 'copy';
  dispatch_rules?: Array<{ priority: number; pattern: string; dest_path: string }>;
}

export function getAllJobs(): BackupJob[] {
  return getDb().prepare('SELECT * FROM backup_jobs ORDER BY id').all() as BackupJob[];
}

export function getJobById(id: number): BackupJob | undefined {
  return getDb().prepare('SELECT * FROM backup_jobs WHERE id = ?').get(id) as BackupJob | undefined;
}

export function createJob(input: CreateJobInput): BackupJob {
  const db = getDb();
  const jobType = input.job_type ?? 'backup';

  const run = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO backup_jobs (name, source_path, dest_path, schedule, enabled, filter_mode, retention,
        notify_on_start, notify_on_error, notify_on_success, job_type, default_dest_path, file_action)
      VALUES (@name, @source_path, @dest_path, @schedule, @enabled, @filter_mode, @retention,
        @notify_on_start, @notify_on_error, @notify_on_success, @job_type, @default_dest_path, @file_action)
    `).run({
      name: input.name,
      source_path: input.source_path,
      dest_path: input.dest_path ?? '',
      schedule: input.schedule,
      enabled: input.enabled !== false ? 1 : 0,
      filter_mode: input.filter_mode ?? 'full',
      retention: input.retention ?? 0,
      notify_on_start: input.notify_on_start ? 1 : 0,
      notify_on_error: input.notify_on_error !== false ? 1 : 0,
      notify_on_success: input.notify_on_success ? 1 : 0,
      job_type: jobType,
      default_dest_path: input.default_dest_path ?? null,
      file_action: input.file_action ?? 'copy',
    });

    const jobId = Number(result.lastInsertRowid);

    if (jobType === 'dispatch' && input.dispatch_rules?.length) {
      const insert = db.prepare(
        'INSERT INTO dispatch_rules (job_id, priority, pattern, dest_path) VALUES (?, ?, ?, ?)'
      );
      for (const rule of input.dispatch_rules) {
        insert.run(jobId, rule.priority, rule.pattern, rule.dest_path);
      }
    }

    return jobId;
  });

  const jobId = run();
  return getJobById(jobId)!;
}

export function updateJob(id: number, input: Partial<CreateJobInput>): BackupJob | undefined {
  const existing = getJobById(id);
  if (!existing) return undefined;

  const db = getDb();

  const run = db.transaction(() => {
    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    if (input.name !== undefined) { fields.push('name = @name'); values.name = input.name; }
    if (input.source_path !== undefined) { fields.push('source_path = @source_path'); values.source_path = input.source_path; }
    if (input.dest_path !== undefined) { fields.push('dest_path = @dest_path'); values.dest_path = input.dest_path; }
    if (input.schedule !== undefined) { fields.push('schedule = @schedule'); values.schedule = input.schedule; }
    if (input.enabled !== undefined) { fields.push('enabled = @enabled'); values.enabled = input.enabled ? 1 : 0; }
    if (input.filter_mode !== undefined) { fields.push('filter_mode = @filter_mode'); values.filter_mode = input.filter_mode; }
    if (input.retention !== undefined) { fields.push('retention = @retention'); values.retention = input.retention; }
    if (input.notify_on_start !== undefined) { fields.push('notify_on_start = @notify_on_start'); values.notify_on_start = input.notify_on_start ? 1 : 0; }
    if (input.notify_on_error !== undefined) { fields.push('notify_on_error = @notify_on_error'); values.notify_on_error = input.notify_on_error ? 1 : 0; }
    if (input.notify_on_success !== undefined) { fields.push('notify_on_success = @notify_on_success'); values.notify_on_success = input.notify_on_success ? 1 : 0; }
    if (input.job_type !== undefined) { fields.push('job_type = @job_type'); values.job_type = input.job_type; }
    if (input.default_dest_path !== undefined) { fields.push('default_dest_path = @default_dest_path'); values.default_dest_path = input.default_dest_path || null; }
    if (input.file_action !== undefined) { fields.push('file_action = @file_action'); values.file_action = input.file_action; }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      db.prepare(`UPDATE backup_jobs SET ${fields.join(', ')} WHERE id = @id`).run(values);
    }

    if (input.dispatch_rules !== undefined) {
      db.prepare('DELETE FROM dispatch_rules WHERE job_id = ?').run(id);
      if (input.dispatch_rules.length > 0) {
        const insert = db.prepare(
          'INSERT INTO dispatch_rules (job_id, priority, pattern, dest_path) VALUES (?, ?, ?, ?)'
        );
        for (const rule of input.dispatch_rules) {
          insert.run(id, rule.priority, rule.pattern, rule.dest_path);
        }
      }
    }
  });

  run();
  return getJobById(id);
}

export function deleteJob(id: number): boolean {
  const result = getDb().prepare('DELETE FROM backup_jobs WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getEnabledJobs(): BackupJob[] {
  return getDb().prepare('SELECT * FROM backup_jobs WHERE enabled = 1 ORDER BY id').all() as BackupJob[];
}

export function getDispatchRules(jobId: number): DispatchRule[] {
  return getDb()
    .prepare('SELECT * FROM dispatch_rules WHERE job_id = ? ORDER BY priority')
    .all(jobId) as DispatchRule[];
}
