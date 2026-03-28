import cron from 'node-cron';
import { getEnabledJobs } from '../db/jobs.js';
import { executeBackupJob } from '../batch/backup.js';

const scheduledTasks = new Map<number, cron.ScheduledTask>();

export function startScheduler(): void {
  stopAllTasks();

  const jobs = getEnabledJobs();
  for (const job of jobs) {
    scheduleJob(job.id, job.schedule, job.name);
  }

  console.log(`スケジューラ起動: ${jobs.length}件のジョブを登録`);
}

export function scheduleJob(jobId: number, schedule: string, jobName: string): void {
  if (!cron.validate(schedule)) {
    console.error(`無効なcron式: ${schedule} (ジョブ: ${jobName})`);
    return;
  }

  if (scheduledTasks.has(jobId)) {
    scheduledTasks.get(jobId)!.stop();
  }

  const task = cron.schedule(schedule, async () => {
    const { getJobById } = await import('../db/jobs.js');
    const job = getJobById(jobId);
    if (!job || !job.enabled) return;

    console.log(`スケジュール実行開始: ${job.name}`);
    await executeBackupJob(job);
  });

  scheduledTasks.set(jobId, task);
}

export function unscheduleJob(jobId: number): void {
  const task = scheduledTasks.get(jobId);
  if (task) {
    task.stop();
    scheduledTasks.delete(jobId);
  }
}

export function stopAllTasks(): void {
  for (const [, task] of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.clear();
}

export function reloadScheduler(): void {
  startScheduler();
}
