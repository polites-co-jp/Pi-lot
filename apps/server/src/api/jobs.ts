import type { FastifyInstance } from 'fastify';
import { getAllJobs, getJobById, createJob, updateJob, deleteJob, getDispatchRules } from '../db/jobs.js';
import { getLastExecution } from '../db/executions.js';
import { executeBackupJob } from '../batch/backup.js';
import { executeDispatchJob } from '../batch/dispatch.js';
import { reloadScheduler } from '../scheduler/index.js';

interface DispatchRuleBody {
  priority: number;
  pattern: string;
  dest_path: string;
}

interface JobBody {
  name: string;
  source_path: string;
  dest_path?: string;
  schedule: string;
  enabled?: boolean;
  filter_mode?: 'full' | 'incremental';
  retention?: number;
  notify?: {
    on_start?: boolean;
    on_error?: boolean;
    on_success?: boolean;
  };
  job_type?: 'backup' | 'dispatch';
  default_dest_path?: string;
  file_action?: 'move' | 'copy';
  dispatch_rules?: DispatchRuleBody[];
}

function isValidRegex(pattern: string): boolean {
  try { new RegExp(pattern); return true; } catch { return false; }
}

function formatJobResponse(job: ReturnType<typeof getJobById>, lastExec?: ReturnType<typeof getLastExecution>) {
  if (!job) return null;
  const base = {
    id: job.id,
    name: job.name,
    source_path: job.source_path,
    dest_path: job.dest_path,
    schedule: job.schedule,
    enabled: !!job.enabled,
    filter_mode: job.filter_mode,
    retention: job.retention,
    notify: {
      on_start: !!job.notify_on_start,
      on_error: !!job.notify_on_error,
      on_success: !!job.notify_on_success,
    },
    job_type: job.job_type ?? 'backup',
    default_dest_path: job.default_dest_path ?? '',
    file_action: job.file_action ?? 'copy',
    last_execution: lastExec
      ? { status: lastExec.status, finished_at: lastExec.finished_at }
      : null,
    created_at: job.created_at,
    updated_at: job.updated_at,
    dispatch_rules: [] as Array<{ id: number; priority: number; pattern: string; dest_path: string }>,
  };

  if (base.job_type === 'dispatch') {
    base.dispatch_rules = getDispatchRules(job.id);
  }

  return base;
}

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', (app as any).authenticate);

  app.get('/api/jobs', async () => {
    const jobs = getAllJobs();
    const data = jobs.map((job) => {
      const lastExec = getLastExecution(job.id);
      return formatJobResponse(job, lastExec);
    });
    return { data };
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const job = getJobById(Number(request.params.id));
    if (!job) return reply.status(404).send({ error: 'ジョブが見つかりません' });
    const lastExec = getLastExecution(job.id);
    return formatJobResponse(job, lastExec);
  });

  app.post<{ Body: JobBody }>('/api/jobs', async (request, reply) => {
    const body = request.body;

    if (body.job_type === 'dispatch' && body.dispatch_rules?.length) {
      for (const rule of body.dispatch_rules) {
        if (!isValidRegex(rule.pattern)) {
          return reply.status(400).send({ error: `無効な正規表現: ${rule.pattern}` });
        }
      }
    }

    const job = createJob({
      name: body.name,
      source_path: body.source_path,
      dest_path: body.dest_path,
      schedule: body.schedule,
      enabled: body.enabled,
      filter_mode: body.filter_mode,
      retention: body.retention,
      notify_on_start: body.notify?.on_start,
      notify_on_error: body.notify?.on_error,
      notify_on_success: body.notify?.on_success,
      job_type: body.job_type,
      default_dest_path: body.default_dest_path,
      file_action: body.file_action,
      dispatch_rules: body.dispatch_rules,
    });
    reloadScheduler();
    return formatJobResponse(job);
  });

  app.put<{ Params: { id: string }; Body: Partial<JobBody> }>(
    '/api/jobs/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      const body = request.body;

      if (body.dispatch_rules?.length) {
        for (const rule of body.dispatch_rules) {
          if (!isValidRegex(rule.pattern)) {
            return reply.status(400).send({ error: `無効な正規表現: ${rule.pattern}` });
          }
        }
      }

      const job = updateJob(id, {
        name: body.name,
        source_path: body.source_path,
        dest_path: body.dest_path,
        schedule: body.schedule,
        enabled: body.enabled,
        filter_mode: body.filter_mode,
        retention: body.retention,
        notify_on_start: body.notify?.on_start,
        notify_on_error: body.notify?.on_error,
        notify_on_success: body.notify?.on_success,
        job_type: body.job_type,
        default_dest_path: body.default_dest_path,
        file_action: body.file_action,
        dispatch_rules: body.dispatch_rules,
      });
      if (!job) return reply.status(404).send({ error: 'ジョブが見つかりません' });
      reloadScheduler();
      return formatJobResponse(job);
    }
  );

  app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const deleted = deleteJob(Number(request.params.id));
    if (!deleted) return reply.status(404).send({ error: 'ジョブが見つかりません' });
    reloadScheduler();
    return { success: true };
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/run', async (request, reply) => {
    const job = getJobById(Number(request.params.id));
    if (!job) return reply.status(404).send({ error: 'ジョブが見つかりません' });

    const executor = job.job_type === 'dispatch' ? executeDispatchJob : executeBackupJob;
    executor(job).catch((err) => {
      console.error(`ジョブ即時実行エラー: ${job.name}`, err);
    });

    return { message: `ジョブ「${job.name}」の実行を開始しました` };
  });
}
