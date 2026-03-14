import React, { useState, useEffect } from 'react';
import {
    X,
    ChevronRight,
    ArrowLeft,
    Settings,
    HelpCircle,
    AlertCircle,
    Save,
    Rocket,
    Edit3,
    FileText,
    Type,
    Database,
    CheckCircle2,
    CheckSquare
} from 'lucide-react';
import { getWorkflow } from '../services/n8n';

interface CreateWorkflowModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreateMultiple: (payloads: any[]) => Promise<void>;
    config: any;
}

// VERSÃO 11.0 - MULTI-CRIAÇÃO BATCH
const VERSION_LABEL = "VERSÃO 11.0 (MULTI-CRIAÇÃO EM LOTE)";

// Ícones SVG personalizados
const ICON_FILE_TEXT = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
</svg>
`;

const ICON_EDIT = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
</svg>
`;

const ICON_DATABASE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
</svg>
`;

const ICON_SETTINGS = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>
`;

const Icon = ({ path, className }: { path: string, className?: string }) => (
    <div className={className} dangerouslySetInnerHTML={{ __html: path }} style={{ width: '1em', height: '1em', display: 'inline-block' }} />
);

// ─── Switch toggle ──────────────────────────────────────────────────────────── (Copiado do RobotConfigPage)
function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none', opacity: disabled ? 0.6 : 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5' }}>{label}</span>
            <div
                onClick={() => { if (!disabled) onChange(!checked); }}
                style={{
                    width: 40, height: 22, borderRadius: 99, position: 'relative',
                    background: checked ? '#4f46e5' : '#d1d5db',
                    transition: 'background 0.25s',
                    flexShrink: 0,
                }}
            >
                <div style={{
                    position: 'absolute', top: 3,
                    left: checked ? 21 : 3,
                    width: 16, height: 16, borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                    transition: 'left 0.25s',
                }} />
            </div>
        </label>
    );
}

// Definição estática dos modelos esperados
const FIXED_TEMPLATES = [
    { key: 'delivery', name: 'Delivery', instanceId: '1', color: 'text-blue-500 bg-blue-50 flex items-center justify-center p-2 rounded-lg' },
    { key: 'recuperador', name: 'Recuperador', instanceId: '1', color: 'text-indigo-500 bg-indigo-50 flex items-center justify-center p-2 rounded-lg' },
    { key: 'lembrete', name: 'Lembrete', instanceId: '1', color: 'text-emerald-500 bg-emerald-50 flex items-center justify-center p-2 rounded-lg' },
    { key: 'status', name: 'Status', instanceId: '2', color: 'text-purple-500 bg-purple-50 flex items-center justify-center p-2 rounded-lg' }
];

const CreateWorkflowModal: React.FC<CreateWorkflowModalProps> = ({
    isOpen,
    onClose,
    onCreateMultiple,
    config
}) => {
    const [globalNamePrefix, setGlobalNamePrefix] = useState('');

    // Estado para armazenar quais modelos foram selecionados na UI
    const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({
        delivery: false,
        recuperador: false,
        lembrete: false,
        status: false
    });

    // Estado para armazenar os dados carregados das instâncias remotas (getWorkflow)
    const [fetchedData, setFetchedData] = useState<Record<string, any>>({});

    // Estado para armazenar as edições locais nos workflows (clonados)
    const [editedWorkflows, setEditedWorkflows] = useState<Record<string, any>>({});

    // Controle de navegação (expandir os nós de um modelo específico)
    const [activeExpandedKey, setActiveExpandedKey] = useState<string | null>(null);
    const [activeNodeIndex, setActiveNodeIndex] = useState<number | null>(null);
    const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
    const [isBatchMode, setIsBatchMode] = useState(false);

    const [loading, setLoading] = useState(false);
    const [loadingFetch, setLoadingFetch] = useState<Record<string, boolean>>({});
    const [errors, setErrors] = useState<string[]>([]);

    // Logar apenas ao montar
    useEffect(() => {
        if (isOpen) {
            resetState();
        }
    }, [isOpen]);

    const resetState = () => {
        setGlobalNamePrefix('');
        setSelectedKeys({ delivery: false, recuperador: false, lembrete: false, status: false });
        setFetchedData({});
        setEditedWorkflows({});
        setActiveExpandedKey(null);
        setActiveNodeIndex(null);
        setSelectedNodes(new Set());
        setIsBatchMode(false);
        setErrors([]);
    };

    const getEditableParams = (node: any) => {
        const editables: { path: string, label: string, value: any }[] = [];
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

    // Carrega os dados remotamente da base original (N8N) quando o usuário "ticar" uma checkbox
    const handleToggleTemplate = async (meta: typeof FIXED_TEMPLATES[0]) => {
        const isCurrentlySelected = selectedKeys[meta.key];
        const newSelectedState = !isCurrentlySelected;

        // Atualiza checkbox
        setSelectedKeys(prev => ({ ...prev, [meta.key]: newSelectedState }));

        // Se ativou e ainda não baixamos, baixa o template agora
        if (newSelectedState && !fetchedData[meta.key]) {
            // Suporte Legado e Estrutura de Array (Backward Compatibility)
            let rawTemplates = config?.[meta.instanceId]?.templates;
            let templateConfig = null;

            if (Array.isArray(rawTemplates)) {
                // Se for Array legado, buscar pelo nome antigo
                if (meta.key === 'delivery') templateConfig = rawTemplates.find(t => t.id === 'modeloUazpi' || t.name === 'Robô Delivery');
                if (meta.key === 'recuperador') templateConfig = rawTemplates.find(t => t.id === 'modeloRecuperador' || t.name === 'Recuperador de Carrinho');
                if (meta.key === 'lembrete') templateConfig = rawTemplates.find(t => t.id === 'modeloLembrete' || t.name === 'Fluxo de Lembrete');
                if (meta.key === 'status') templateConfig = rawTemplates.find(t => t.id === 'modeloStatusUazapi' || t.name === 'Robô de Status');
            } else {
                // É um objeto
                templateConfig = rawTemplates?.[meta.key];
                if (!templateConfig) {
                    if (meta.key === 'delivery') templateConfig = rawTemplates?.modeloUazpi;
                    if (meta.key === 'status') templateConfig = rawTemplates?.modeloStatusUazapi;
                }
            }

            if (!templateConfig || !templateConfig.id) {
                setErrors(prev => [...prev, `O Modelo ${meta.name} não possui um fluxo base configurado nos Ajustes.`]);
                setSelectedKeys(prev => ({ ...prev, [meta.key]: false }));
                return;
            }

            setLoadingFetch(prev => ({ ...prev, [meta.key]: true }));
            try {
                const rawWorkflowData = await getWorkflow(meta.instanceId, templateConfig.id);

                // Guardamos o original
                setFetchedData(prev => ({ ...prev, [meta.key]: rawWorkflowData }));

                // E iniciamos uma cópia local para edição, preservando todos os nós
                setEditedWorkflows(prev => ({
                    ...prev,
                    [meta.key]: JSON.parse(JSON.stringify(rawWorkflowData)) // Deep copy
                }));

            } catch (err: any) {
                console.error(`Erro buscando ${meta.key}:`, err);
                setErrors(prev => [...prev, `Falha ao carregar o modelo ${meta.name} do n8n (Instância ${meta.instanceId}).`]);
                setSelectedKeys(prev => ({ ...prev, [meta.key]: false })); // Reverte o tick se falhar
            } finally {
                setLoadingFetch(prev => ({ ...prev, [meta.key]: false }));
            }
        }

        // Se a aba dele estava ativa e a gente desativou, fechamos ela
        if (!newSelectedState && activeExpandedKey === meta.key) {
            setActiveExpandedKey(null);
            setActiveNodeIndex(null);
        }
    };

    // Atualiza um parâmetro dentro da cópia local do workflow em edição
    const updateNodeValue = (templateKey: string, nodeIndex: number, path: string, newValue: string) => {
        setEditedWorkflows(prev => {
            const newWorkflows = { ...prev };
            const currentWorkflow = newWorkflows[templateKey];
            if (!currentWorkflow) return prev;

            const updateSingleNode = (wf: any, idx: number) => {
                const node = wf.nodes[idx];
                if (!node) return;
                const keys = path.split('.');
                let currentObj = node.parameters;
                for (let i = 0; i < keys.length - 1; i++) {
                    currentObj = currentObj[keys[i]] = currentObj[keys[i]] || {};
                }
                const lastKey = keys[keys.length - 1];
                const val = (isNaN(Number(newValue)) || newValue === '') ? newValue : Number(newValue);
                currentObj[lastKey] = val;
            };

            // Atualiza o nó atual
            updateSingleNode(currentWorkflow, nodeIndex);

            // Se modo batch estiver ativo, replica para outros nós selecionados que tenham esse caminho
            if (isBatchMode) {
                const currentNodeName = currentWorkflow.nodes[nodeIndex].name;
                currentWorkflow.nodes.forEach((n: any, idx: number) => {
                    if (idx !== nodeIndex && selectedNodes.has(n.name)) {
                        // Verifica se o nó tem esse parâmetro (simplificado: tenta atualizar)
                        updateSingleNode(currentWorkflow, idx);
                    }
                });
            }

            return newWorkflows;
        });
    };

    const toggleNodeSelection = (nodeName: string) => {
        setSelectedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeName)) next.delete(nodeName);
            else next.add(nodeName);
            return next;
        });
    };

    const validateSubmits = () => {
        const listErrors: string[] = [];
        if (!globalNamePrefix.trim()) {
            listErrors.push("Defina um Nome Base (Prefixo) para esses fluxos.");
        }

        const selectedActiveCount = Object.keys(selectedKeys).filter(k => selectedKeys[k]).length;
        if (selectedActiveCount === 0) {
            listErrors.push("Selecione pelo menos um modelo (checkbox) para criar.");
        }

        setErrors(listErrors);
        return listErrors.length === 0;
    };

    const handleBatchSubmit = async () => {
        if (!validateSubmits()) return;

        setLoading(true);
        setErrors([]);

        // Preparamos o payload de lotado
        const payloads: any[] = [];

        for (const meta of FIXED_TEMPLATES) {
            if (!selectedKeys[meta.key]) continue;

            const localEdits = editedWorkflows[meta.key];
            if (!localEdits) continue; // Safety check

            // Personaliza o nome da cópia
            const templateConfigLabel = config?.[meta.instanceId]?.templates?.[meta.key]?.label || meta.name;
            const finalFlowName = `${globalNamePrefix.trim()} - ${templateConfigLabel}`;

            payloads.push({
                ...localEdits, // contém o id do nó etc
                name: finalFlowName,
                // Custom tracker fields that App.tsx will need pra redirecionar
                _targetInstanceId: meta.instanceId,
                _templateKey: meta.key
            });
        }

        try {
            await onCreateMultiple(payloads);
            onClose(); // Fechamos o modal ao obter sucesso completo!
        } catch (e: any) {
            console.error(e);
            setErrors([e.message || "Falha grave durante o lote. O componente pai deve tratar parciais."]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-gray-100">

                <div className="p-6 sm:p-8 border-b border-gray-50 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tighter flex items-center gap-3">
                            CRIADOR EM LOTE DE FLUXOS
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-none">
                                {VERSION_LABEL}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 flex items-center justify-center bg-white shadow-sm border border-gray-100">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col sm:flex-row relative">

                    {/* PAINEL ESQUERDO: SELEÇÃO GERAL DE MODELOS */}
                    <div className={`flex flex-col border-r border-gray-100 p-6 overflow-y-auto custom-scrollbar transition-all duration-300
             ${activeExpandedKey ? 'w-full sm:w-96 hidden sm:flex shrink-0 bg-slate-50/50' : 'w-full'}
          `}>
                        {errors.length > 0 && (
                            <div className="mb-6 bg-red-50 border-2 border-red-100 p-4 rounded-2xl animate-in fade-in space-y-2">
                                <div className="flex items-start gap-2 text-red-700">
                                    <AlertCircle className="shrink-0 mt-0.5" size={16} />
                                    <span className="text-sm font-black uppercase tracking-tighter">Erros Encontrados:</span>
                                </div>
                                <ul className="list-disc pl-8 space-y-1">
                                    {errors.map((err, i) => (
                                        <li key={i} className="text-xs font-semibold text-red-600 leading-tight">{err}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="space-y-4 mb-8">
                            <label className="text-[11px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                <Icon path={ICON_FILE_TEXT} className="text-indigo-300" /> 1. NOME BASE DOS FLUXOS GERAIS
                            </label>
                            <input
                                type="text"
                                placeholder="Ex: Lanchonete X (Avenida Y)"
                                className="w-full bg-white border-2 border-indigo-100 p-4 rounded-xl text-base font-bold text-gray-800 placeholder:text-gray-300 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all outline-none"
                                value={globalNamePrefix}
                                onChange={(e) => setGlobalNamePrefix(e.target.value)}
                            />
                            <p className="text-[10px] font-semibold text-gray-400 ml-1">Ex: "Lanchonete X - Delivery", "Lanchonete X - Recuperador"...</p>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                                <CheckSquare className="w-4 h-4" /> 2. QUAIS FLUXOS DESEJA IMPORTAR?
                            </label>

                            <div className="space-y-2.5">
                                {FIXED_TEMPLATES.map(meta => {
                                    const isChecked = selectedKeys[meta.key];
                                    const isFetching = loadingFetch[meta.key];
                                    const isReady = fetchedData[meta.key];
                                    let rawTemplates = config?.[meta.instanceId]?.templates;
                                    let templateConfig = null;

                                    if (Array.isArray(rawTemplates)) {
                                        if (meta.key === 'delivery') templateConfig = rawTemplates.find(t => t.id === 'modeloUazpi' || t.name === 'Robô Delivery');
                                        if (meta.key === 'recuperador') templateConfig = rawTemplates.find(t => t.id === 'modeloRecuperador' || t.name === 'Recuperador de Carrinho');
                                        if (meta.key === 'lembrete') templateConfig = rawTemplates.find(t => t.id === 'modeloLembrete' || t.name === 'Fluxo de Lembrete');
                                        if (meta.key === 'status') templateConfig = rawTemplates.find(t => t.id === 'modeloStatusUazapi' || t.name === 'Robô de Status');
                                    } else {
                                        templateConfig = rawTemplates?.[meta.key];
                                        if (!templateConfig) {
                                            if (meta.key === 'delivery') templateConfig = rawTemplates?.modeloUazpi;
                                            if (meta.key === 'status') templateConfig = rawTemplates?.modeloStatusUazapi;
                                        }
                                    }

                                    const hasValidBase = !!(templateConfig?.id);
                                    const isExpanded = activeExpandedKey === meta.key;

                                    return (
                                        <div
                                            key={meta.key}
                                            className={`relative border-2 rounded-xl transition-all duration-300 overflow-hidden
                        ${isChecked ? 'border-indigo-500 bg-white shadow-md' : 'border-gray-100 bg-white hover:border-gray-200'}
                        ${!hasValidBase ? 'opacity-50 grayscale cursor-not-allowed' : ''}
                        ${isExpanded ? 'ring-4 ring-indigo-100' : ''}
                      `}
                                        >
                                            <div
                                                className={`flex items-center gap-3 p-4 ${hasValidBase ? 'cursor-pointer' : ''}`}
                                                onClick={() => hasValidBase && handleToggleTemplate(meta)}
                                            >
                                                <div className={`w-6 h-6 rounded-[6px] border-2 flex items-center justify-center transition-all shrink-0
                            ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-gray-50'}
                         `}>
                                                    {isChecked && <CheckCircle2 className="w-4 h-4 text-white stroke-[3px]" />}
                                                </div>

                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className={meta.color}>
                                                            <Icon path={ICON_DATABASE} className="w-3 h-3" />
                                                        </div>
                                                        <h4 className={`font-bold text-sm tracking-tight ${isChecked ? 'text-gray-900' : 'text-gray-600'}`}>
                                                            {templateConfig?.label || meta.name}
                                                        </h4>
                                                    </div>
                                                    <p className="text-[9px] text-gray-400 font-bold tracking-wider mt-1 ml-[40px] uppercase">
                                                        Instância N8N: {meta.instanceId} {isFetching && '— BAIXANDO...'}
                                                        {!hasValidBase && ' — (NÃO CONFIGURADO)'}
                                                    </p>
                                                </div>

                                                {isFetching && (
                                                    <div className="animate-spin h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full shrink-0" />
                                                )}
                                            </div>

                                            {/* Botão para Configurar Variáveis se estiver marcado */}
                                            {isChecked && isReady && (
                                                <div className="px-4 pb-4 pt-0">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveExpandedKey(isExpanded ? null : meta.key);
                                                            setActiveNodeIndex(null);
                                                        }}
                                                        className={`w-full py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex justify-between px-4 items-center
                              ${isExpanded
                                                                ? 'bg-indigo-100 text-indigo-700'
                                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                            }
                            `}
                                                    >
                                                        <span>{isExpanded ? 'Esconder Variáveis' : 'Preencher Variáveis Específicas'}</span>
                                                        <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                                    </button>
                                                </div>
                                            )}

                                            {!hasValidBase && (
                                                <div className="absolute inset-0 z-10 bg-white/50" title="Não configurado nos Ajustes do Sistema" />
                                            )}
                                        </div>
                                    );
                                })}


                            </div>
                        </div>

                        <div className="mt-auto pt-8">
                            <button
                                onClick={handleBatchSubmit}
                                disabled={loading}
                                className={`w-full py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all
                    ${loading
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-b-4 border-gray-300'
                                        : 'bg-emerald-600 text-white shadow-emerald-500/30 hover:bg-emerald-500 active:translate-y-[2px] active:shadow-none border-b-4 border-emerald-700 hover:border-emerald-600'}
                  `}
                            >
                                {loading
                                    ? <div className="animate-spin h-5 w-5 border-4 border-white border-t-transparent rounded-full" />
                                    : <><Rocket size={20} className="animate-pulse" /> CRIAR OS {(Object.values(selectedKeys).filter(Boolean).length)} LIGADOS</>
                                }
                            </button>
                        </div>
                    </div>

                    {/* PAINEL DIREITO: PREENCHIMENTO DE VARIÁVEIS (Só aparece se um template estiver aberto -> activeExpandedKey) */}
                    {activeExpandedKey ? (
                        <div className="flex-1 bg-white p-6 sm:p-8 overflow-y-auto custom-scrollbar animate-in slide-in-from-right-8 duration-300 bg-gradient-to-br from-indigo-50/20 to-transparent">

                            <div className="flex items-center justify-between mb-8 border-b border-indigo-100 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-3 rounded-lg text-white ${FIXED_TEMPLATES.find(f => f.key === activeExpandedKey)?.color?.split(' ')[1]?.replace('50', '500') || 'bg-indigo-500'}`}>
                                        <Icon path={ICON_DATABASE} className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900 tracking-tighter">Variáveis Específicas</h3>
                                        <p className="text-xs font-bold text-gray-400 tracking-widest uppercase">
                                            Para fluxo: {config?.[FIXED_TEMPLATES.find(f => f.key === activeExpandedKey)?.instanceId || '']?.templates?.[activeExpandedKey]?.label || FIXED_TEMPLATES.find(f => f.key === activeExpandedKey)?.name}
                                        </p>
                                    </div>
                                </div>

                                {/* Botão fechar visão mobile */}
                                <button onClick={() => setActiveExpandedKey(null)} className="sm:hidden p-2 bg-gray-100 rounded-full text-gray-600">
                                    <X size={20} />
                                </button>
                            </div>

                            {(() => {
                                const metaInfo = FIXED_TEMPLATES.find(f => f.key === activeExpandedKey);
                                if (!metaInfo) return null;

                                const templateConfig = config[metaInfo.instanceId]?.templates?.[metaInfo.key] || {};
                                const allowedNodeNames: string[] = templateConfig.editableNodes || [];
                                const nodeLabels: Record<string, string> = templateConfig.nodeLabels || {};
                                const nodeParamConfig = templateConfig.nodeParamConfig || {};

                                const localNodes = editedWorkflows[metaInfo.key]?.nodes || [];

                                if (activeNodeIndex === null) {
                                    // VIEW LISTA DE NÓS
                                    const nodesToShow = localNodes.filter((node: any) => {
                                        const editables = getEditableParams(node);
                                        return editables.length > 0 && allowedNodeNames.includes(node.name);
                                    });

                                    if (nodesToShow.length === 0) {
                                        return (
                                            <div className="p-12 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                                                <HelpCircle size={40} className="mx-auto text-gray-300 mb-3" />
                                                <p className="text-sm font-bold text-gray-400">Nenhuma configuração manual necessária neste fluxo!</p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                            {localNodes.map((node: any, idx: number) => {
                                                const editables = getEditableParams(node);
                                                if (editables.length === 0 || !allowedNodeNames.includes(node.name)) return null;

                                                // Contagem de variaveis habilitadas
                                                let enabledCount = 0;
                                                const nConfig = nodeParamConfig[node.name];
                                                if (nConfig && Object.keys(nConfig).length > 0) {
                                                    enabledCount = editables.filter(f => nConfig[f.path]?.enabled !== false).length;
                                                } else {
                                                    enabledCount = editables.length;
                                                }

                                                // Se não tiver variáveis habilitadas para exibir, não mostra o nó.
                                                if (enabledCount === 0) return null;

                                                return (
                                                    <div key={idx} className="relative group">
                                                        <button
                                                            onClick={() => toggleNodeSelection(node.name)}
                                                            className={`absolute top-4 right-4 z-10 p-1.5 rounded-lg border-2 transition-all
                                                                ${selectedNodes.has(node.name) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-transparent hover:text-gray-300'}
                                                            `}
                                                        >
                                                            <CheckCircle2 size={14} strokeWidth={3} />
                                                        </button>

                                                        <button
                                                            onClick={() => setActiveNodeIndex(idx)}
                                                            className="text-left w-full p-5 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-400 hover:shadow-lg transition-all flex flex-col justify-between h-full"
                                                        >
                                                            <div className="flex justify-between items-start mb-4">
                                                                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                                    <Icon path={ICON_SETTINGS} className="text-lg" />
                                                                </div>
                                                                <span className="bg-gray-100 text-gray-400 text-[10px] font-black px-2 py-1 rounded">
                                                                    {enabledCount} VARIÁVEI{enabledCount > 1 ? 'S' : ''}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <h4 className="font-bold text-gray-800 text-lg leading-tight group-hover:text-indigo-600 transition-colors">
                                                                    {nodeLabels[node.name] || node.name}
                                                                </h4>
                                                                <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mt-2 w-max border-b border-gray-200 group-hover:border-indigo-200">Clique para preencher</p>
                                                            </div>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                } else {
                                    // VIEW FORMULÁRIO DO NÓ
                                    const node = localNodes[activeNodeIndex];
                                    const allEditables = getEditableParams(node);
                                    const nConfig = nodeParamConfig[node.name] || {};

                                    const editables = (Object.keys(nConfig).length > 0)
                                        ? allEditables.filter(f => nConfig[f.path]?.enabled !== false)
                                        : allEditables;

                                    return (
                                        <div className="animate-in fade-in slide-in-from-right-4 duration-300 pb-10">
                                            <button
                                                onClick={() => setActiveNodeIndex(null)}
                                                className="mb-8 py-2 px-4 border border-indigo-200 bg-indigo-50 rounded-lg text-xs font-black text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2"
                                            >
                                                <ArrowLeft size={14} /> VOLTAR AOS PASSOS
                                            </button>

                                            <div className="flex items-center justify-between mb-6">
                                                <h4 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-3">
                                                    {nodeLabels[node.name] || node.name}
                                                </h4>

                                                {selectedNodes.size > 1 && (
                                                    <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
                                                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Modo Multi-Edição</span>
                                                        <Switch checked={isBatchMode} onChange={setIsBatchMode} label="" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-6">
                                                {editables.map((field) => {
                                                    const customLabel = nConfig?.[field.path]?.label || field.label;
                                                    return (
                                                        <div key={field.path} className="space-y-2 group">
                                                            <label className="text-[11px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                                                                <Icon path={ICON_EDIT} className="w-3 h-3 text-indigo-300" /> {customLabel}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={field.value}
                                                                onChange={(e) => updateNodeValue(metaInfo.key, activeNodeIndex, field.path, e.target.value)}
                                                                className="w-full bg-slate-50 border-2 border-indigo-100 p-4 rounded-xl text-base font-bold text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 focus:bg-white transition-all outline-none"
                                                                placeholder={`Digite o ${customLabel}...`}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                }
                            })()}
                        </div>
                    ) : (
                        // ESTADO VAZIO: NENHUM TEMPLATE EXPANDIDO
                        <div className="hidden sm:flex flex-1 items-center justify-center p-8 bg-slate-50/50 relative overflow-hidden">
                            {/* Decoração de Fundo */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

                            <div className="text-center max-w-sm relative z-10">
                                <div className="w-24 h-24 bg-white shadow-xl rounded-full flex items-center justify-center mx-auto mb-6 outline outline-8 outline-white/50 relative">
                                    <Icon path={ICON_EDIT} className="w-10 h-10 text-indigo-400" />
                                    <div className="absolute -top-2 -right-2 bg-emerald-500 text-white rounded-full p-1 shadow-sm">
                                        <CheckCircle2 size={16} />
                                    </div>
                                </div>
                                <h3 className="text-2xl font-black text-gray-800 tracking-tighter mb-3">Configure os Detalhes</h3>
                                <p className="text-sm font-semibold text-gray-500 leading-relaxed">Marque as caixinhas na esquerda e então clique no botão <span className="bg-white p-1 rounded font-bold border border-gray-200 shadow-sm">"Preencher Variáveis"</span> para expandir os formulários de cada fluxo separadamente e preencher seus dados.</p>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default CreateWorkflowModal;
