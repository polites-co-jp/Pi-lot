import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import cronstrue from 'cronstrue/i18n';

interface DispatchRuleForm {
  pattern: string;
  dest_path: string;
}

interface JobFormData {
  name: string;
  source_path: string;
  dest_path: string;
  schedule: string;
  enabled: boolean;
  filter_mode: 'full' | 'incremental';
  retention: number;
  notify: { on_start: boolean; on_error: boolean; on_success: boolean };
  job_type: 'backup' | 'dispatch';
  default_dest_path: string;
  file_action: 'move' | 'copy';
  dispatch_rules: DispatchRuleForm[];
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
  job_type: 'backup',
  default_dest_path: '',
  file_action: 'copy',
  dispatch_rules: [],
};

function cronPreview(expr: string): string {
  try {
    return cronstrue.toString(expr, { locale: 'ja' });
  } catch {
    return '無効なcron式';
  }
}

function isValidRegex(pattern: string): boolean {
  try { new RegExp(pattern); return true; } catch { return false; }
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
        job_type: job.job_type ?? 'backup',
        default_dest_path: job.default_dest_path ?? '',
        file_action: job.file_action ?? 'copy',
        dispatch_rules: (job.dispatch_rules ?? []).map((r: any) => ({
          pattern: r.pattern,
          dest_path: r.dest_path,
        })),
      });
    });
  }, [id, isEdit]);

  const addRule = () => {
    setForm({ ...form, dispatch_rules: [...form.dispatch_rules, { pattern: '', dest_path: '' }] });
  };

  const removeRule = (index: number) => {
    setForm({ ...form, dispatch_rules: form.dispatch_rules.filter((_, i) => i !== index) });
  };

  const updateRule = (index: number, field: keyof DispatchRuleForm, value: string) => {
    const rules = [...form.dispatch_rules];
    rules[index] = { ...rules[index], [field]: value };
    setForm({ ...form, dispatch_rules: rules });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.job_type === 'dispatch') {
      if (form.dispatch_rules.length === 0 && !form.default_dest_path) {
        setError('振り分けルールを1つ以上追加するか、デフォルト移動先を設定してください');
        return;
      }
      for (let i = 0; i < form.dispatch_rules.length; i++) {
        const rule = form.dispatch_rules[i];
        if (!rule.pattern) {
          setError(`ルール${i + 1}: 正規表現パターンを入力してください`);
          return;
        }
        if (!isValidRegex(rule.pattern)) {
          setError(`ルール${i + 1}: 無効な正規表現です — ${rule.pattern}`);
          return;
        }
        if (!rule.dest_path) {
          setError(`ルール${i + 1}: 移動先を入力してください`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const payload: any = {
        name: form.name,
        source_path: form.source_path,
        schedule: form.schedule,
        enabled: form.enabled,
        notify: form.notify,
        job_type: form.job_type,
      };

      if (form.job_type === 'backup') {
        payload.dest_path = form.dest_path;
        payload.filter_mode = form.filter_mode;
        payload.retention = form.retention;
      } else {
        payload.default_dest_path = form.default_dest_path || '';
        payload.file_action = form.file_action;
        payload.dispatch_rules = form.dispatch_rules.map((r, i) => ({
          priority: (i + 1) * 10,
          pattern: r.pattern,
          dest_path: r.dest_path,
        }));
      }

      if (isEdit) {
        await api.put(`/jobs/${id}`, payload);
      } else {
        await api.post('/jobs', payload);
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
              <Label>ジョブ種別</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="job_type"
                    value="backup"
                    checked={form.job_type === 'backup'}
                    onChange={() => setForm({ ...form, job_type: 'backup' })}
                  />
                  バックアップ
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="job_type"
                    value="dispatch"
                    checked={form.job_type === 'dispatch'}
                    onChange={() => setForm({ ...form, job_type: 'dispatch' })}
                  />
                  ファイル振り分け
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">ジョブ名</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">
                {form.job_type === 'backup' ? 'コピー元 (UNCパス)' : '監視フォルダ (UNCパス)'}
              </Label>
              <Input id="source" value={form.source_path} onChange={(e) => setForm({ ...form, source_path: e.target.value })} placeholder="\\192.168.1.111\share\data" required />
            </div>

            {form.job_type === 'backup' && (
              <div className="space-y-2">
                <Label htmlFor="dest">コピー先 (UNCパス)</Label>
                <Input id="dest" value={form.dest_path} onChange={(e) => setForm({ ...form, dest_path: e.target.value })} placeholder="\\192.168.1.222\bk" required />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="schedule">スケジュール (cron式)</Label>
              <Input id="schedule" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} required />
              <p className="text-xs text-blue-600">{cronPreview(form.schedule)}</p>
            </div>

            <hr />

            {form.job_type === 'backup' ? (
              <>
                <h3 className="text-sm font-semibold text-gray-600">バックアップオプション</h3>

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
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-gray-600">振り分け設定</h3>

                <div className="space-y-2">
                  <Label>ファイル操作</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="file_action" value="copy" checked={form.file_action === 'copy'} onChange={() => setForm({ ...form, file_action: 'copy' })} />
                      コピー
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="file_action" value="move" checked={form.file_action === 'move'} onChange={() => setForm({ ...form, file_action: 'move' })} />
                      移動
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default_dest">条件に一致しないファイルの移動先 (任意)</Label>
                  <Input
                    id="default_dest"
                    value={form.default_dest_path}
                    onChange={(e) => setForm({ ...form, default_dest_path: e.target.value })}
                    placeholder="空欄の場合、一致しないファイルは移動しません"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>振り分けルール (上から順に評価)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addRule}>
                      <Plus className="mr-1 h-3 w-3" /> ルール追加
                    </Button>
                  </div>

                  {form.dispatch_rules.length === 0 && (
                    <p className="text-sm text-gray-400">ルールがありません。「ルール追加」で条件を設定してください。</p>
                  )}

                  {form.dispatch_rules.map((rule, index) => (
                    <div key={index} className="rounded-md border border-gray-200 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500">ルール {index + 1}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeRule(index)}>
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">ファイル名の正規表現</Label>
                        <Input
                          value={rule.pattern}
                          onChange={(e) => updateRule(index, 'pattern', e.target.value)}
                          placeholder="例: \.pdf$"
                          className={rule.pattern && !isValidRegex(rule.pattern) ? 'border-red-400' : ''}
                        />
                        {rule.pattern && !isValidRegex(rule.pattern) && (
                          <p className="text-xs text-red-500">無効な正規表現です</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">移動先 (UNCパス)</Label>
                        <Input
                          value={rule.dest_path}
                          onChange={(e) => updateRule(index, 'dest_path', e.target.value)}
                          placeholder="\\192.168.1.222\archive\pdf"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

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
