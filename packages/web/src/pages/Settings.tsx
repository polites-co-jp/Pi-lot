import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';

interface SmbMount {
  unc_path: string;
  local_path: string;
}

export function Settings() {
  const navigate = useNavigate();
  const [mounts, setMounts] = useState<SmbMount[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get<{ data: SmbMount[] }>('/config/smb-mounts').then((res) => setMounts(res.data));
    api.get<{ webhook_url: string }>('/config/discord').then((res) => setWebhookUrl(res.webhook_url));
  }, []);

  const saveMounts = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/config/smb-mounts', { data: mounts });
      setMessage('SMBマウント設定を保存しました');
    } catch (err) {
      setMessage('保存に失敗しました');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const saveDiscord = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/config/discord', { webhook_url: webhookUrl });
      setMessage('Discord設定を保存しました');
    } catch (err) {
      setMessage('保存に失敗しました');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const addMount = () => setMounts([...mounts, { unc_path: '', local_path: '' }]);
  const removeMount = (i: number) => setMounts(mounts.filter((_, idx) => idx !== i));
  const updateMount = (i: number, field: keyof SmbMount, value: string) => {
    const updated = [...mounts];
    updated[i] = { ...updated[i], [field]: value };
    setMounts(updated);
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
        <ArrowLeft className="mr-1 h-4 w-4" /> 戻る
      </Button>

      {message && (
        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-600">{message}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>SMBマウント設定</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveMounts} className="space-y-4">
            {mounts.map((m, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">UNCパス</Label>
                  <Input value={m.unc_path} onChange={(e) => updateMount(i, 'unc_path', e.target.value)} placeholder="\\192.168.1.111\share" />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">ローカルパス</Label>
                  <Input value={m.local_path} onChange={(e) => updateMount(i, 'local_path', e.target.value)} placeholder="/mnt/smb/source" />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeMount(i)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addMount}>
                <Plus className="mr-1 h-3 w-3" /> 追加
              </Button>
              <Button type="submit" size="sm" disabled={saving}>保存</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discord Webhook</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDiscord} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook">Webhook URL</Label>
              <Input id="webhook" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." />
            </div>
            <Button type="submit" size="sm" disabled={saving}>保存</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
