import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';

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

export function ExecutionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exec, setExec] = useState<Execution | null>(null);

  useEffect(() => {
    api.get<Execution>(`/executions/${id}`).then(setExec);
  }, [id]);

  if (!exec) return <div className="py-12 text-center text-gray-400">読み込み中...</div>;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-1 h-4 w-4" /> 戻る
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>実行詳細 #{exec.id}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-medium text-gray-500">ステータス</dt>
            <dd className={exec.status === 'success' ? 'text-green-600' : exec.status === 'failed' ? 'text-red-600' : 'text-yellow-600'}>
              {exec.status === 'success' ? '成功' : exec.status === 'failed' ? '失敗' : '実行中'}
            </dd>

            <dt className="font-medium text-gray-500">フォルダ名</dt>
            <dd>{exec.folder_name}</dd>

            <dt className="font-medium text-gray-500">開始日時</dt>
            <dd>{new Date(exec.started_at + 'Z').toLocaleString('ja-JP')}</dd>

            <dt className="font-medium text-gray-500">終了日時</dt>
            <dd>{exec.finished_at ? new Date(exec.finished_at + 'Z').toLocaleString('ja-JP') : '-'}</dd>

            <dt className="font-medium text-gray-500">コピー件数</dt>
            <dd>{exec.files_copied}件</dd>

            <dt className="font-medium text-gray-500">合計サイズ</dt>
            <dd>{exec.total_size}</dd>

            {exec.error_message && (
              <>
                <dt className="font-medium text-gray-500">エラー</dt>
                <dd className="whitespace-pre-wrap rounded bg-red-50 p-2 text-red-700">
                  {exec.error_message}
                </dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
