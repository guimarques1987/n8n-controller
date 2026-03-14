import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface RoboConfig {
    'ativa-robo': number; // 0 = desligado, 1 = ligado
    'ativa-ia': number;   // 0 = desligado, 1 = ligado
    'msg-saudacao': string;
    'msg-despedida': string;
    'link-foto-aberto': string;
    'link-foto-fechado': string;
    tipo_mensagem_aberto: 'texto' | 'imagem';
    tipo_mensagem_fechado: 'texto' | 'imagem';
    'status-recuperador': number; // 0 = desligado, 1 = ligado
    'qtd-dias': number;
    'qtd-dias-maximo': number;
    'status-lembrete': number; // 0 = desligado, 1 = ligado
    plano?: string;
    workflow_id?: string;
    instance_id?: string;
    webhook_url?: string;
}

// ─── Variáveis de atalho ──────────────────────────────────────────────────────
const VARIAVEIS = [
    { label: 'Nome do Cliente', value: "{{ $('Dados-WB').first().json.body.data.pushName }}" },
    { label: 'Saudação', value: "{{ $('saudação/dataAtual').first().json.saudacao }}" },
    { label: 'Nome do Estabelecimento', value: "{{ $('Dados-Lojista').first().json.NomeEstabelecimento }}" },
    { label: 'Link do Cardápio', value: "{{ $('Dados-Lojista').first().json.site }}" },
];

const DEFAULT_SAUDACAO = `{{ $('saudação/dataAtual').first().json.saudacao }} {{ $('Dados-WB').first().json.body.data.pushName }}! Bem-vindo à {{ $('Dados-Lojista').first().json.NomeEstabelecimento }}. 

Segue o link do nosso cardápio digital: {{ $('Dados-Lojista').first().json.site }} 

Pedidos feitos pelo nosso site vão direto para a cozinha, garantindo um preparo mais rápido. 

**Obs: Após clicar no link, aguarde alguns segundos enquanto o site carrega os produtos.**  

Agradecemos a sua preferência.`;

const DEFAULT_DESPEDIDA = `{{ $('saudação/dataAtual').first().json.saudacao }} {{ $('Dados-WB').first().json.body.data.pushName }} 🔥

A {{ $('Dados-Lojista').first().json.NomeEstabelecimento }} está fechada neste momento, mas já já estaremos prontos para preparar seu pedido 😍

⏰ Nosso horário:
Domingo: {{ $json.Domingo[0] }}
Segunda: {{ $json.Segunda[0] }}
Terça: {{ $json.Terça[0] }}
Quarta: {{ $json.Quarta[0] }}
Quinta: {{ $json.Quinta[0] }}
Sexta: {{ $json.Sexta[0] }}
Sábado: {{ $json.Sábado[0] }}

Salva nosso contato e chama a gente assim que estivermos abertos 😉`;

// ─── Switch toggle ────────────────────────────────────────────────────────────
function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none', opacity: disabled ? 0.6 : 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{label}</span>
            <div
                onClick={() => { if (!disabled) onChange(!checked); }}
                style={{
                    width: 48, height: 26, borderRadius: 99, position: 'relative',
                    background: checked ? '#3b82f6' : '#d1d5db',
                    transition: 'background 0.25s',
                    flexShrink: 0,
                }}
            >
                <div style={{
                    position: 'absolute', top: 3,
                    left: checked ? 25 : 3,
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                    transition: 'left 0.25s',
                }} />
            </div>
        </label>
    );
}

// ─── Card de Mensagem ─────────────────────────────────────────────────────────
function MensagemCard({
    titulo,
    texto,
    onTextoChange,
    tipoMensagem,
    onTipoChange,
    linkFoto,
    onLinkFotoChange,
    placeholder,
    token,
    hideImageOption,
    defaultMessage,
}: {
    titulo: string;
    texto: string;
    onTextoChange: (v: string) => void;
    tipoMensagem: 'texto' | 'imagem';
    onTipoChange: (v: 'texto' | 'imagem') => void;
    linkFoto: string;
    onLinkFotoChange: (url: string) => void;
    placeholder: string;
    token: string | null;
    hideImageOption?: boolean;
    defaultMessage?: string;
}) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadLoading, setUploadLoading] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [uploadSuccess, setUploadSuccess] = useState('');

    const insertVariable = (varValue: string) => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const newText = texto.substring(0, start) + varValue + texto.substring(end);
        onTextoChange(newText);
        // Reposicionar cursor
        setTimeout(() => {
            el.focus();
            el.setSelectionRange(start + varValue.length, start + varValue.length);
        }, 0);
    };

    const handleFileSelect = async (file: File) => {
        setUploadError('');
        setUploadSuccess('');
        if (file.size > 300 * 1024) {
            setUploadError('O arquivo deve ter no máximo 300kb');
            return;
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            setUploadError('Formato não permitido. Use jpg, jpeg, png ou webp');
            return;
        }
        setUploadLoading(true);
        try {
            const formData = new FormData();
            formData.append('foto', file);
            const res = await fetch('/api/robo-config/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro no upload');
            onLinkFotoChange(data.url);
            setUploadSuccess('Imagem enviada com sucesso!');
        } catch (e: any) {
            setUploadError(e.message);
        } finally {
            setUploadLoading(false);
        }
    };

    return (
        <div style={{
            background: '#fff',
            borderRadius: 16,
            border: '1.5px solid #e5e7eb',
            padding: '22px 24px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            marginBottom: 20,
        }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
                {titulo}
                {defaultMessage && tipoMensagem === 'texto' && (
                    <button
                        onClick={() => {
                            if (confirm('Deseja realmente voltar para a mensagem padrão?')) {
                                onTextoChange(defaultMessage);
                            }
                        }}
                        style={{
                            marginLeft: 'auto', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                            background: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
                        Mensagem Padrão
                    </button>
                )}
            </h3>

            {/* Seletor Texto / Imagem */}
            {!hideImageOption ? (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {(['texto', 'imagem'] as const).map(op => (
                        <button
                            key={op}
                            onClick={() => onTipoChange(op)}
                            style={{
                                padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                                border: '1.5px solid',
                                borderColor: tipoMensagem === op ? '#3b82f6' : '#d1d5db',
                                background: tipoMensagem === op ? '#eff6ff' : '#f9fafb',
                                color: tipoMensagem === op ? '#2563eb' : '#6b7280',
                                cursor: 'pointer', transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            {op === 'texto' ? (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="17" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="17" y1="18" x2="3" y2="18" /></svg>
                            ) : (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                            )}
                            {op.charAt(0).toUpperCase() + op.slice(1)}
                        </button>
                    ))}
                </div>
            ) : (
                <div style={{ marginBottom: 16, display: 'inline-flex', alignItems: 'center', padding: '6px 14px', background: '#fef3c7', borderRadius: 8, fontSize: 13, color: '#92400e', gap: 8, fontWeight: 600 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    Imagens desbloqueadas apenas no Plano Premium
                </div>
            )}

            {/* MODO TEXTO */}
            {tipoMensagem === 'texto' && (
                <>
                    {/* Botões de variáveis */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {VARIAVEIS.map(v => (
                            <button
                                key={v.label}
                                onClick={() => insertVariable(v.value)}
                                style={{
                                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                    border: '1.5px solid #bfdbfe',
                                    background: '#eff6ff', color: '#2563eb',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                    whiteSpace: 'nowrap',
                                }}
                                title={`Inserir: ${v.value}`}
                            >
                                [{v.label}]
                            </button>
                        ))}
                    </div>

                    {/* Textarea */}
                    <textarea
                        ref={textareaRef}
                        value={texto}
                        onChange={e => onTextoChange(e.target.value)}
                        placeholder={placeholder}
                        rows={5}
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '12px 14px',
                            border: '1.5px solid #e5e7eb', borderRadius: 10,
                            fontSize: 14, color: '#1f2937',
                            background: '#f9fafb',
                            fontFamily: 'inherit', lineHeight: 1.6,
                            resize: 'vertical', outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'}
                        onBlur={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                    />
                </>
            )}

            {/* MODO IMAGEM */}
            {tipoMensagem === 'imagem' && (
                <div>
                    {/* Preview da imagem atual */}
                    {linkFoto && (
                        <div style={{ marginBottom: 16 }}>
                            <img
                                src={linkFoto}
                                alt="Preview"
                                style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 10, border: '1px solid #e5e7eb', objectFit: 'contain' }}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280', wordBreak: 'break-all' }}>
                                🔗 {linkFoto}
                            </p>
                        </div>
                    )}

                    {/* Área de drop / upload */}
                    <div
                        style={{
                            border: '2px dashed #bfdbfe', borderRadius: 12,
                            padding: '24px 16px', textAlign: 'center',
                            background: '#f8fbff', cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6'; }}
                        onDragLeave={e => { e.currentTarget.style.borderColor = '#bfdbfe'; }}
                        onDrop={e => {
                            e.preventDefault();
                            e.currentTarget.style.borderColor = '#bfdbfe';
                            const file = e.dataTransfer.files[0];
                            if (file) handleFileSelect(file);
                        }}
                    >
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round" style={{ margin: '0 auto 10px', display: 'block' }}>
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#3b82f6' }}>Clique ou arraste para enviar</p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
                            JPG, JPEG, PNG, WEBP · máx. 300kb
                        </p>
                    </div>

                    {/* Botões de ação */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 10,
                                border: '1.5px solid #d1d5db',
                                background: '#fff', color: '#374151',
                                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                            Galeria
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadLoading}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 10,
                                border: '1.5px solid #d1d5db',
                                background: '#fff', color: '#374151',
                                fontSize: 13, fontWeight: 600, cursor: uploadLoading ? 'wait' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                            </svg>
                            Upload
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadLoading}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                                background: uploadLoading ? '#93c5fd' : '#3b82f6',
                                color: '#fff', fontSize: 13, fontWeight: 700,
                                cursor: uploadLoading ? 'wait' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                boxShadow: '0 4px 12px rgba(59,130,246,0.35)',
                            }}
                        >
                            {uploadLoading ? (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                            ) : (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                                    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                                </svg>
                            )}
                            {uploadLoading ? 'Enviando...' : 'Enviar'}
                        </button>
                    </div>

                    {/* Input file oculto */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
                    />

                    {/* URL manual */}
                    <div style={{ marginTop: 14 }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                            Ou cole um link de imagem:
                        </label>
                        <input
                            type="url"
                            value={linkFoto}
                            onChange={e => onLinkFotoChange(e.target.value)}
                            placeholder="https://..."
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                padding: '9px 12px', border: '1.5px solid #e5e7eb',
                                borderRadius: 8, fontSize: 13, color: '#374151',
                                background: '#f9fafb', outline: 'none',
                            }}
                        />
                    </div>

                    {uploadError && (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                            {uploadError}
                        </div>
                    )}
                    {uploadSuccess && (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#16a34a', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                            {uploadSuccess}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function RobotConfigPage({ externalLojistaId }: { externalLojistaId?: string }) {
    const { token, user } = useAuth();
    const [config, setConfig] = useState<RoboConfig>({
        'ativa-robo': 1,
        'ativa-ia': 1,
        'msg-saudacao': '',
        'msg-despedida': '',
        'link-foto-aberto': '',
        'link-foto-fechado': '',
        tipo_mensagem_aberto: 'texto',
        tipo_mensagem_fechado: 'texto',
        'status-recuperador': 1,
        'qtd-dias': 0,
        'qtd-dias-maximo': 0,
        'status-lembrete': 1,
        'plano': 'basico'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [saveError, setSaveError] = useState('');

    // --- WhatsApp Uazapi Connection State ---
    const [wpStatus, setWpStatus] = useState<string>('verificando...');
    const [wpQrCode, setWpQrCode] = useState<string>('');
    const [wpLoading, setWpLoading] = useState(false);
    const [wpError, setWpError] = useState('');

    const [lojistaWorkflows, setLojistaWorkflows] = useState<any[]>([]);

    useEffect(() => {
        const url = externalLojistaId ? `/api/robo-config?lojistaId=${externalLojistaId}` : '/api/robo-config';
        fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                setConfig({
                    'ativa-robo': data['ativa-robo'] ?? 1,
                    'ativa-ia': data['ativa-ia'] ?? 1,
                    'msg-saudacao': data['msg-saudacao'] ?? '',
                    'msg-despedida': data['msg-despedida'] ?? '',
                    'link-foto-aberto': data['link-foto-aberto'] ?? '',
                    'link-foto-fechado': data['link-foto-fechado'] ?? '',
                    tipo_mensagem_aberto: data.tipo_mensagem_aberto ?? 'texto',
                    tipo_mensagem_fechado: data.tipo_mensagem_fechado ?? 'texto',
                    'status-recuperador': data['status-recuperador'] !== undefined ? data['status-recuperador'] : 0,
                    'qtd-dias': data['qtd-dias'] ?? 0,
                    'qtd-dias-maximo': data['qtd-dias-maximo'] ?? 0,
                    'status-lembrete': data['status-lembrete'] !== undefined ? data['status-lembrete'] : 0,
                    'plano': data.plano || 'basico'
                });
            })
            .catch(() => { })
            .finally(() => setLoading(false));

        fetchWpStatus();

        const wfUrl = externalLojistaId
            ? `/api/admin/lojista-workflows/${externalLojistaId}`
            : `/api/lojista/workflows`;

        fetch(wfUrl, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(wfs => {
                if (Array.isArray(wfs)) setLojistaWorkflows(wfs);
            })
            .catch(console.error);
    }, [token, externalLojistaId]);

    // --- Uazapi Handlers ---
    const fetchWpStatus = async () => {
        try {
            const url = externalLojistaId ? `/api/whatsapp/status?lojistaId=${externalLojistaId}` : '/api/whatsapp/status';
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setWpStatus(data.status || 'close');
        } catch (e) {
            setWpStatus('close');
        }
    };

    const handleConnectWp = async () => {
        setWpLoading(true);
        setWpError('');
        setWpQrCode('');
        try {
            const url = externalLojistaId ? `/api/whatsapp/connect?lojistaId=${externalLojistaId}` : '/api/whatsapp/connect';
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (res.ok && data.qrCode) {
                setWpQrCode(data.qrCode);
                setWpStatus('connecting');
            } else {
                throw new Error(data.error || 'Erro ao gerar QR Code');
            }
        } catch (e: any) {
            setWpError(e.message);
            setWpStatus('close');
        } finally {
            setWpLoading(false);
        }
    };

    const handleDisconnectWp = async () => {
        if (!confirm('Deseja realmente desconectar este WhatsApp?')) return;
        setWpLoading(true);
        try {
            const url = externalLojistaId ? `/api/whatsapp/disconnect?lojistaId=${externalLojistaId}` : '/api/whatsapp/disconnect';
            await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            setWpQrCode('');
            setWpStatus('close');
        } catch (e) {
            console.error(e);
        } finally {
            setWpLoading(false);
        }
    };

    // Polling do status do WhatsApp enquanto tenta conectar
    useEffect(() => {
        let interval: any;
        if (wpStatus === 'connecting') {
            interval = setInterval(() => {
                fetchWpStatus();
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [wpStatus]);


    const handleUnbind = async (id: number) => {
        if (!confirm('Deseja realmente desvincular este fluxo?')) return;
        try {
            const res = await fetch(`/api/admin/lojista-workflows/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setLojistaWorkflows(prev => prev.filter(w => w.id !== id));
            } else {
                alert('Falha ao desvincular fluxo');
            }
        } catch (e) {
            console.error(e);
            alert('Erro ao processar desvínculo');
        }
    };

    const handleSave = async () => {
        setSaveMsg('');
        setSaveError('');
        setSaving(true);
        try {
            const payload = { ...config };
            if (externalLojistaId) Object.assign(payload, { lojistaId: externalLojistaId });

            const res = await fetch('/api/robo-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
            setSaveMsg('Configurações salvas com sucesso!');
            setTimeout(() => setSaveMsg(''), 3500);
        } catch (e: any) {
            setSaveError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const set = (key: keyof RoboConfig, value: any) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px', fontFamily: "'Inter', -apple-system, sans-serif" }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            {/* ── PLANO SELECTION (Admin Only) ───────────────────────────────────────── */}
            {externalLojistaId && (
                <div style={{
                    background: '#fef3c7', borderRadius: 16, border: '1.5px solid #fbbf24',
                    padding: '20px 24px', marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                            Plano do Lojista (Admin)
                        </h2>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#b45309' }}>Altere a assinatura comercial deste cliente.</p>
                    </div>
                    <select
                        value={config.plano}
                        onChange={(e) => set('plano', e.target.value)}
                        style={{
                            padding: '10px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#92400e',
                            background: '#fff', border: '1px solid #fcd34d', outline: 'none', cursor: 'pointer',
                            minWidth: 160
                        }}
                    >
                        <option value="basico">Básico (Sem IA, Sem Imagem)</option>
                        <option value="avancado">Avançado (Com IA, Sem Imagem)</option>
                        <option value="premium">Premium (Imagens Liberadas)</option>
                    </select>
                </div>
            )}

            {/* ── CONNECTION CARD: WhatsApp / Uazapi ───────────────────────────────────────── */}
            <div style={{
                background: '#fff', borderRadius: 16, border: '1.5px solid #e5e7eb',
                padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 24,
                display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '12px', background: '#ecfdf5',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1f2937' }}>Conexão WhatsApp</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: (wpStatus === 'open' || wpStatus === 'connected') ? '#10b981' : wpStatus === 'connecting' ? '#f59e0b' : '#ef4444'
                            }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                                {(wpStatus === 'open' || wpStatus === 'connected') ? 'Conectado e Operacional' : wpStatus === 'connecting' ? 'Aguardando Leitura...' : wpStatus === 'verificando...' ? 'Verificando...' : 'Desconectado'}
                            </span>
                        </div>
                    </div>
                </div>

                {wpError && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{wpError}</div>}

                {(wpStatus === 'open' || wpStatus === 'connected') ? (
                    <button
                        onClick={handleDisconnectWp}
                        disabled={wpLoading}
                        style={{
                            padding: '10px 24px', background: '#fef2f2', color: '#ef4444', borderRadius: 8,
                            fontSize: 14, fontWeight: 600, border: '1px solid #fecaca', cursor: wpLoading ? 'wait' : 'pointer'
                        }}
                    >
                        {wpLoading ? 'Aguarde...' : 'Desconectar WhatsApp'}
                    </button>
                ) : wpQrCode && wpStatus !== 'connected' && wpStatus !== 'open' ? (
                    <div style={{ background: '#f9fafb', padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', marginTop: 10 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#4b5563', fontWeight: 500 }}>
                            Escaneie o QR Code abaixo no seu WhatsApp app:
                        </p>
                        <img src={wpQrCode} alt="WhatsApp QR Code" style={{ width: 220, height: 220, background: '#fff', padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                        <button
                            onClick={handleConnectWp}
                            style={{
                                marginTop: 14, padding: '8px 16px', background: 'transparent', color: '#6b7280', borderRadius: 6,
                                fontSize: 13, fontWeight: 600, border: '1px solid #d1d5db', cursor: 'pointer', width: '100%'
                            }}
                        >
                            Gerar Novo QR Code
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={handleConnectWp}
                        disabled={wpLoading || wpStatus === 'verificando...'}
                        style={{
                            padding: '10px 24px', background: '#10b981', color: '#fff', borderRadius: 8,
                            fontSize: 14, fontWeight: 600, border: 'none', cursor: wpLoading ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8, opacity: wpLoading ? 0.7 : 1
                        }}
                    >
                        {wpLoading ? 'Gerando...' : 'Conectar WhatsApp'}
                    </button>
                )}
            </div>

            {/* ── TOPO: IA + Switches ───────────────────────────────────────── */}
            <div style={{
                background: '#fff',
                borderRadius: 16,
                border: '1.5px solid #e5e7eb',
                padding: '18px 24px',
                marginBottom: 20,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                flexWrap: 'wrap',
            }}>
                {/* Ícone + Label IA */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto' }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                            <circle cx="7.5" cy="14.5" r="1.5" fill="white" stroke="none" />
                            <circle cx="16.5" cy="14.5" r="1.5" fill="white" stroke="none" />
                        </svg>
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1f2937' }}>🤖 IA</h2>
                        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Robô de Atendimento WhatsApp</p>
                    </div>
                </div>

                {/* Switch Ativar Robô */}
                <Switch
                    checked={config['ativa-robo'] === 1}
                    onChange={v => set('ativa-robo', v ? 1 : 0)}
                    label="Ativar Robô"
                />

                {/* Divider */}
                <div style={{ width: 1, height: 32, background: '#e5e7eb', flexShrink: 0 }} />

                {/* Switch Ativar IA */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Switch
                        checked={config['ativa-ia'] === 1}
                        onChange={v => { if (config.plano !== 'basico') set('ativa-ia', v ? 1 : 0) }}
                        label="Ativar IA"
                        disabled={config.plano === 'basico'}
                    />
                    {config.plano === 'basico' && (
                        <span style={{ fontSize: 11, padding: '4px 8px', background: '#fee2e2', color: '#b91c1c', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap' }}>Plano Básico (IA Off)</span>
                    )}
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 32, background: '#e5e7eb', flexShrink: 0 }} />

                {/* Switch Ativar Recuperador */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Switch
                        checked={config['status-recuperador'] === 1}
                        onChange={v => { if (config.plano === 'premium') set('status-recuperador', v ? 1 : 0) }}
                        label="Ativar Recuperador"
                        disabled={config.plano !== 'premium'}
                    />
                    {config.plano !== 'premium' && (
                        <span style={{ fontSize: 11, padding: '4px 8px', background: '#fee2e2', color: '#b91c1c', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap' }}>Apenas Premium</span>
                    )}
                </div>

                {/* Switch Ativar Lembrete */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Switch
                        checked={config['status-lembrete'] === 1}
                        onChange={v => { if (config.plano === 'premium') set('status-lembrete', v ? 1 : 0) }}
                        label="Ativar Lembrete"
                        disabled={config.plano !== 'premium'}
                    />
                    {config.plano !== 'premium' && (
                        <span style={{ fontSize: 11, padding: '4px 8px', background: '#fee2e2', color: '#b91c1c', borderRadius: 6, fontWeight: 700, whiteSpace: 'nowrap' }}>Apenas Premium</span>
                    )}
                </div>

                {/* Status badge */}
                <div style={{
                    padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                    background: config['ativa-robo'] === 1 ? '#dcfce7' : '#f3f4f6',
                    color: config['ativa-robo'] === 1 ? '#16a34a' : '#9ca3af',
                    border: `1.5px solid ${config['ativa-robo'] === 1 ? '#bbf7d0' : '#e5e7eb'}`,
                    flexShrink: 0,
                }}>
                    {config['ativa-robo'] === 1 ? '● Robô Ativo' : '○ Robô Inativo'}
                </div>
            </div>

            {/* Inputs Condicionais: Recuperador */}
            {config['status-recuperador'] === 1 && (
                <div style={{
                    background: '#fff', borderRadius: 16, border: '1.5px solid #e5e7eb',
                    padding: '18px 24px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                    display: 'flex', gap: 20, flexWrap: 'wrap'
                }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                            Quantidade dias mínimo
                        </label>
                        <input
                            type="number"
                            value={config['qtd-dias']}
                            onChange={e => set('qtd-dias', parseInt(e.target.value, 10) || 0)}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: 8,
                                border: '1.5px solid #d1d5db', outline: 'none', background: '#f9fafb',
                            }}
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                            Quantidade dias máximo
                        </label>
                        <input
                            type="number"
                            value={config['qtd-dias-maximo']}
                            onChange={e => set('qtd-dias-maximo', parseInt(e.target.value, 10) || 0)}
                            style={{
                                width: '100%', padding: '10px 12px', borderRadius: 8,
                                border: '1.5px solid #d1d5db', outline: 'none', background: '#f9fafb',
                            }}
                        />
                    </div>
                </div>
            )}

            {/* ── Card Mensagem de Saudação ─────────────────────────────────── */}
            <MensagemCard
                titulo="Mensagem de Saudação"
                texto={config['msg-saudacao']}
                onTextoChange={v => set('msg-saudacao', v)}
                tipoMensagem={config.plano === 'basico' || config.plano === 'avancado' ? 'texto' : config.tipo_mensagem_aberto}
                onTipoChange={v => set('tipo_mensagem_aberto', v)}
                linkFoto={config['link-foto-aberto']}
                onLinkFotoChange={url => set('link-foto-aberto', url)}
                placeholder="Digite sua mensagem de saudação..."
                token={token}
                hideImageOption={config.plano === 'basico' || config.plano === 'avancado'}
                defaultMessage={DEFAULT_SAUDACAO}
            />

            {/* ── Card Mensagem de Despedida ────────────────────────────────── */}
            <MensagemCard
                titulo="Mensagem de Despedida"
                texto={config['msg-despedida']}
                onTextoChange={v => set('msg-despedida', v)}
                tipoMensagem={config.plano === 'basico' || config.plano === 'avancado' ? 'texto' : config.tipo_mensagem_fechado}
                onTipoChange={v => set('tipo_mensagem_fechado', v)}
                linkFoto={config['link-foto-fechado']}
                onLinkFotoChange={url => set('link-foto-fechado', url)}
                placeholder="Digite sua mensagem de despedida..."
                token={token}
                hideImageOption={config.plano === 'basico' || config.plano === 'avancado'}
                defaultMessage={DEFAULT_DESPEDIDA}
            />

            {/* ── Card Exemplo de Mensagem ─────────────────────────────────── */}
            <div style={{
                background: '#fffbeb',
                borderRadius: 14,
                border: '1.5px solid #fde68a',
                padding: '16px 20px',
                marginBottom: 24,
            }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    Exemplo de mensagem completa
                </p>
                <pre style={{
                    margin: 0, fontSize: 12, lineHeight: 1.7, color: '#78350f',
                    background: 'rgba(254,215,170,0.3)', borderRadius: 8, padding: '10px 14px',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace',
                }}>{`{{ $('saudação/dataAtual').first().json.saudacao }} {{ $('Dados-WB').first().json.body.data.pushName }}!

Bem-vindo à {{ $('Dados-Lojista').first().json.NomeEstabelecimento }} 🍔

Veja nosso cardápio:
{{ $('Dados-Lojista').first().json.site }}`}</pre>
            </div>

            {/* ── Feedback ─────────────────────────────────────────────────── */}
            {saveMsg && (
                <div style={{ padding: '12px 18px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, marginBottom: 16, color: '#16a34a', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {saveMsg}
                </div>
            )}
            {saveError && (
                <div style={{ padding: '12px 18px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, marginBottom: 16, color: '#dc2626', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    {saveError}
                </div>
            )}

            {/* ── Seção Webhooks Vinculados (Multi-fluxos) ────────────────────── */}
            {user?.role === 'admin' && lojistaWorkflows.length > 0 && (
                <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                        Webhooks Vinculados
                    </h3>
                    {lojistaWorkflows.map((lw, idx) => (
                        <div key={idx} style={{
                            background: '#f8fafc',
                            borderRadius: 14,
                            border: '1.5px solid #e2e8f0',
                            padding: '16px 20px',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ padding: '2px 6px', background: '#3b82f6', color: '#fff', borderRadius: 4, fontSize: 10 }}>n8n</span>
                                    {lw.workflow_name || 'Fluxo sem nome'}
                                </p>
                                <div style={{ display: 'flex', gap: 8 }}> {/* Added a div to group buttons */}
                                    {lw.maintenanceUrl && (
                                        <a
                                            href={lw.maintenanceUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                fontSize: 11, fontWeight: 800, color: '#2563eb',
                                                textDecoration: 'none', background: '#eff6ff',
                                                padding: '4px 10px', borderRadius: 6, border: '1px solid #bfdbfe',
                                                display: 'flex', alignItems: 'center', gap: 4
                                            }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                            Manutenção
                                        </a>
                                    )}
                                    <button
                                        onClick={() => handleUnbind(lw.id)}
                                        style={{
                                            background: '#fef2f2', border: '1px solid #fecaca',
                                            borderRadius: 6, padding: '4px 8px', color: '#dc2626',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                            fontSize: 11, fontWeight: 700
                                        }}
                                        title="Remover Vínculo"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                        Remover
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    readOnly
                                    value={lw.webhook_url}
                                    style={{
                                        flex: 1,
                                        background: '#fff',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 8,
                                        padding: '8px 12px',
                                        fontSize: 12,
                                        color: '#64748b',
                                        outline: 'none',
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(lw.webhook_url || '');
                                        alert('Webhook copiado!');
                                    }}
                                    style={{
                                        background: '#3b82f6',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: 8,
                                        padding: '0 15px',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Copiar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Seção Webhook Vinculado (Novo) ─────────────────────────── */}
            {config.webhook_url && (
                <div style={{
                    background: '#ecfdf5',
                    borderRadius: 14,
                    border: '1.5px solid #a7f3d0',
                    padding: '16px 20px',
                    marginBottom: 24,
                }}>
                    <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#047857', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                        Webhook do Robô Lojista
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            readOnly
                            value={config.webhook_url}
                            style={{
                                flex: 1,
                                background: 'rgba(255,255,255,0.8)',
                                border: '1px solid #d1d5db',
                                borderRadius: 8,
                                padding: '8px 12px',
                                fontSize: 12,
                                color: '#111827',
                                fontFamily: 'monospace'
                            }}
                        />
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(config.webhook_url || '');
                                alert('Webhook copiado!');
                            }}
                            style={{
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: 8,
                                padding: '0 12px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Copiar
                        </button>
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#059669' }}>
                        Use este nome no seu fluxo do n8n (Caminho do Webhook)
                    </p>
                </div>
            )}

            {/* ── Botão Salvar ─────────────────────────────────────────────── */}
            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%', padding: '15px',
                    borderRadius: 14, border: 'none',
                    background: saving ? '#93c5fd' : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                    color: '#fff', fontSize: 16, fontWeight: 700,
                    cursor: saving ? 'wait' : 'pointer',
                    boxShadow: saving ? 'none' : '0 6px 20px rgba(37,99,235,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    transition: 'all 0.2s',
                }}
            >
                {saving ? (
                    <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Salvando...</>
                ) : (
                    <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg> Salvar Configurações</>
                )}
            </button>
        </div>
    );
}
