import { getDb } from './connection.js';
import type { JobExecution } from './jobs.js';

export function createExecution(jobId: number, folderName: string): JobExecution {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO job_executions (job_id, folder_name) VALUES (?, ?)
  `).run(jobId, folderName);
  return db.prepare('SELECT * FROM job_executions WHERE id = ?').get(
    Number(result.lastInsertRowid)
  ) as JobExecution;
}

export function updateExecutionSuccess(
  id: number,
  filesCopied: number,
  totalSize: string
): void {
  getDb().prepare(`
    UPDATE job_executions
    SET status = 'success', files_copied = ?, total_size = ?, finished_at = datetime('now')
    WHERE id = ?
  `).run(filesCopied, totalSize, id);
}

export function updateExecutionFailed(id: number, errorMessage: string): void {
  getDb().prepare(`
    UPDATE job_executions
    SET status = 'failed', error_message = ?, finished_at = datetime('now')
    WHERE id = ?
  `).run(errorMessage, id);
}

export function getExecutionsByJobId(
  jobId: number,
  page = 1,
  perPage = 20
): { data: JobExecution[]; total: number } {
  const db = getDb();
  const total = (db.prepare(
    'SELECT COUNT(*) as count FROM job_executions WHERE job_id = ?'
  ).get(jobId) as { count: number }).count;

  const offset = (page - 1) * perPage;
  const data = db.prepare(
    'SELECT * FROM job_executions WHERE job_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?'
  ).all(jobId, perPage, offset) as JobExecution[];

  return { data, total };
}

export function getExecutionById(id: number): JobExecution | undefined {
  return getDb().prepare('SELECT * FROM job_executions WHERE id = ?').get(id) as JobExecution | undefined;
}

export function getLastSuccessfulExecution(jobId: number): JobExecution | undefined {
  return getDb().prepare(
    "SELECT * FROM job_executions WHERE job_id = ? AND status = 'success' ORDER BY started_at DESC LIMIT 1"
  ).get(jobId) as JobExecution | undefined;
}

export function getLastExecution(jobId: number): JobExecution | undefined {
  return getDb().prepare(
    'SELECT * FROM job_executions WHERE job_id = ? ORDER BY started_at DESC LIMIT 1'
  ).get(jobId) as JobExecution | undefined;
}
