import { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw, AlertCircle, Filter, Server, Settings, Database, LogOut, User, KeyRound, Bot, LayoutTemplate } from 'lucide-react';
import FolderView from './components/FolderView';
import CreateWorkflowModal from './components/CreateWorkflowModal';
import EditWorkflowModal from './components/EditWorkflowModal';
import SettingsModal from './components/SettingsModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import RobotConfigPage from './components/RobotConfigPage';
import LoginPage from './components/LoginPage';
import AdminLoginConfig from './components/AdminLoginConfig';
import AdminLojistaBots from './components/AdminLojistaBots';
import { useAuth } from './contexts/AuthContext';
import { getWorkflows, toggleWorkflow, createWorkflow, deleteWorkflow, getConfig, saveConfig, getWorkflow, updateWorkflow } from './services/n8n';
import { Workflow, Tag, Project } from './types';

// ─── Dashboard (apenas renderizado quando autenticado) ────────────────────────
function Dashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'painel' | 'robo' | 'usuarios' | 'admin-login' | 'admin-bots'>(user?.role === 'lojista' ? 'robo' : 'painel');
  const [workflows1, setWorkflows1] = useState<Workflow[]>([]);
  const [workflows2, setWorkflows2] = useState<Workflow[]>([]);
  const [projects1, setProjects1] = useState<Project[]>([]);
  const [projects2, setProjects2] = useState<Project[]>([]);
  const [loading1, setLoading1] = useState(true);
  const [loading2, setLoading2] = useState(true);
  const [error1, setError1] = useState<string | null>(null);
  const [error2, setError2] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [config, setConfig] = useState<Record<string, any>>({});
  const [dbConnected, setDbConnected] = useState<boolean>(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      const conf = await getConfig();
      setConfig(conf);
      setDbConnected(!!conf._dbConnected);
    } catch (e) {
      console.error("Failed to fetch config", e);
    }
  };

  const handleSaveConfig = async (newConfig: any) => {
    try {
      await saveConfig(newConfig);
      await fetchConfig();
      await fetchAll();
    } catch (e) {
      alert("Falha ao salvar configurações");
    }
  };

  const fetchWorkflows = async (instanceId: string) => {
    try {
      if (instanceId === '1') {
        setError1(null);
        const data = await getWorkflows('1');
        const list = Array.isArray(data) ? data : data.data || [];
        const projs: Project[] = Array.isArray(data.projects) ? data.projects : [];
        setWorkflows1(list);
        setProjects1(projs);
        setLoading1(false);
      } else {
        setError2(null);
        const data = await getWorkflows('2');
        const list = Array.isArray(data) ? data : data.data || [];
        const projs: Project[] = Array.isArray(data.projects) ? data.projects : [];
        setWorkflows2(list);
        setProjects2(projs);
        setLoading2(false);
      }
    } catch (err: any) {
      console.error(err);
      const errorMessage = err.response?.data?.error || err.message || 'Erro desconhecido';
      if (instanceId === '1') {
        setError1(`Falha ao conectar com Robô Delivery: ${errorMessage}`);
        setLoading1(false);
      } else {
        setError2(`Falha ao conectar com Robô de Status: ${errorMessage}`);
        setLoading2(false);
      }
    }
  };

  const fetchAll = async () => {
    setRefreshing(true);
    await Promise.all([fetchWorkflows('1'), fetchWorkflows('2')]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchConfig();
    fetchAll();
  }, []);

  const handleToggle = async (instanceId: string, id: string, active: boolean) => {
    const setWorkflows = instanceId === '1' ? setWorkflows1 : setWorkflows2;
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, active } : w));
    try {
      await toggleWorkflow(instanceId, id, active);
    } catch (err) {
      console.error(err);
      setWorkflows(prev => prev.map(w => w.id === id ? { ...w, active: !active } : w));
      alert('Falha ao atualizar status do fluxo');
    }
  };

  const handleCreateMultiple = async (payloads: any[]) => {
    let hasError = false;
    for (const payload of payloads) {
      try {
        const targetInstanceId = payload._targetInstanceId;
        // Limpa campos auxiliares que não vão para o N8N
        delete payload._targetInstanceId;
        delete payload._templateKey;
        await createWorkflow(targetInstanceId, payload);
      } catch (err) {
        console.error("Erro salvando fluxo em batch: ", payload.name, err);
        hasError = true;
      }
    }

    // Refresh both panels just in case
    await fetchAll();

    if (hasError) {
      alert("Alguns fluxos não puderam ser criados. Verifique o console.");
    }
  };

  const handleDelete = async (instanceId: string, id: string) => {
    if (!confirm('Tem certeza que deseja excluir este fluxo?')) return;
    const setWorkflows = instanceId === '1' ? setWorkflows1 : setWorkflows2;
    setWorkflows(prev => prev.filter(w => w.id !== id));
    try {
      await deleteWorkflow(instanceId, id);
    } catch (err) {
      console.error(err);
      alert('Falha ao excluir fluxo');
      fetchWorkflows(instanceId);
    }
  };

  const handleEdit = (instanceId: string, workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setEditingInstanceId(instanceId);
  };

  const handleSaveEdit = async (instanceId: string, id: string, data: any) => {
    await updateWorkflow(instanceId, id, data);
    const setWorkflows = instanceId === '1' ? setWorkflows1 : setWorkflows2;
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, ...data, id } : w));
  };

  const tags = useMemo(() => {
    const allTags: Tag[] = [];
    const tagMap = new Map<string, string>();
    [...workflows1, ...workflows2].forEach(w => {
      if (w.tags) {
        w.tags.forEach(t => {
          if (!tagMap.has(t.id)) {
            tagMap.set(t.id, t.name);
            allTags.push(t);
          }
        });
      }
    });
    return allTags.sort((a, b) => a.name.localeCompare(b.name));
  }, [workflows1, workflows2]);

  const filterWorkflows = (list: Workflow[]) => {
    let filtered = list;
    if (selectedTag !== 'all') {
      filtered = filtered.filter(w => w.tags?.some(t => t.id === selectedTag));
    }
    if (statusFilter === 'published') {
      filtered = filtered.filter(w => w.active === true);
    } else if (statusFilter === 'draft') {
      filtered = filtered.filter(w => w.active === false);
    }
    return filtered;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow sticky top-0 z-10">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center flex-wrap gap-2">
            <Server className="h-6 w-6 mr-1 text-indigo-600" />
            n8n Controller
            <div className={`flex items-center px-2 py-1 rounded text-xs font-medium ${dbConnected ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              <Database className="h-3 w-3 mr-1" />
              {dbConnected ? 'DB Online' : 'Memória'}
            </div>
            <div className="flex items-center px-2 py-1 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
              <User className="h-3 w-3 mr-1" />
              {user!.name || user!.email} {user!.idLoja ? `(ID: ${user!.idLoja})` : ''} · {user!.role === 'admin' ? 'Admin' : 'Lojista'}
            </div>
          </h1>

          <div className="flex items-center space-x-3 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
            {user!.role === 'admin' && (
              <>
                <button
                  onClick={() => setActiveTab('painel')}
                  className={`inline-flex items-center px-3 py-2 border rounded-md shadow-sm text-sm font-medium ${activeTab === 'painel' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  <Server className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Painel</span>
                </button>
                <button
                  onClick={() => setActiveTab('admin-bots')}
                  className={`inline-flex items-center px-3 py-2 border rounded-md shadow-sm text-sm font-medium ${activeTab === 'admin-bots' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  <Bot className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Robôs Lojistas</span>
                </button>
                <button
                  onClick={() => setActiveTab('admin-login')}
                  className={`inline-flex items-center px-3 py-2 border rounded-md shadow-sm text-sm font-medium ${activeTab === 'admin-login' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  <LayoutTemplate className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Tela Login</span>
                </button>
              </>
            )}

            {/* Filtros — só visíveis no tab Painel */}
            {activeTab === 'painel' && (
              <div className="flex items-center space-x-2 bg-gray-50 p-2 rounded-lg border border-gray-200 flex-grow sm:flex-grow-0">
                <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="block pl-1 pr-2 py-1 text-sm border-none focus:outline-none focus:ring-0 rounded-md bg-transparent"
                >
                  <option value="all">Todas as Tags</option>
                  {tags.map(tag => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
                <div className="w-px h-4 bg-gray-300" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="block pl-1 pr-2 py-1 text-sm border-none focus:outline-none focus:ring-0 rounded-md bg-transparent font-medium"
                >
                  <option value="all">Todos</option>
                  <option value="published">Publicados</option>
                  <option value="draft">Rascunhos</option>
                </select>
              </div>
            )}

            {user!.role === 'admin' && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Settings className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Configurações</span>
              </button>
            )}

            <button
              onClick={() => setIsChangePasswordOpen(true)}
              className="inline-flex items-center px-3 py-2 border border-indigo-200 rounded-md shadow-sm text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
              title="Cadastrar / Alterar Senha"
            >
              <KeyRound className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Senha</span>
            </button>
            {user!.role === 'admin' && (
              <button
                onClick={fetchAll}
                className={`inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 ${refreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>
            )}

            <button
              onClick={logout}
              className="inline-flex items-center px-3 py-2 border border-red-200 rounded-md shadow-sm text-sm font-medium text-red-600 bg-white hover:bg-red-50"
              title="Sair"
            >
              <LogOut className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className={(activeTab === 'robo' || activeTab === 'admin-login' || activeTab === 'admin-bots') ? 'max-w-7xl mx-auto py-6 sm:px-6 lg:px-8' : 'max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start'}>

        {/* Tela de Configuração do Robô */}
        {activeTab === 'robo' && <RobotConfigPage />}

        {/* Telas Exclusivas do Admin */}
        {activeTab === 'admin-login' && <AdminLoginConfig />}
        {activeTab === 'admin-bots' && <AdminLojistaBots />}

        {/* Painel de workflows */}
        {activeTab === 'painel' && (
          <div className="space-y-6">
            {/* Cabeçalho Unificado do Painel */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Meus Robôs</h2>
                <p className="text-sm text-gray-500">Gerencie todos os fluxos e instâncias ativas do n8n.</p>
              </div>
              {user!.role === 'admin' && (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="h-4 w-4 mr-2" /> Criador de Fluxos em Lote
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Robô Delivery */}
              <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-800 flex items-center">
                    <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                    Instância 1 (Delivery / Recuperador / Lembrete)
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    {filterWorkflows(workflows1).length === workflows1.length
                      ? `${workflows1.length} fluxo${workflows1.length !== 1 ? 's' : ''} carregado${workflows1.length !== 1 ? 's' : ''}`
                      : `${filterWorkflows(workflows1).length} de ${workflows1.length} exibido${filterWorkflows(workflows1).length !== 1 ? 's' : ''}`
                    }
                  </p>
                </div>

                {error1 && (
                  <div className="rounded-md bg-red-50 p-4 mb-4">
                    <div className="flex flex-col">
                      <div className="flex items-center">
                        <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
                        <p className="text-sm text-red-700">{error1}</p>
                      </div>
                      {error1.includes('configuration missing') && (
                        <button onClick={() => setIsSettingsOpen(true)} className="mt-2 text-sm font-medium text-red-700 hover:text-red-600 underline self-start ml-7">
                          Configurar Agora
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {loading1 ? (
                  <div className="flex justify-center items-center h-64 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <div className="flex-grow">
                    <FolderView
                      workflows={filterWorkflows(workflows1)}
                      projects={projects1}
                      onToggle={(id, active) => handleToggle('1', id, active)}
                      onDelete={(id) => handleDelete('1', id)}
                      onEdit={(wf) => handleEdit('1', wf)}
                      n8nBaseUrl={config['1']?.webhookUrl || config['1']?.baseUrl}
                      accentColor="blue"
                    />
                  </div>
                )}
              </section>

              {/* Robô de Status */}
              <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-800 flex items-center">
                    <span className="w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
                    Instância 2 (Status de Pedidos)
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    {filterWorkflows(workflows2).length === workflows2.length
                      ? `${workflows2.length} fluxo${workflows2.length !== 1 ? 's' : ''} carregado${workflows2.length !== 1 ? 's' : ''}`
                      : `${filterWorkflows(workflows2).length} de ${workflows2.length} exibido${filterWorkflows(workflows2).length !== 1 ? 's' : ''}`
                    }
                  </p>
                </div>

                {error2 && (
                  <div className="rounded-md bg-red-50 p-4 mb-4">
                    <div className="flex flex-col">
                      <div className="flex items-center">
                        <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
                        <p className="text-sm text-red-700">{error2}</p>
                      </div>
                      {error2.includes('configuration missing') && (
                        <button onClick={() => setIsSettingsOpen(true)} className="mt-2 text-sm font-medium text-red-700 hover:text-red-600 underline self-start ml-7">
                          Configurar Agora
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {loading2 ? (
                  <div className="flex justify-center items-center h-64 bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  </div>
                ) : (
                  <div>
                    <FolderView
                      workflows={filterWorkflows(workflows2)}
                      projects={projects2}
                      onToggle={(id, active) => handleToggle('2', id, active)}
                      onDelete={(id) => handleDelete('2', id)}
                      onEdit={(wf) => handleEdit('2', wf)}
                      n8nBaseUrl={config['2']?.webhookUrl || config['2']?.baseUrl}
                      accentColor="purple"
                    />
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

      </main>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      <CreateWorkflowModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateMultiple={handleCreateMultiple}
        config={config}
      />

      <EditWorkflowModal
        isOpen={!!editingWorkflow}
        workflow={editingWorkflow}
        instanceId={editingInstanceId}
        n8nBaseUrl={editingInstanceId ? config[editingInstanceId]?.baseUrl : undefined}
        onClose={() => { setEditingWorkflow(null); setEditingInstanceId(null); }}
        onSave={handleSaveEdit}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={handleSaveConfig}
        workflows1={workflows1}
        workflows2={workflows2}
        fetchWorkflowDetails={async (instanceId, workflowId) => {
          try {
            return await getWorkflow(instanceId, workflowId);
          } catch (e) {
            console.error(`Failed to fetch workflow ${workflowId}`, e);
            return null;
          }
        }}
      />
    </div>
  );
}

// ─── App (roteamento de autenticação) ─────────────────────────────────────────
export default function App() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0c29' }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return <Dashboard />;
}
