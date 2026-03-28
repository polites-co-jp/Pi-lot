import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import cronstrue from 'cronstrue/i18n';

interface JobFormData {
  name: string;
  source_path: string;
  dest_path: string;
  schedule: string;
  enabled: boolean;
  filter_mode: 'full' | 'incremental';
  retention: number;
  notify: { on_start: boolean; on_error: boolean; on_success: boolean };
}

const defaultData: JobFormData = {
  name: '',
  source_path: '',
  dest_path: '',
  schedule: '0 3 * * *',
  enabled: true,
  filter_mode: 'full',
  retention: 0,
  notify: { on_start: false, on_error: true, on_success: false },
};

function cronPreview(expr: string): string {
  try {
    return cronstrue.toString(expr, { locale: 'ja' });
  } catch {
    return '無効なcron式';
  }
}

export function JobForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [form, setForm] = useState<JobFormData>(defaultData);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api.get<any>(`/jobs/${id}`).then((job) => {
      setForm({
        name: job.name,
        source_path: job.source_path,
        dest_path: job.dest_path,
        schedule: job.schedule,
        enabled: job.enabled,
        filter_mode: job.filter_mode,
        retention: job.retention,
        notify: job.notify,
      });
    });
  }, [id, isEdit]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/jobs/${id}`, form);
      } else {
        await api.post('/jobs', form);
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('このジョブを削除しますか？')) return;
    try {
      await api.delete(`/jobs/${id}`);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
        <ArrowLeft className="mr-1 h-4 w-4" /> 戻る
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? 'ジョブ編集' : 'ジョブ登録'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">ジョブ名</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">コピー元 (UNCパス)</Label>
              <Input id="source" value={form.source_path} onChange={(e) => setForm({ ...form, source_path: e.target.value })} placeholder="\\192.168.1.111\share\data" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dest">コピー先 (UNCパス)</Label>
              <Input id="dest" value={form.dest_path} onChange={(e) => setForm({ ...form, dest_path: e.target.value })} placeholder="\\192.168.1.222\bk" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule">スケジュール (cron式)</Label>
              <Input id="schedule" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} required />
              <p className="text-xs text-blue-600">{cronPreview(form.schedule)}</p>
            </div>

            <hr />
            <h3 className="text-sm font-semibold text-gray-600">オプション</h3>

            <div className="space-y-2">
              <Label>コピー方式</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="filter_mode" value="full" checked={form.filter_mode === 'full'} onChange={() => setForm({ ...form, filter_mode: 'full' })} />
                  全ファイルコピー
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="filter_mode" value="incremental" checked={form.filter_mode === 'incremental'} onChange={() => setForm({ ...form, filter_mode: 'incremental' })} />
                  差分コピー
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="retention">保持世代数 (0=無制限)</Label>
              <Input id="retention" type="number" min={0} value={form.retention} onChange={(e) => setForm({ ...form, retention: parseInt(e.target.value) || 0 })} />
            </div>

            <hr />
            <h3 className="text-sm font-semibold text-gray-600">Discord通知</h3>

            <div className="space-y-2">
              {[
                { key: 'on_start' as const, label: '開始前に通知' },
                { key: 'on_error' as const, label: 'エラー時に通知' },
                { key: 'on_success' as const, label: '成功時に通知' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.notify[key]}
                    onChange={(e) =>
                      setForm({ ...form, notify: { ...form.notify, [key]: e.target.checked } })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                有効
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? '保存中...' : '保存'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/')}>
                キャンセル
              </Button>
              {isEdit && (
                <Button type="button" variant="destructive" onClick={handleDelete} className="ml-auto">
                  削除
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
