import React, { useState, useEffect } from 'react';
import { Database, Download, Cloud, Settings, AlertCircle, CheckCircle2, Loader2, FileArchive, UploadCloud, Key, Link, RefreshCw } from 'lucide-react';

export default function AdminBackup() {
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [driveConfig, setDriveConfig] = useState({
        method: 'service_account', // 'service_account' | 'oauth2'
        serviceAccountJson: '',
        folderId: '',
        clientId: '',
        clientSecret: '',
        hasRefreshToken: false
    });
    const [authCode, setAuthCode] = useState('');
    const [authUrl, setAuthUrl] = useState('');
    const [msg, setMsg] = useState({ type: '', text: '' });

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        fetch('/api/admin/backup/drive/config', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data.config) {
                    setDriveConfig({
                        method: data.config.method || 'service_account',
                        serviceAccountJson: data.config.serviceAccountJson ? JSON.stringify(data.config.serviceAccountJson, null, 2) : '',
                        folderId: data.config.folderId || '',
                        clientId: data.config.clientId || '',
                        clientSecret: data.config.clientSecret || '',
                        hasRefreshToken: !!data.config.refreshToken
                    });
                }
            })
            .catch(err => console.error('Erro ao carregar config:', err));
    }, []);

    const handleDownloadDB = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/admin/backup/export-db', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Erro ao gerar backup do banco');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `database_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadFiles = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/admin/backup/export-files', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Erro ao gerar backup de arquivos');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `system_files_backup_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveConfig = async () => {
        setLoading(true);
        setMsg({ type: '', text: '' });
        try {
            const token = localStorage.getItem('auth_token');
            let jsonParsed = null;

            if (driveConfig.method === 'service_account' && driveConfig.serviceAccountJson) {
                try {
                    jsonParsed = JSON.parse(driveConfig.serviceAccountJson);
                } catch (e) {
                    throw new Error('JSON da Conta de Serviço inválido.');
                }
            }

            const res = await fetch('/api/admin/backup/drive/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    method: driveConfig.method,
                    serviceAccountJson: jsonParsed,
                    clientId: driveConfig.clientId,
                    clientSecret: driveConfig.clientSecret,
                    folderId: driveConfig.folderId
                })
            });
            if (!res.ok) throw new Error('Erro ao salvar configuração.');
            setMsg({ type: 'success', text: 'Configuração salva com sucesso!' });
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleGetAuthUrl = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/admin/backup/drive/auth-url', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao gerar URL.');
            setAuthUrl(data.url);
            window.open(data.url, '_blank');
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleExchangeCode = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/admin/backup/drive/exchange-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ code: authCode })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao validar código.');
            setMsg({ type: 'success', text: 'Backup autorizado com sucesso!' });
            setDriveConfig(prev => ({ ...prev, hasRefreshToken: true }));
            setAuthUrl('');
            setAuthCode('');
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const [driveFiles, setDriveFiles] = useState<any[]>([]);
    const [fetchingFiles, setFetchingFiles] = useState(false);
    const [restoringFile, setRestoringFile] = useState<string | null>(null);

    const handleFetchDriveFiles = async () => {
        setFetchingFiles(true);
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/admin/backup/drive/list', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao buscar arquivos.');
            setDriveFiles(data.files || []);
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setFetchingFiles(false);
        }
    };

    const handleRestoreDriveFile = async (fileId: string, fileName: string) => {
        if (!confirm(`TEM CERTEZA? Restaurar "${fileName}" irá SUBSTITUIR os dados atuais do sistema. Esta ação não pode ser desfeita.`)) return;

        setRestoringFile(fileId);
        setMsg({ type: '', text: '' });
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`/api/admin/backup/drive/restore/${fileId}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro na restauração.');
            setMsg({ type: 'success', text: data.message || 'Restauração concluída com sucesso!' });
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setRestoringFile(null);
        }
    };

    const handleSyncNow = async () => {
        setSyncing(true);
        setMsg({ type: '', text: '' });
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch('/api/admin/backup/drive/sync', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro na sincronização.');
            setMsg({ type: 'success', text: `Backup enviado ao Google Drive com sucesso! ID: ${data.fileId}` });
            handleFetchDriveFiles(); // Atualiza a lista após sincronizar
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-3">
                        <Database className="h-6 w-6 text-indigo-600" />
                        <div>
                            <h3 className="font-bold text-gray-800 text-lg">Central de Backup</h3>
                            <p className="text-sm text-gray-500">Proteja seus dados com cópias locais e em nuvem.</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                            <Download className="h-4 w-4" /> Backup Manual (Download)
                        </h4>
                        <div className="grid grid-cols-1 gap-3">
                            <button onClick={handleDownloadDB} disabled={loading} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 transition-all text-left group">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 rounded-md group-hover:bg-blue-200">
                                        <Database className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <span className="block font-bold text-gray-800">Banco de Dados</span>
                                        <span className="text-xs text-gray-500">Exportar tabelas em formato JSON</span>
                                    </div>
                                </div>
                                <Download className="h-4 w-4 text-gray-400" />
                            </button>

                            <button onClick={handleDownloadFiles} disabled={loading} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-amber-50 hover:border-amber-200 transition-all text-left group">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-100 rounded-md group-hover:bg-amber-200">
                                        <FileArchive className="h-5 w-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <span className="block font-bold text-gray-800">Arquivos do Sistema</span>
                                        <span className="text-xs text-gray-500">ZIP do código e configurações</span>
                                    </div>
                                </div>
                                <Download className="h-4 w-4 text-gray-400" />
                            </button>
                        </div>
                    </div>

                    <div className="bg-indigo-900 rounded-xl p-6 text-white space-y-4">
                        <div className="flex items-center justify-between">
                            <Cloud className="h-8 w-8 text-indigo-300" />
                            <div className="px-3 py-1 bg-indigo-800 rounded-full text-xs font-bold uppercase tracking-wider text-indigo-200">
                                Google Drive
                            </div>
                        </div>
                        <div>
                            <h4 className="text-xl font-bold">Auto Backup</h4>
                            <div className="flex items-center gap-2 mt-1">
                                <div className={`w-2 h-2 rounded-full ${driveConfig.hasRefreshToken || driveConfig.serviceAccountJson ? 'bg-green-400' : 'bg-red-400'}`} />
                                <p className="text-indigo-200 text-sm">
                                    {driveConfig.method === 'oauth2'
                                        ? (driveConfig.hasRefreshToken ? 'Autenticado' : 'Pendente de Autorização')
                                        : 'Configurado via Conta de Serviço'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleSyncNow}
                            disabled={syncing || !driveConfig.folderId}
                            className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${syncing ? 'bg-indigo-800 cursor-wait' : 'bg-white text-indigo-900 hover:bg-indigo-50'
                                }`}
                        >
                            {syncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
                            {syncing ? 'Enviando...' : 'Sincronizar Agora'}
                        </button>
                    </div>
                </div>

                {msg.text && (
                    <div className={`mx-6 mb-6 p-4 rounded-lg flex items-center gap-3 ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                        {msg.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                        <span className="text-sm font-medium">{msg.text}</span>
                    </div>
                )}
            </div>

            {/* Histórico de Backups (Cloud) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-3">
                        <Cloud className="h-6 w-6 text-indigo-600" />
                        <div>
                            <h3 className="font-bold text-gray-800 text-lg">Histórico (Google Drive)</h3>
                            <p className="text-sm text-gray-500">Arquivos disponíveis na nuvem para restauração.</p>
                        </div>
                    </div>
                    <button
                        onClick={handleFetchDriveFiles}
                        disabled={fetchingFiles || !driveConfig.folderId}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-all font-bold text-sm disabled:opacity-50"
                    >
                        {fetchingFiles ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {fetchingFiles ? 'Buscando...' : 'Atualizar Lista'}
                    </button>
                </div>

                <div className="max-h-[400px] overflow-y-auto">
                    {driveFiles.length === 0 ? (
                        <div className="p-12 text-center">
                            <Cloud className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                            <p className="text-gray-400 text-sm">Nenhum backup encontrado na pasta do Drive.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-3">Arquivo</th>
                                    <th className="px-6 py-3">Data</th>
                                    <th className="px-6 py-3">Tamanho</th>
                                    <th className="px-6 py-3 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {driveFiles.map((file) => (
                                    <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {file.name.endsWith('.json') ? (
                                                    <Database className="h-5 w-5 text-blue-500" />
                                                ) : (
                                                    <FileArchive className="h-5 w-5 text-amber-500" />
                                                )}
                                                <div>
                                                    <span className="block font-medium text-gray-800 text-sm">{file.name}</span>
                                                    <span className="text-[10px] text-gray-400 font-mono">{file.id}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                                            {new Date(file.createdTime).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {file.size ? `${(parseInt(file.size) / 1024 / 1024).toFixed(2)} MB` : '--'}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <button
                                                onClick={() => handleRestoreDriveFile(file.id, file.name)}
                                                disabled={restoringFile === file.id}
                                                className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${restoringFile === file.id
                                                        ? 'bg-gray-100 text-gray-400'
                                                        : 'bg-green-50 text-green-700 hover:bg-green-600 hover:text-white border border-green-200'
                                                    }`}
                                            >
                                                {restoringFile === file.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 className="h-3 w-3 animate-spin" /> Restaurando...
                                                    </div>
                                                ) : 'Restaurar'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
                <div className="flex items-center gap-3">
                    <Settings className="h-6 w-6 text-gray-700" />
                    <h3 className="font-bold text-gray-800 text-lg">Configuração Google Drive</h3>
                </div>

                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-bold text-gray-700 block mb-2">Método de Conexão</label>
                            <select
                                value={driveConfig.method}
                                onChange={(e) => setDriveConfig({ ...driveConfig, method: e.target.value })}
                                className="w-full p-3 border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="service_account">Conta de Serviço (Drives Compartilhados)</option>
                                <option value="oauth2">OAuth2 (Contas Pessoais @gmail.com)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-bold text-gray-700 block mb-2">ID da Pasta</label>
                            <input
                                type="text"
                                value={driveConfig.folderId}
                                onChange={(e) => setDriveConfig({ ...driveConfig, folderId: e.target.value })}
                                placeholder="ID alfanumérico da pasta"
                                className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50 outline-none"
                            />
                        </div>
                    </div>

                    {driveConfig.method === 'service_account' ? (
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">JSON da Conta de Serviço</label>
                            <textarea
                                value={driveConfig.serviceAccountJson}
                                onChange={(e) => setDriveConfig({ ...driveConfig, serviceAccountJson: e.target.value })}
                                placeholder='{ "type": "service_account", ... }'
                                rows={6}
                                className="w-full p-4 border border-gray-200 rounded-lg bg-gray-50 outline-none font-mono text-xs"
                            />
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-700">Client ID</label>
                                    <input
                                        type="text"
                                        value={driveConfig.clientId}
                                        onChange={(e) => setDriveConfig({ ...driveConfig, clientId: e.target.value })}
                                        className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-700">Client Secret</label>
                                    <input
                                        type="password"
                                        value={driveConfig.clientSecret}
                                        onChange={(e) => setDriveConfig({ ...driveConfig, clientSecret: e.target.value })}
                                        className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50"
                                    />
                                </div>
                            </div>

                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
                                <div className="flex items-center gap-2 text-indigo-700 font-bold">
                                    <Key className="h-5 w-5" /> Fluxo de Autorização
                                </div>
                                <p className="text-sm text-gray-600">Após salvar o Client ID/Secret, gere o link e cole o código abaixo.</p>

                                <div className="flex flex-col sm:flex-row gap-4">
                                    <button
                                        onClick={handleGetAuthUrl}
                                        disabled={!driveConfig.clientId || !driveConfig.clientSecret}
                                        className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
                                    >
                                        <Link className="h-4 w-4" /> 1. Gerar Link
                                    </button>
                                    <div className="flex-grow flex gap-2">
                                        <input
                                            type="text"
                                            value={authCode}
                                            onChange={(e) => setAuthCode(e.target.value)}
                                            placeholder="Cole o código aqui..."
                                            className="flex-grow p-3 border border-gray-200 rounded-lg outline-none"
                                        />
                                        <button
                                            onClick={handleExchangeCode}
                                            disabled={!authCode}
                                            className="bg-green-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-green-700 transition-all disabled:opacity-50"
                                        >
                                            2. Finalizar
                                        </button>
                                    </div>
                                </div>
                                {authUrl && <p className="text-xs text-indigo-500 break-all">Link gerado: {authUrl}</p>}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleSaveConfig}
                        disabled={loading}
                        className="bg-gray-800 text-white font-bold py-3 px-8 rounded-lg hover:bg-gray-900 transition-all disabled:opacity-50"
                    >
                        {loading ? 'Salvando...' : 'Salvar Configurações Gerais'}
                    </button>
                </div>
            </div>
        </div>
    );
}
