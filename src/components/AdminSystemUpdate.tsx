import React, { useState } from 'react';
import { Upload, FileCode, FolderArchive, AlertTriangle, CheckCircle2, Loader2, Info } from 'lucide-react';

export default function AdminSystemUpdate() {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [progress, setProgress] = useState(0);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            setFile(selected);
            setMessage({ text: '', type: '' });
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setMessage({ text: 'Selecione um arquivo primeiro.', type: 'error' });
            return;
        }

        const isJs = file.name.toLowerCase().endsWith('.js') || file.name.toLowerCase().endsWith('.cjs');
        const isZip = file.name.toLowerCase().endsWith('.zip');

        if (!isJs && !isZip) {
            setMessage({ text: 'Formato inválido. Use .js/.cjs (servidor) ou .zip (pasta dist).', type: 'error' });
            return;
        }

        setLoading(true);
        setMessage({ text: '', type: '' });
        setProgress(10);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/admin/system/update', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro na atualização');

            setMessage({ text: data.message || 'Sistema atualizado com sucesso!', type: 'success' });
            setFile(null);

            // Se for servidor, avisar que pode demorar a voltar
            if (isJs) {
                setMessage({ text: 'Servidor atualizado! O sistema irá reiniciar. Aguarde alguns segundos e atualize a página.', type: 'success' });
            }
        } catch (err: any) {
            setMessage({ text: err.message, type: 'error' });
        } finally {
            setLoading(false);
            setProgress(0);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Upload className="h-5 w-5 text-indigo-600" />
                        <h2 className="text-lg font-medium text-gray-900">Central de Atualizações</h2>
                        <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded uppercase tracking-wider">v11.1-ROBUST</span>
                    </div>
                </div>

                <div className="p-6 space-y-8">
                    {/* Instruções */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
                        <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
                        <div className="space-y-2">
                            <p className="font-semibold">Como atualizar o sistema:</p>
                            <ul className="list-disc ml-4 space-y-1">
                                <li>Para o <strong>Servidor</strong>: Suba o arquivo <code>server-js-dist.cjs</code> (preferencial) ou <code>.js</code>. O sistema reiniciará automaticamente.</li>
                                <li>Para o <strong>Frontend (Interface)</strong>: Suba o arquivo <code>dist.zip</code> (a pasta <code>dist</code> compactada).</li>
                            </ul>
                        </div>
                    </div>

                    {/* Área de Upload */}
                    <div className="space-y-4">
                        <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${file ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}`}>
                            <div className="flex flex-col items-center gap-3">
                                {file ? (
                                    <>
                                        {file.name.toLowerCase().endsWith('.js') ? (
                                            <div className="p-4 bg-yellow-100 rounded-full">
                                                <FileCode className="h-8 w-8 text-yellow-600" />
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-indigo-100 rounded-full">
                                                <FolderArchive className="h-8 w-8 text-indigo-600" />
                                            </div>
                                        )}
                                        <div className="text-sm font-medium text-gray-900">{file.name}</div>
                                        <div className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                                        <button
                                            onClick={() => setFile(null)}
                                            className="text-xs text-red-600 hover:underline"
                                        >
                                            Remover arquivo
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="p-4 bg-gray-50 rounded-full">
                                            <Upload className="h-8 w-8 text-gray-400" />
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            Clique para selecionar ou arraste o arquivo aqui
                                        </div>
                                        <div className="text-xs text-gray-500">Aceita .js, .cjs ou .zip</div>
                                        <input
                                            type="file"
                                            id="update-upload"
                                            className="hidden"
                                            onChange={handleFileChange}
                                            accept=".js,.cjs,.zip"
                                        />
                                        <label
                                            htmlFor="update-upload"
                                            className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                                        >
                                            Selecionar Arquivo
                                        </label>
                                    </>
                                )}
                            </div>
                        </div>

                        {message.text && (
                            <div className={`p-4 rounded-lg flex items-start gap-3 ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                                {message.type === 'error' ? <AlertTriangle className="h-5 w-5 flex-shrink-0" /> : <CheckCircle2 className="h-5 w-5 flex-shrink-0" />}
                                <span className="text-sm font-medium">{message.text}</span>
                            </div>
                        )}

                        <button
                            onClick={handleUpload}
                            disabled={loading || !file}
                            className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition-all shadow-md ${loading || !file ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]'}`}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Processando Atualização...
                                </>
                            ) : (
                                <>
                                    <Upload className="h-5 w-5" />
                                    Instalar Atualização
                                </>
                            )}
                        </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-md border border-amber-100 italic">
                        <AlertTriangle className="h-4 w-4" />
                        Atenção: Atualizar o servidor interromperá as conexões ativas por alguns segundos. Use com cautela em horário comercial.
                    </div>
                </div>
            </div>
        </div>
    );
}
