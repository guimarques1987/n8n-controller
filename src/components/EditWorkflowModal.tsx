import { useEffect, useState } from 'react';
import { X, ExternalLink, Save, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { Workflow } from '../types';

interface EditWorkflowModalProps {
    isOpen: boolean;
    workflow: Workflow | null;
    instanceId: string | null;
    n8nBaseUrl?: string;
    onClose: () => void;
    onSave: (instanceId: string, id: string, data: any) => Promise<void>;
}

export default function EditWorkflowModal({ isOpen, workflow, instanceId, n8nBaseUrl, onClose, onSave }: EditWorkflowModalProps) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (workflow) {
            setName(workflow.name);
            setError(null);
            setSuccess(false);
        }
    }, [workflow]);

    if (!isOpen || !workflow || !instanceId) return null;

    const canvasUrl = n8nBaseUrl ? `${n8nBaseUrl}/workflow/${workflow.id}` : null;

    const openInN8n = () => {
        if (canvasUrl) window.open(canvasUrl, '_blank', 'noopener,noreferrer');
    };

    const handleSaveName = async () => {
        if (!name.trim()) return;
        setSaving(true);
        setError(null);
        setSuccess(false);
        try {
            await onSave(instanceId, workflow.id, {
                name: name.trim(),
                nodes: (workflow as any).nodes || [],
                connections: (workflow as any).connections || {},
                settings: (workflow as any).settings || {},
            });
            setSuccess(true);
            setTimeout(() => { setSuccess(false); onClose(); }, 1500);
        } catch (e: any) {
            setError(e.response?.data?.message || e.message || 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${workflow.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <div>
                            <h2 className="text-base font-bold text-gray-800 leading-tight">{workflow.name}</h2>
                            <p className="text-xs text-gray-400">ID: {workflow.id} · {workflow.active ? 'Publicado' : 'Rascunho'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Abrir no n8n — ação principal */}
                    {canvasUrl && (
                        <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-4 flex flex-col items-center gap-3 text-center">
                            <p className="text-sm text-indigo-700 font-medium">Editar o canvas visual do fluxo</p>
                            <p className="text-xs text-indigo-500">O editor do n8n abre em uma nova aba do navegador</p>
                            <button
                                onClick={openInN8n}
                                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow"
                            >
                                <ExternalLink className="h-4 w-4" />
                                Abrir Editor do n8n
                            </button>
                        </div>
                    )}

                    {/* Edição rápida do nome */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Renomear fluxo</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Nome do fluxo..."
                        />
                    </div>

                    {/* Feedback */}
                    {error && (
                        <p className="text-sm text-red-600 flex items-center gap-1.5">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
                        </p>
                    )}
                    {success && (
                        <p className="text-sm text-green-600 flex items-center gap-1.5">
                            <CheckCircle className="h-4 w-4 flex-shrink-0" /> Nome salvo com sucesso!
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                        Cancelar
                    </button>
                    <button
                        onClick={handleSaveName}
                        disabled={saving || name.trim() === workflow.name}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? 'Salvando...' : 'Salvar Nome'}
                    </button>
                </div>
            </div>
        </div>
    );
}
