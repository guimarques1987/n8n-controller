import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, Search } from 'lucide-react';
import { Workflow } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: Record<string, any>;
  onSaveConfig: (newConfig: any) => void;
  workflows1: Workflow[];
  workflows2: Workflow[];
  fetchWorkflowDetails: (instanceId: string, workflowId: string) => Promise<Workflow | null>;
}

export default function SettingsModal({ isOpen, onClose, config, onSaveConfig, workflows1, workflows2, fetchWorkflowDetails }: SettingsModalProps) {
  const [localConfig, setLocalConfig] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'templates'>('general');
  const [workflowDetails, setWorkflowDetails] = useState<Record<string, Workflow>>({});
  const [nodeSearch, setNodeSearch] = useState<Record<string, string>>({});
  const [workflowSearch, setWorkflowSearch] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const defaults = {
        '1': { baseUrl: '', apiKey: '', webhookUrl: '', templates: {} },
        '2': { baseUrl: '', apiKey: '', webhookUrl: '', templates: {} }
      };

      const newConfig = {
        '1': { ...defaults['1'], ...(config?.['1'] || {}) },
        '2': { ...defaults['2'], ...(config?.['2'] || {}) }
      };

      setLocalConfig(newConfig);
      setNodeSearch({}); // Reset search on open
      setWorkflowSearch({});

      // Fetch details for existing templates
      try {
        ['1', '2'].forEach(instanceId => {
          let templates = newConfig[instanceId]?.templates || {};
          if (Array.isArray(templates)) templates = {};
          
          Object.values(templates).forEach((t: any) => {
            if (t && t.id && !workflowDetails[t.id]) {
              loadWorkflowDetails(instanceId, t.id);
            }
          });
        });
      } catch (e) {
        console.error("Error initializing templates", e);
      }
    }
  }, [isOpen, config]);

  const loadWorkflowDetails = async (instanceId: string, workflowId: string) => {
    if (!workflowId) return;
    try {
      const data = await fetchWorkflowDetails(instanceId, workflowId);
      if (data) {
        setWorkflowDetails(prev => ({ ...prev, [workflowId]: data }));
      }
    } catch (error) {
      console.error("Error loading workflow details:", error);
    }
  };

  const handleSave = () => {
    if (localConfig) {
      onSaveConfig(localConfig);
    }
    onClose();
  };

  const updateInstanceConfig = (id: string, field: string, value: string) => {
    setLocalConfig((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        [id]: {
          ...(prev[id] || {}),
          [field]: value
        }
      };
    });
  };

  const updateTemplate = (instanceId: string, templateKey: string, field: string, value: any) => {
    setLocalConfig((prev: any) => {
      if (!prev) return prev;
      let tMap = prev[instanceId]?.templates || {};
      if (Array.isArray(tMap)) tMap = {};
      const newTemplates = { ...tMap };

      newTemplates[templateKey] = { ...(newTemplates[templateKey] || {}), [field]: value };

      if (field === 'id') {
        const workflows = instanceId === '1' ? workflows1 : workflows2;
        const wf = (workflows || []).find(w => w.id === value);
        if (wf) {
          newTemplates[templateKey].name = wf.name;
          if (!workflowDetails[value]) {
            loadWorkflowDetails(instanceId, value);
          }
        }
      }

      return {
        ...prev,
        [instanceId]: {
          ...(prev[instanceId] || {}),
          templates: newTemplates
        }
      };
    });
  };

  const toggleEditableNode = (instanceId: string, templateKey: string, nodeName: string) => {
    setLocalConfig((prev: any) => {
      if (!prev) return prev;
      const templates = { ...(prev[instanceId]?.templates || {}) };
      if (!templates[templateKey]) {
        templates[templateKey] = { id: '', name: '', editableNodes: [] };
      }

      const currentNodes = templates[templateKey].editableNodes || [];

      let newNodes;
      if (currentNodes.includes(nodeName)) {
        newNodes = currentNodes.filter((n: string) => n !== nodeName);
      } else {
        newNodes = [...currentNodes, nodeName];
      }

      templates[templateKey] = { ...templates[templateKey], editableNodes: newNodes };

      return {
        ...prev,
        [instanceId]: {
          ...(prev[instanceId] || {}),
          templates
        }
      };
    });
  };

  // Extrai parâmetros editáveis de um nó (mesma lógica do CreateWorkflowModal)
  const getNodeEditableParams = (node: any): { path: string; label: string; value: any }[] => {
    const editables: { path: string; label: string; value: any }[] = [];
    const targetKeys = ['value', 'text', 'column', 'property', 'key', 'expression', 'httpmethod', 'path', 'url', 'method', 'resource'];
    const labelMap: Record<string, string> = {
      'value': 'Valor', 'text': 'Texto', 'column': 'Coluna / Tabela',
      'property': 'Propriedade', 'key': 'Chave', 'expression': 'Expressão',
      'httpmethod': 'Método HTTP', 'path': 'Caminho (Path)', 'url': 'URL',
      'method': 'Método', 'resource': 'Recurso'
    };
    const findDeep = (obj: any, path: string = '') => {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, val] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        if (targetKeys.includes(key.toLowerCase()) && (typeof val === 'string' || typeof val === 'number')) {
          editables.push({ path: fullPath, label: labelMap[key.toLowerCase()] || key, value: val });
        }
        if (path.split('.').length < 4) findDeep(val, fullPath);
      }
    };
    findDeep(node.parameters || {});
    return editables;
  };

  // Atualiza configuração de um parâmetro específico de um nó
  const updateNodeParamConfig = (instanceId: string, templateKey: string, nodeName: string, paramPath: string, field: 'enabled' | 'label', value: any) => {
    setLocalConfig((prev: any) => {
      if (!prev) return prev;
      const templates = { ...(prev[instanceId]?.templates || {}) };
      const t = { ...(templates[templateKey] || {}) };
      const nodeParamConfig = { ...(t.nodeParamConfig || {}) };
      nodeParamConfig[nodeName] = {
        ...(nodeParamConfig[nodeName] || {}),
        [paramPath]: {
          ...(nodeParamConfig[nodeName]?.[paramPath] || { enabled: true, label: '' }),
          [field]: value
        }
      };
      t.nodeParamConfig = nodeParamConfig;
      templates[templateKey] = t;
      return { ...prev, [instanceId]: { ...prev[instanceId], templates } };
    });
  };

  const getWorkflowNodes = (instanceId: string, workflowId: string) => {
    if (workflowDetails[workflowId]) {
      return workflowDetails[workflowId].nodes || [];
    }
    const workflows = instanceId === '1' ? workflows1 : workflows2;
    const wf = (workflows || []).find(w => w.id === workflowId);
    return wf?.nodes || [];
  };

  const handleNodeSearch = (instanceId: string, templateKey: string, value: string) => {
    setNodeSearch(prev => ({
      ...prev,
      [`${instanceId}-${templateKey}`]: value
    }));
  };

  const handleWorkflowSearch = (instanceId: string, templateKey: string, value: string) => {
    setWorkflowSearch(prev => ({
      ...prev,
      [`${instanceId}-${templateKey}`]: value
    }));
  };

  const getFilteredNodes = (instanceId: string, templateId: string, templateKey: string) => {
    const nodes = getWorkflowNodes(instanceId, templateId);
    const searchTerm = nodeSearch[`${instanceId}-${templateKey}`]?.toLowerCase() || '';

    if (!searchTerm) return nodes;

    return nodes.filter((node: any) =>
      (node.name && node.name.toLowerCase().includes(searchTerm)) ||
      (node.type && node.type.toLowerCase().includes(searchTerm))
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-4 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Configurações
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-4 sm:px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('general')}
              className={`${activeTab === 'general' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Geral
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`${activeTab === 'templates' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Modelos Padrão
            </button>
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!localConfig ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <>
              {activeTab === 'general' && (
                <div className="space-y-6">
                  {/* System 1 */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
                      <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                      Robô Delivery
                    </h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">URL Base</label>
                        <input
                          type="text"
                          value={localConfig['1']?.baseUrl || ''}
                          onChange={(e) => updateInstanceConfig('1', 'baseUrl', e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Chave API (API Key)</label>
                        <input
                          type="password"
                          value={localConfig['1']?.apiKey || ''}
                          onChange={(e) => updateInstanceConfig('1', 'apiKey', e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          placeholder="Digite a nova chave para atualizar"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">URL dos Webhooks</label>
                        <input
                          type="text"
                          value={localConfig['1']?.webhookUrl || ''}
                          onChange={(e) => updateInstanceConfig('1', 'webhookUrl', e.target.value)}
                          placeholder="Ex: https://seu-n8n.com (deixe vazio para usar a URL Base)"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* System 2 */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
                      <span className="w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
                      Robô de Status
                    </h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">URL Base</label>
                        <input
                          type="text"
                          value={localConfig['2']?.baseUrl || ''}
                          onChange={(e) => updateInstanceConfig('2', 'baseUrl', e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Chave API (API Key)</label>
                        <input
                          type="password"
                          value={localConfig['2']?.apiKey || ''}
                          onChange={(e) => updateInstanceConfig('2', 'apiKey', e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          placeholder="Digite a nova chave para atualizar"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">URL dos Webhooks</label>
                        <input
                          type="text"
                          value={localConfig['2']?.webhookUrl || ''}
                          onChange={(e) => updateInstanceConfig('2', 'webhookUrl', e.target.value)}
                          placeholder="Ex: https://criadordigital-n8n-webhook.zy3snc.easypanel.host"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'templates' && (
                <div className="space-y-8">
                  {/* ─── Instância 1: Robô Delivery — 3 Modelos de Atendimento + Complementares ─── */}
                  <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-200">
                    <h4 className="text-lg font-bold text-gray-900 flex items-center mb-6">
                      <span className="w-4 h-4 rounded-full mr-3 bg-blue-500 shadow-sm border border-blue-600"></span>
                      Modelos de Fluxo - Instância Delivery (1)
                    </h4>

                    <div className="grid grid-cols-1 gap-6">
                      <TemplateConfigurator
                        title="1. Delivery — Modelo Uazapi"
                        templateKey="delivery_uazapi"
                        instanceId="1"
                        config={localConfig}
                        updateTemplate={updateTemplate}
                        workflows={workflows1}
                        workflowSearch={workflowSearch}
                        handleWorkflowSearch={handleWorkflowSearch}
                        nodeSearch={nodeSearch}
                        handleNodeSearch={handleNodeSearch}
                        getFilteredNodes={getFilteredNodes}
                        toggleEditableNode={toggleEditableNode}
                        workflowDetails={workflowDetails}
                        getNodeEditableParams={getNodeEditableParams}
                        updateNodeParamConfig={updateNodeParamConfig}
                        setLocalConfig={setLocalConfig}
                      />

                      <TemplateConfigurator
                        title="2. Delivery — Modelo YCloude"
                        templateKey="delivery_ycloud"
                        instanceId="1"
                        config={localConfig}
                        updateTemplate={updateTemplate}
                        workflows={workflows1}
                        workflowSearch={workflowSearch}
                        handleWorkflowSearch={handleWorkflowSearch}
                        nodeSearch={nodeSearch}
                        handleNodeSearch={handleNodeSearch}
                        getFilteredNodes={getFilteredNodes}
                        toggleEditableNode={toggleEditableNode}
                        workflowDetails={workflowDetails}
                        getNodeEditableParams={getNodeEditableParams}
                        updateNodeParamConfig={updateNodeParamConfig}
                        setLocalConfig={setLocalConfig}
                      />

                      <TemplateConfigurator
                        title="3. Delivery — Modelo API Oficial"
                        templateKey="delivery_oficial"
                        instanceId="1"
                        config={localConfig}
                        updateTemplate={updateTemplate}
                        workflows={workflows1}
                        workflowSearch={workflowSearch}
                        handleWorkflowSearch={handleWorkflowSearch}
                        nodeSearch={nodeSearch}
                        handleNodeSearch={handleNodeSearch}
                        getFilteredNodes={getFilteredNodes}
                        toggleEditableNode={toggleEditableNode}
                        workflowDetails={workflowDetails}
                        getNodeEditableParams={getNodeEditableParams}
                        updateNodeParamConfig={updateNodeParamConfig}
                        setLocalConfig={setLocalConfig}
                      />

                      <TemplateConfigurator
                        title="4. Atendimento Presencial"
                        templateKey="presencial"
                        instanceId="1"
                        config={localConfig}
                        updateTemplate={updateTemplate}
                        workflows={workflows1}
                        workflowSearch={workflowSearch}
                        handleWorkflowSearch={handleWorkflowSearch}
                        nodeSearch={nodeSearch}
                        handleNodeSearch={handleNodeSearch}
                        getFilteredNodes={getFilteredNodes}
                        toggleEditableNode={toggleEditableNode}
                        workflowDetails={workflowDetails}
                        getNodeEditableParams={getNodeEditableParams}
                        updateNodeParamConfig={updateNodeParamConfig}
                        setLocalConfig={setLocalConfig}
                      />

                      <TemplateConfigurator
                        title="5. Recuperador de Carrinho"
                        templateKey="recuperador"
                        instanceId="1"
                        config={localConfig}
                        updateTemplate={updateTemplate}
                        workflows={workflows1}
                        workflowSearch={workflowSearch}
                        handleWorkflowSearch={handleWorkflowSearch}
                        nodeSearch={nodeSearch}
                        handleNodeSearch={handleNodeSearch}
                        getFilteredNodes={getFilteredNodes}
                        toggleEditableNode={toggleEditableNode}
                        workflowDetails={workflowDetails}
                        getNodeEditableParams={getNodeEditableParams}
                        updateNodeParamConfig={updateNodeParamConfig}
                        setLocalConfig={setLocalConfig}
                      />

                      <TemplateConfigurator
                        title="6. Fluxo de Lembrete"
                        templateKey="lembrete"
                        instanceId="1"
                        config={localConfig}
                        updateTemplate={updateTemplate}
                        workflows={workflows1}
                        workflowSearch={workflowSearch}
                        handleWorkflowSearch={handleWorkflowSearch}
                        nodeSearch={nodeSearch}
                        handleNodeSearch={handleNodeSearch}
                        getFilteredNodes={getFilteredNodes}
                        toggleEditableNode={toggleEditableNode}
                        workflowDetails={workflowDetails}
                        getNodeEditableParams={getNodeEditableParams}
                        updateNodeParamConfig={updateNodeParamConfig}
                        setLocalConfig={setLocalConfig}
                      />
                    </div>
                  </div>

                  {/* ─── Instância 2: Robô de Status — 3 Modelos de Notificação ─── */}
                  <div className="bg-purple-50/50 p-5 rounded-xl border border-purple-200 mt-8">
                    <h4 className="text-lg font-bold text-gray-900 flex items-center mb-6">
                      <span className="w-4 h-4 rounded-full mr-3 bg-purple-500 shadow-sm border border-purple-600"></span>
                      Modelos de Fluxo - Instância Status (2)
                    </h4>

                    <div className="grid grid-cols-1 gap-6">
                      <TemplateConfigurator
                        title="1. Status — Modelo Uazapi"
                        templateKey="status_uazapi"
                        instanceId="2"
                        config={localConfig}
                        updateTemplate={updateTemplate}
                        workflows={workflows2}
                        workflowSearch={workflowSearch}
                        handleWorkflowSearch={handleWorkflowSearch}
                        nodeSearch={nodeSearch}
                        handleNodeSearch={handleNodeSearch}
                        getFilteredNodes={getFilteredNodes}
                        toggleEditableNode={toggleEditableNode}
                        workflowDetails={workflowDetails}
                        getNodeEditableParams={getNodeEditableParams}
                        updateNodeParamConfig={updateNodeParamConfig}
                        setLocalConfig={setLocalConfig}
                      />

                      <TemplateConfigurator
                        title="2. Status — Modelo YCloude"
                        templateKey="status_ycloud"
                        instanceId="2"
                        config={localConfig}
                        updateTemplate={updateTemplate}
                        workflows={workflows2}
                        workflowSearch={workflowSearch}
                        handleWorkflowSearch={handleWorkflowSearch}
                        nodeSearch={nodeSearch}
                        handleNodeSearch={handleNodeSearch}
                        getFilteredNodes={getFilteredNodes}
                        toggleEditableNode={toggleEditableNode}
                        workflowDetails={workflowDetails}
                        getNodeEditableParams={getNodeEditableParams}
                        updateNodeParamConfig={updateNodeParamConfig}
                        setLocalConfig={setLocalConfig}
                      />

                      <TemplateConfigurator
                        title="3. Status — Modelo API Oficial"
                        templateKey="status_oficial"
                        instanceId="2"
                        config={localConfig}
                        updateTemplate={updateTemplate}
                        workflows={workflows2}
                        workflowSearch={workflowSearch}
                        handleWorkflowSearch={handleWorkflowSearch}
                        nodeSearch={nodeSearch}
                        handleNodeSearch={handleNodeSearch}
                        getFilteredNodes={getFilteredNodes}
                        toggleEditableNode={toggleEditableNode}
                        workflowDetails={workflowDetails}
                        getNodeEditableParams={getNodeEditableParams}
                        updateNodeParamConfig={updateNodeParamConfig}
                        setLocalConfig={setLocalConfig}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-gray-50 px-4 py-3 sm:px-6 flex flex-row-reverse border-t border-gray-200">
          <button
            type="button"
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
            onClick={handleSave}
          >
            <Save className="h-4 w-4 mr-2" />
            Salvar Tudo
          </button>
          <button
            type="button"
            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// Componente utilitário para renderizar as configurações de um modelo específico
function TemplateConfigurator({
  title,
  templateKey,
  instanceId,
  config,
  updateTemplate,
  workflows,
  workflowSearch,
  handleWorkflowSearch,
  nodeSearch,
  handleNodeSearch,
  getFilteredNodes,
  toggleEditableNode,
  workflowDetails,
  getNodeEditableParams,
  updateNodeParamConfig,
  setLocalConfig
}: any) {

  const templates = config[instanceId]?.templates || {};
  let template = templates[templateKey];
  if (!template && templateKey === 'delivery_uazapi') template = templates['delivery'] || templates['modeloUazpi'];
  if (!template && templateKey === 'status_uazapi') template = templates['status'] || templates['modeloStatusUazapi'];
  if (!template) template = { id: '', label: '', editableNodes: [] };

  return (
    <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
      <div className="mb-4">
        <h5 className="font-bold text-gray-800 text-sm">{title}</h5>
        <p className="text-xs text-gray-500 mt-0.5">Selecione o fluxo base da instância {instanceId} para operar como este template.</p>
      </div>

      <div className="w-full">
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Nome do Modelo <span className="text-indigo-500">(Sugestão no Criação)</span>
        </label>
        <input
          type="text"
          value={template.label || ''}
          onChange={(e) => updateTemplate(instanceId, templateKey, 'label', e.target.value)}
          placeholder={`Ex: ${templateKey.charAt(0).toUpperCase() + templateKey.slice(1)} Padrão...`}
          className="block w-full border border-indigo-200 bg-indigo-50 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium mb-4"
        />

        <label className="block text-xs font-medium text-gray-500 mb-1">Selecionar Fluxo Base ({instanceId})</label>
        <div className="relative mb-2">
          <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
            <Search className="h-3 w-3 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-8 pr-3 py-1 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-xs"
            placeholder="Pesquisar fluxos por nome..."
            value={workflowSearch[`${instanceId}-${templateKey}`] || ''}
            onChange={(e) => handleWorkflowSearch(instanceId, templateKey, e.target.value)}
          />
        </div>

        <select
          value={template.id || ''}
          onChange={(e) => updateTemplate(instanceId, templateKey, 'id', e.target.value)}
          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        >
          <option value="">Selecione um fluxo...</option>
          {(workflows || [])
            .filter((w: any) => {
              const searchTerm = workflowSearch[`${instanceId}-${templateKey}`]?.toLowerCase() || '';
              return !searchTerm || w.name.toLowerCase().includes(searchTerm);
            })
            .map((w: any) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
        </select>
      </div>

      {template.id && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="block text-xs font-bold text-gray-700 mb-2">Nós Editáveis Configurados</label>

          <div className="relative mb-2">
            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
              <Search className="h-3 w-3 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-8 pr-3 py-1 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-gray-300 sm:text-xs"
              placeholder="Buscar nós..."
              value={nodeSearch[`${instanceId}-${templateKey}`] || ''}
              onChange={(e) => handleNodeSearch(instanceId, templateKey, e.target.value)}
            />
          </div>

          <div className="max-h-52 overflow-y-auto border rounded bg-gray-50 p-2 space-y-1 custom-scrollbar">
            {getFilteredNodes(instanceId, template.id, templateKey).length > 0 ? (
              getFilteredNodes(instanceId, template.id, templateKey).map((node: any) => {
                const isChecked = (template.editableNodes || []).includes(node.name);
                const nodeLabel = (template.nodeLabels || {})[node.name] || '';
                return (
                  <div key={node.id || node.name} className={`rounded p-1.5 transition-colors ${isChecked ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-100'}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleEditableNode(instanceId, templateKey, node.name)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300 flex-shrink-0"
                      />
                      <span className={`text-xs truncate flex-1 ${isChecked ? 'text-indigo-800 font-semibold' : 'text-gray-600'}`} title={node.name}>{node.name}</span>
                    </div>
                    {isChecked && (() => {
                      const wfDetail = workflowDetails[template.id];
                      const nodeObj = wfDetail?.nodes?.find((n: any) => n.name === node.name);
                      const params = nodeObj ? getNodeEditableParams(nodeObj) : [];
                      const nodeParamCfg = (template.nodeParamConfig || {})[node.name] || {};

                      return (
                        <div className="mt-2 ml-6 space-y-2">
                          <input
                            type="text"
                            value={nodeLabel}
                            onChange={(e) => {
                              setLocalConfig((prev: any) => {
                                if (!prev) return prev;
                                const tMap = { ...(prev[instanceId]?.templates || {}) };
                                const t = { ...(tMap[templateKey] || {}) };
                                t.nodeLabels = { ...(t.nodeLabels || {}), [node.name]: e.target.value };
                                tMap[templateKey] = t;
                                return { ...prev, [instanceId]: { ...prev[instanceId], templates: tMap } };
                              });
                            }}
                            placeholder={`Nome do nó na tela de criação (ex: Receber Pedido)`}
                            className="w-full text-xs border border-indigo-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-indigo-700 placeholder-gray-400"
                          />

                          {params.length > 0 && (
                            <div className="border border-gray-200 rounded bg-white p-2">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Variáveis a expor</p>
                              <div className="space-y-1.5">
                                {params.map(param => {
                                  const cfg = nodeParamCfg[param.path] || { enabled: true, label: '' };
                                  const preview = String(param.value).substring(0, 25) + (String(param.value).length > 25 ? '…' : '');
                                  return (
                                    <div key={param.path} className={`rounded p-1.5 ${cfg.enabled !== false ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
                                      <div className="flex items-center gap-2 mb-1">
                                        <input
                                          type="checkbox"
                                          checked={cfg.enabled !== false}
                                          onChange={(e) => updateNodeParamConfig(instanceId, templateKey, node.name, param.path, 'enabled', e.target.checked)}
                                          className="h-3.5 w-3.5 rounded text-blue-600 border-gray-300 focus:ring-blue-500 flex-shrink-0"
                                        />
                                        <span className="text-[10px] text-gray-500 font-mono truncate">{param.label} <span className="text-gray-400 italic">({preview})</span></span>
                                      </div>
                                      {cfg.enabled !== false && (
                                        <input
                                          type="text"
                                          value={cfg.label || ''}
                                          onChange={(e) => updateNodeParamConfig(instanceId, templateKey, node.name, param.path, 'label', e.target.value)}
                                          placeholder={`Label da variável`}
                                          className="w-full text-[11px] font-bold border border-blue-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-blue-800 placeholder-gray-400 ml-5"
                                          style={{ width: 'calc(100% - 1.25rem)' }}
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {params.length === 0 && nodeObj && (
                            <p className="text-xs text-gray-400 italic">Nenhuma variável editável encontrada neste nó.</p>
                          )}
                          {!nodeObj && (
                            <p className="text-xs text-yellow-600 italic">⚠ Selecione um fluxo base válido para ver as variáveis.</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-gray-400 p-2 text-center my-4 bg-gray-50 rounded italic">Nenhum nó corresponte.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
