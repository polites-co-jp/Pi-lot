import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

interface Execution {
  id: number;
  job_id: number;
  status: string;
  folder_name: string;
  files_copied: number;
  total_size: string;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

interface JobData {
  id: number;
  name: string;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success': return <span className="text-green-600">&#x1f7e2;</span>;
    case 'failed': return <span className="text-red-600">&#x1f534;</span>;
    case 'running': return <span className="text-yellow-600">&#x1f7e1;</span>;
    default: return null;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'success': return '成功';
    case 'failed': return '失敗';
    case 'running': return '実行中';
    default: return status;
  }
}

export function JobHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobData | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 20;

  useEffect(() => {
    api.get<any>(`/jobs/${id}`).then((j) => setJob(j));
  }, [id]);

  useEffect(() => {
    api.get<{ data: Execution[]; pagination: { total: number } }>(
      `/jobs/${id}/executions?page=${page}&per_page=${perPage}`
    ).then((res) => {
      setExecutions(res.data);
      setTotal(res.pagination.total);
    });
  }, [id, page]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
        <ArrowLeft className="mr-1 h-4 w-4" /> 戻る
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{job?.name ?? '...'} - 実行履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {executions.length === 0 ? (
            <p className="py-8 text-center text-gray-400">実行履歴がありません</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-4">日時</th>
                      <th className="pb-2 pr-4">状態</th>
                      <th className="pb-2 pr-4">件数</th>
                      <th className="pb-2 pr-4">サイズ</th>
                      <th className="pb-2">詳細</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map((exec) => (
                      <tr key={exec.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {new Date(exec.started_at + 'Z').toLocaleString('ja-JP')}
                        </td>
                        <td className="py-2 pr-4">
                          <StatusIcon status={exec.status} /> {statusLabel(exec.status)}
                        </td>
                        <td className="py-2 pr-4">
                          {exec.status === 'success' ? `${exec.files_copied}件` : '-'}
                        </td>
                        <td className="py-2 pr-4">
                          {exec.status === 'success' ? exec.total_size : '-'}
                        </td>
                        <td className="py-2">
                          <Button variant="link" size="sm" onClick={() => navigate(`/executions/${exec.id}`)}>
                            詳細
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-500">{page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
