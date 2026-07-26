import React, { useState, useEffect } from 'react';
import { Store, Link, Check, Loader2, User, KeyRound, Bot, Search, ExternalLink, QrCode, MessageSquare, AlertCircle, Trash2, CheckCircle2, RefreshCw, Plus } from 'lucide-react';
import RobotConfigPage from './RobotConfigPage';
import MassMessagePage from './MassMessagePage';

export default function AdminLojistaBots() {
  const [activeTab, setActiveTab] = useState<'n8n' | 'ycloud'>('n8n');
  const [lojistas, setLojistas] = useState<{ id: number, nome: string, idLoja: number, codCliente?: string }[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedWfs, setSelectedWfs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchWfQuery, setSearchWfQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState('');
  const [linkingWp, setLinkingWp] = useState(false);

  const token = localStorage.getItem('auth_token');

  const filteredLojistas = lojistas.filter(l =>
    (l.nome || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(l.id).includes(searchQuery) ||
    String(l.idLoja).includes(searchQuery) ||
    String(l.codCliente || '').includes(searchQuery)
  );

  const filteredWorkflows = workflows.filter(w =>
    (w.name || '').toLowerCase().includes(searchWfQuery.toLowerCase())
  );

  const selectedLojista = lojistas.find(l => String(l.id) === selectedId);

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

    fetch('/api/admin/whatsapp/instances', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setInstances(data);
      })
      .catch(console.error);
  }, [token]);

  const handleLink = async () => {
    if (!selectedId || selectedWfs.length === 0) return;

    setLinking(true);
    let successCount = 0;
    try {
      for (const wfId of selectedWfs) {
        const wf = workflows.find(w => w.id === wfId);
        if (!wf) continue;

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
        if (res.ok) successCount++;
      }
      
      if (successCount > 0) {
        alert(`${successCount} fluxo(s) vinculado(s) com sucesso!`);
        // Forçar refresh do RobotConfigPage
        const oldId = selectedId;
        setSelectedId('');
        setTimeout(() => setSelectedId(oldId), 10);
        setSelectedWfs([]); // Limpar seleção após sucesso
      }
    } catch (e) {
      console.error(e);
      alert('Falha ao vincular fluxos');
    } finally {
      setLinking(false);
    }
  };

  const handleLinkWp = async () => {
    if (!selectedLojista || !selectedInstance) return;
    setLinkingWp(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/admin/whatsapp/assign-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ lojistaId: selectedLojista.id, instanceName: selectedInstance })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao vincular');
      }
      alert('WhatsApp vinculado com sucesso!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLinkingWp(false);
    }
  };

  const handleCreateInstance = async () => {
    const name = prompt('Digite o nome da nova instância (sem espaços, ex: lanchonete_vip):');
    if (!name) return;

    setLinkingWp(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/admin/whatsapp/create-instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ instanceName: name.trim().toLowerCase() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar instância');

      alert('Instância criada com sucesso! Atualizando lista...');

      // Atualizar a lista local
      const fetchReq = await fetch('/api/admin/whatsapp/instances', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (fetchReq.ok) {
        setInstances(await fetchReq.json());
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLinkingWp(false);
    }
  };

  const handleAutoLink = async () => {
    if (!confirm('Deseja vincular automaticamente todas as instâncias aos lojistas pelo número de celular?')) return;
    setLinkingWp(true);
    try {
      const res = await fetch('/api/admin/whatsapp/auto-link-all', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no processamento');

      alert(`Sucesso! ${data.linkedCount} vínculos realizados com sucesso.`);

      // Forçar refresh da página se um lojista estiver selecionado
      if (selectedId) {
        const oldId = selectedId;
        setSelectedId('');
        setTimeout(() => setSelectedId(oldId), 10);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLinkingWp(false);
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
                  {l.nome || `Lojista (ID: ${l.id})`} {l.codCliente ? `• cod-cliente: ${l.codCliente}` : l.idLoja ? `• Loja: ${l.idLoja}` : ''}
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
              <div className="flex-1 block py-2 border-gray-300 rounded-md border bg-gray-50 overflow-y-auto" style={{ maxHeight: '160px' }}>
                {filteredWorkflows.length === 0 && <span className="px-3 text-sm text-gray-500">Nenhum fluxo encontrado.</span>}
                {filteredWorkflows.map(w => (
                  <label key={`${w.instanceId}-${w.id}`} className="flex items-center px-3 py-1.5 hover:bg-gray-100 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedWfs.includes(w.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedWfs([...selectedWfs, w.id]);
                        else setSelectedWfs(selectedWfs.filter(id => id !== w.id));
                      }}
                      className="mr-3 rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                      disabled={!selectedId}
                    />
                    <span className="text-sm text-gray-700">[{w.instanceId === '1' ? 'D' : 'S'}] {w.name}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={handleLink}
                disabled={!selectedId || selectedWfs.length === 0 || linking}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors h-fit mt-1"
              >
                {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                Vincular
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <h3 className="font-bold text-gray-800">3. Vincular Instância WhatsApp</h3>
          </div>
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1 flex gap-2">
                <select
                  value={selectedInstance}
                  onChange={(e) => setSelectedInstance(e.target.value)}
                  className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none"
                  disabled={!selectedId}
                >
                  <option value="">Selecione uma instância...</option>
                  {instances.map((inst: any) => (
                    <option key={inst.name} value={inst.name}>
                      {inst.name} {inst.owner ? `(${inst.owner.replace('55', '')})` : ''} • {inst.status}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleCreateInstance}
                  title="Criar Nova Instância"
                  className="p-2 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 flex-shrink-0"
                  disabled={!selectedId || linkingWp}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={handleLinkWp}
                  disabled={!selectedId || !selectedInstance || linkingWp}
                  className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  {linkingWp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                  Salvar Vínculo Manual
                </button>
                <button
                  onClick={handleAutoLink}
                  disabled={linkingWp}
                  className="w-full flex items-center justify-center px-4 py-2 border border-indigo-200 rounded-md shadow-sm text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"
                >
                  {linkingWp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Vincular Automático por Celular
                </button>
              </div>
            </div>
            {!selectedInstance && (
              <p className="text-xs text-gray-500 italic">
                * Se não vincular, o sistema tentará buscar automaticamente pelo número.
              </p>
            )}
          </div>
        </div>
      </div>

      {selectedId && (
        <div className="animate-fade-in" key={selectedId}>
          <div className="flex gap-4 border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('n8n')}
              className={`pb-3 px-1 font-semibold text-sm border-b-2 transition-colors ${
                activeTab === 'n8n' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Configurar Robô (n8n)
            </button>
            <button
              onClick={() => setActiveTab('ycloud')}
              className={`pb-3 px-1 font-semibold text-sm border-b-2 transition-colors ${
                activeTab === 'ycloud' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Painel Disparos (YCloud)
            </button>
          </div>
          
          {activeTab === 'n8n' && <RobotConfigPage externalLojistaId={selectedId} />}
          {activeTab === 'ycloud' && <MassMessagePage externalLojistaId={selectedId} />}
        </div>
      )}
    </div>
  );
}
