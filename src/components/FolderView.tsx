import React, { useState } from 'react';
import { Folder, FolderOpen, Trash2, ExternalLink, Copy, Check, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { Workflow, Project } from '../types';

interface FolderViewProps {
    workflows: Workflow[];
    projects: Project[];
    onToggle: (id: string, active: boolean) => void;
    onDelete: (id: string) => void;
    onEdit: (workflow: Workflow) => void;
    n8nBaseUrl?: string;
    accentColor?: string;
}

export default function FolderView({ workflows, projects, onToggle, onDelete, onEdit, n8nBaseUrl, accentColor = 'blue' }: FolderViewProps) {
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(['__personal__', '__all__']));
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

    const handleCopy = (url: string) => {
        navigator.clipboard.writeText(url);
        setCopiedUrl(url);
        setTimeout(() => setCopiedUrl(null), 2000);
    };

    const toggleFolder = (id: string) => {
        setOpenFolders(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Agrupar usando __projectId/__projectName inseridos pelo servidor
    const projectMap = new Map<string, { name: string; flows: Workflow[] }>();

    workflows.forEach(w => {
        const wAny = w as any;
        const pid = wAny.__projectId || wAny.projectId || '__personal__';
        const pname = wAny.__projectName || (pid === '__personal__' ? 'Pessoal' : String(pid));
        if (!projectMap.has(pid)) projectMap.set(pid, { name: pname, flows: [] });
        projectMap.get(pid)!.flows.push(w);
    });

    // Ordenar: Pessoal primeiro, depois alfabético
    const sorted = [...projectMap.entries()].sort(([aId], [bId]) => {
        if (aId === '__personal__') return -1;
        if (bId === '__personal__') return 1;
        return projectMap.get(aId)!.name.localeCompare(projectMap.get(bId)!.name);
    });

    const showFolders = sorted.length > 1;

    const accent = {
        bg: accentColor === 'purple' ? 'bg-purple-50' : 'bg-blue-50',
        text: accentColor === 'purple' ? 'text-purple-700' : 'text-blue-700',
        icon: accentColor === 'purple' ? 'text-purple-500' : 'text-blue-500',
        badge: accentColor === 'purple' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
    };

    if (workflows.length === 0) {
        return (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">Nenhum fluxo encontrado.</p>
            </div>
        );
    }

    const WorkflowRow: React.FC<{ workflow: Workflow }> = ({ workflow }) => (
        <tr className="hover:bg-gray-50 transition-colors">
            {/* Toggle */}
            <td className="pl-4 pr-2 py-3 w-12">
                <button
                    onClick={() => onToggle(workflow.id, !workflow.active)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${workflow.active ? 'bg-green-500' : 'bg-gray-200'}`}
                    role="switch"
                    aria-checked={workflow.active}
                    title={workflow.active ? 'Publicado — clique para pausar' : 'Rascunho — clique para publicar'}
                >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${workflow.active ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
            </td>

            {/* Nome e webhooks */}
            <td className="px-2 py-3">
                <div className="text-sm font-medium text-gray-900">{workflow.name}</div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                    {workflow.tags?.map(tag => (
                        <span key={tag.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">{tag.name}</span>
                    ))}
                </div>
                {n8nBaseUrl && workflow.nodes?.filter(n => n.type === 'n8n-nodes-base.webhook').map((node, idx) => {
                    const path = node.parameters?.path || workflow.id;
                    const method = (node.parameters?.httpMethod || 'GET').toUpperCase();
                    const url = `${n8nBaseUrl}/webhook/${path}`;
                    return (
                        <div key={idx} className="mt-1 flex items-center text-xs text-gray-500 bg-gray-50 p-1 rounded border border-gray-200">
                            <span className="font-bold mr-1 px-1 bg-gray-200 rounded">{method}</span>
                            <span className="truncate max-w-[150px] mr-2">{url}</span>
                            <button onClick={() => handleCopy(url)} className="ml-auto p-0.5 rounded hover:bg-gray-200">
                                {copiedUrl === url ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-gray-400" />}
                            </button>
                        </div>
                    );
                })}
            </td>

            {/* Status badge */}
            <td className="px-2 py-3 text-center w-24 hidden sm:table-cell">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${workflow.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {workflow.active ? 'Publicado' : 'Rascunho'}
                </span>
            </td>

            {/* Ações */}
            <td className="px-4 py-3 text-right w-28">
                <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onEdit(workflow)} className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 transition-colors" title="Editar Fluxo">
                        <Pencil className="h-4 w-4" />
                    </button>
                    {n8nBaseUrl && (
                        <a href={`${n8nBaseUrl}/workflow/${workflow.id}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" title="Abrir no n8n">
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    )}
                    <button onClick={() => onDelete(workflow.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Excluir">
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            </td>
        </tr>
    );

    return (
        <div className="space-y-3">
            {sorted.map(([pid, { name, flows }]) => {
                const isOpen = openFolders.has(pid);

                return (
                    <div key={pid} className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
                        {/* Cabeçalho da pasta (só mostra se houver múltiplos grupos) */}
                        {showFolders && (
                            <button
                                onClick={() => toggleFolder(pid)}
                                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
                            >
                                <div className="flex items-center gap-3">
                                    {isOpen
                                        ? <FolderOpen className={`h-5 w-5 ${accent.icon}`} />
                                        : <Folder className={`h-5 w-5 ${accent.icon}`} />
                                    }
                                    <span className={`font-semibold text-sm ${accent.text}`}>{name}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${accent.badge}`}>
                                        {flows.length} fluxo{flows.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                            </button>
                        )}

                        {/* Tabela de fluxos */}
                        {(!showFolders || isOpen) && (
                            flows.length === 0
                                ? <p className="text-center py-6 text-sm text-gray-400">Pasta vazia</p>
                                : (
                                    <table className="min-w-full divide-y divide-gray-100">
                                        <tbody className="divide-y divide-gray-100">
                                            {flows.map(wf => <WorkflowRow key={wf.id} workflow={wf} />)}
                                        </tbody>
                                    </table>
                                )
                        )}
                    </div>
                );
            })}
        </div>
    );
}
