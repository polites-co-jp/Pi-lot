import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, History, Play, Pencil } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import cronstrue from 'cronstrue/i18n';

interface JobData {
  id: number;
  name: string;
  source_path: string;
  dest_path: string;
  schedule: string;
  enabled: boolean;
  filter_mode: string;
  retention: number;
  notify: { on_start: boolean; on_error: boolean; on_success: boolean };
  job_type: 'backup' | 'dispatch';
  dispatch_rules: Array<{ id: number; priority: number; pattern: string; dest_path: string }>;
  last_execution: { status: string; finished_at: string | null } | null;
  created_at: string;
  updated_at: string;
}

function cronToJapanese(expr: string): string {
  try {
    return cronstrue.toString(expr, { locale: 'ja' });
  } catch {
    return expr;
  }
}

function StatusBadge({ status }: { status: string | undefined }) {
  if (!status) return <span className="text-xs text-gray-400">未実行</span>;
  switch (status) {
    case 'success':
      return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">&#x1f7e2; 成功</span>;
    case 'failed':
      return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">&#x1f534; 失敗</span>;
    case 'running':
      return <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600">&#x1f7e1; 実行中</span>;
    default:
      return <span className="text-xs text-gray-400">{status}</span>;
  }
}

export function Dashboard() {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchJobs = async () => {
    try {
      const res = await api.get<{ data: JobData[] }>('/jobs');
      setJobs(res.data);
    } catch (err) {
      console.error('ジョブ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  const handleRun = async (id: number) => {
    try {
      await api.post(`/jobs/${id}/run`);
      setTimeout(fetchJobs, 1000);
    } catch (err) {
      console.error('実行エラー:', err);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12 text-gray-400">読み込み中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ジョブ一覧</h1>
        <Button onClick={() => navigate('/jobs/new')}>
          <Plus className="mr-1 h-4 w-4" /> 新規登録
        </Button>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            ジョブが登録されていません。「新規登録」からジョブを作成してください。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.id} className={!job.enabled ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={job.last_execution?.status} />
                      <h2 className="truncate font-semibold">{job.name}</h2>
                      {job.job_type === 'dispatch' && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-600">振り分け</span>
                      )}
                      {!job.enabled && (
                        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500">無効</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm text-gray-500">
                      {job.job_type === 'dispatch'
                        ? `${job.source_path} → (${job.dispatch_rules?.length ?? 0}ルール)`
                        : `${job.source_path} → ${job.dest_path}`
                      }
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                      <span>{cronToJapanese(job.schedule)}</span>
                      {job.last_execution?.finished_at && (
                        <span>
                          最終: {new Date(job.last_execution.finished_at + 'Z').toLocaleString('ja-JP')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link to={`/jobs/${job.id}/history`}>
                      <Button variant="ghost" size="sm">
                        <History className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => handleRun(job.id)}>
                      <Play className="h-4 w-4" />
                    </Button>
                    <Link to={`/jobs/${job.id}/edit`}>
                      <Button variant="ghost" size="sm">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
