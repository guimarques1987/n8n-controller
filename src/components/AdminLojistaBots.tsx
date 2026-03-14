import React, { useState, useEffect } from 'react';
import { Store, Link, Check, Loader2 } from 'lucide-react';
import RobotConfigPage from './RobotConfigPage';

export default function AdminLojistaBots() {
  const [lojistas, setLojistas] = useState<{ id: number, nome: string, idLoja: number }[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedWf, setSelectedWf] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchWfQuery, setSearchWfQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);

  const token = localStorage.getItem('auth_token');

  const filteredLojistas = lojistas.filter(l =>
    (l.nome || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(l.id).includes(searchQuery) ||
    String(l.idLoja).includes(searchQuery)
  );

  const filteredWorkflows = workflows.filter(w =>
    (w.name || '').toLowerCase().includes(searchWfQuery.toLowerCase())
  );

  useEffect(() => {
    fetch('/api/admin/lojistas', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setLojistas(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch('/api/admin/workflows-all', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setWorkflows(data);
      })
      .catch(console.error);
  }, [token]);

  const handleLink = async () => {
    if (!selectedId || !selectedWf) return;
    const wf = workflows.find(w => w.id === selectedWf);
    if (!wf) return;

    const webhookNode = wf.nodes?.find((n: any) => n.type === 'n8n-nodes-base.webhook');
    const path = webhookNode?.parameters?.path;
    let fullWebhookUrl = '';

    if (path) {
      // Usa a webhookBaseUrl se existir (vinda da config da instância), senão cai para instanceUrl
      const baseToUse = wf.webhookBaseUrl || wf.instanceUrl;
      const cleanBase = baseToUse.endsWith('/') ? baseToUse.slice(0, -1) : baseToUse;
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      fullWebhookUrl = `${cleanBase}/webhook/${cleanPath}`;
    }

    setLinking(true);
    try {
      const res = await fetch('/api/admin/assign-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          lojistaId: selectedId,
          workflowId: wf.id,
          instanceId: wf.instanceId,
          workflowName: wf.name,
          webhookUrl: fullWebhookUrl
        })
      });
      if (res.ok) {
        alert('Fluxo vinculado com sucesso!');
        // Forçar refresh do RobotConfigPage
        const oldId = selectedId;
        setSelectedId('');
        setTimeout(() => setSelectedId(oldId), 10);
      }
    } catch (e) {
      console.error(e);
      alert('Falha ao vincular fluxo');
    } finally {
      setLinking(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Recuperando lista de lojistas...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Store className="h-6 w-6 text-indigo-600" />
            <h3 className="font-bold text-gray-800">1. Selecione o Lojista</h3>
          </div>
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Pesquisar por nome ou ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md border bg-white"
              />
            </div>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border bg-gray-50"
            >
              <option value="">-- Selecione na lista ({filteredLojistas.length} encontrados) --</option>
              {filteredLojistas.map(l => (
                <option key={l.id} value={l.id}>
                  {l.nome || `Lojista (ID: ${l.id})`} {l.idLoja ? `• Loja: ${l.idLoja}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Link className="h-6 w-6 text-emerald-600" />
            <h3 className="font-bold text-gray-800">2. Vincular Fluxo n8n</h3>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Pesquisar fluxo..."
              value={searchWfQuery}
              onChange={(e) => setSearchWfQuery(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-sm border-gray-300 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 rounded-md border bg-white"
              disabled={!selectedId}
            />
            <div className="flex gap-2">
              <select
                value={selectedWf}
                onChange={(e) => setSelectedWf(e.target.value)}
                className="flex-1 block pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border bg-gray-50"
                disabled={!selectedId}
              >
                <option value="">-- Selecione o fluxo ({filteredWorkflows.length}) --</option>
                {filteredWorkflows.map(w => (
                  <option key={`${w.instanceId}-${w.id}`} value={w.id}>
                    [{w.instanceId === '1' ? 'D' : 'S'}] {w.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleLink}
                disabled={!selectedId || !selectedWf || linking}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                Vincular
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedId && (
        <div className="animate-fade-in" key={selectedId}>
          <RobotConfigPage externalLojistaId={selectedId} />
        </div>
      )}
    </div>
  );
}
