import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

type Tab = 'email' | 'senha';

export default function ChangePasswordModal({ isOpen, onClose }: Props) {
    const { token, user, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('senha');

    // Senha
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Email
    const [newEmail, setNewEmail] = useState('');
    const [confirmEmail, setConfirmEmail] = useState('');

    // Estado geral
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    if (!isOpen) return null;

    const handleClose = () => {
        setNewPassword(''); setConfirmPassword('');
        setNewEmail(''); setConfirmEmail('');
        setError(''); setSuccess('');
        setShowNew(false); setShowConfirm(false);
        onClose();
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (newPassword !== confirmPassword) return setError('As senhas não coincidem');
        if (newPassword.length < 6) return setError('A senha deve ter pelo menos 6 caracteres');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ newPassword, confirmPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar senha');
            setSuccess('Senha alterada com sucesso! Use-a no próximo login.');
            setNewPassword(''); setConfirmPassword('');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChangeEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (!newEmail.trim()) return setError('Informe o novo email');
        if (newEmail.trim() !== confirmEmail.trim()) return setError('Os emails não coincidem');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail.trim())) return setError('Email inválido');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/change-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ newEmail: newEmail.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar email');
            setSuccess('Email alterado com sucesso! Você será desconectado para fazer login novamente.');
            setNewEmail(''); setConfirmEmail('');
            setTimeout(() => { logout(); }, 2500);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const strength = (() => {
        if (newPassword.length === 0) return 0;
        if (newPassword.length < 6) return 1;
        if (newPassword.length < 8) return 2;
        const hasUpper = /[A-Z]/.test(newPassword);
        const hasNumber = /[0-9]/.test(newPassword);
        const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
        return 2 + (hasUpper ? 1 : 0) + (hasNumber ? 1 : 0) + (hasSpecial ? 1 : 0);
    })();
    const strengthLabel = ['', 'Fraca', 'Razoável', 'Boa', 'Forte', 'Excelente'][Math.min(strength, 5)];
    const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'][Math.min(strength, 5)];

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '11px 44px 11px 14px', boxSizing: 'border-box',
        border: '1.5px solid #e5e7eb', borderRadius: 10,
        fontSize: 15, color: '#111', background: '#f9fafb',
        transition: 'all 0.2s ease',
    };
    const labelStyle: React.CSSProperties = {
        display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8,
    };

    const EyeIcon = ({ open }: { open: boolean }) => open
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            fontFamily: "'Inter', -apple-system, sans-serif",
            animation: 'fadeIn 0.2s ease-out',
        }}>
            <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .cp-input:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.15) !important; outline: none; }
        .cp-btn-primary:hover:not(:disabled) { background: #4f46e5 !important; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.4) !important; }
        .cp-btn-cancel:hover { background: #f3f4f6 !important; }
        .cp-tab:hover { background: #f3f4f6; }
      `}</style>

            <div style={{
                width: '100%', maxWidth: 440, borderRadius: 20,
                background: '#fff',
                boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    padding: '24px 28px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: 'rgba(255,255,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>Minha Conta</h2>
                            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                                {user?.email || 'Gerenciar credenciais de acesso'}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose} style={{
                        background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                        width: 32, height: 32, cursor: 'pointer', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                    {([['senha', '🔒 Alterar Senha'], ['email', '✉️ Alterar Email']] as [Tab, string][]).map(([tab, label]) => (
                        <button
                            key={tab}
                            className="cp-tab"
                            onClick={() => { setActiveTab(tab); setError(''); setSuccess(''); }}
                            style={{
                                flex: 1, padding: '14px 8px', border: 'none', cursor: 'pointer',
                                fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                                background: activeTab === tab ? '#fff' : 'transparent',
                                color: activeTab === tab ? '#6366f1' : '#6b7280',
                                borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                                marginBottom: -1,
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ padding: '24px 28px 28px' }}>

                    {/* Mensagem de sucesso */}
                    {success && (
                        <div style={{
                            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
                            padding: '12px 16px', marginBottom: 18,
                            display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                            <span style={{ color: '#15803d', fontSize: 13, fontWeight: 500 }}>{success}</span>
                        </div>
                    )}

                    {/* Mensagem de erro */}
                    {error && (
                        <div style={{
                            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                            padding: '10px 14px', marginBottom: 18,
                            display: 'flex', alignItems: 'center', gap: 8,
                            animation: 'shake 0.4s ease-out',
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span style={{ color: '#dc2626', fontSize: 13 }}>{error}</span>
                        </div>
                    )}

                    {/* ABA SENHA */}
                    {activeTab === 'senha' && (
                        <form onSubmit={handleChangePassword}>
                            <div style={{ marginBottom: 18 }}>
                                <label style={labelStyle}>Nova Senha</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="cp-input"
                                        type={showNew ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Mínimo 6 caracteres"
                                        required autoFocus
                                        style={inputStyle}
                                    />
                                    <button type="button" onClick={() => setShowNew(!showNew)} style={{
                                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0,
                                    }}>
                                        <EyeIcon open={showNew} />
                                    </button>
                                </div>
                                {newPassword.length > 0 && (
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                                            {[1, 2, 3, 4, 5].map(i => (
                                                <div key={i} style={{
                                                    flex: 1, height: 3, borderRadius: 9999,
                                                    background: i <= strength ? strengthColor : '#e5e7eb',
                                                    transition: 'background 0.3s',
                                                }} />
                                            ))}
                                        </div>
                                        <span style={{ fontSize: 11, color: strengthColor, fontWeight: 600 }}>{strengthLabel}</span>
                                    </div>
                                )}
                            </div>

                            <div style={{ marginBottom: 22 }}>
                                <label style={labelStyle}>Confirmar Nova Senha</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="cp-input"
                                        type={showConfirm ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="Repita a nova senha"
                                        required
                                        style={{
                                            ...inputStyle,
                                            borderColor: confirmPassword && confirmPassword !== newPassword ? '#ef4444' : '#e5e7eb',
                                        }}
                                    />
                                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{
                                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0,
                                    }}>
                                        <EyeIcon open={showConfirm} />
                                    </button>
                                </div>
                                {confirmPassword && confirmPassword !== newPassword && (
                                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#ef4444' }}>As senhas não coincidem</p>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button type="button" onClick={handleClose} className="cp-btn-cancel" style={{
                                    flex: 1, padding: '12px', borderRadius: 12,
                                    border: '1.5px solid #e5e7eb', background: '#fff',
                                    color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                }}>Cancelar</button>
                                <button
                                    type="submit"
                                    disabled={loading || newPassword !== confirmPassword || newPassword.length < 6}
                                    className="cp-btn-primary"
                                    style={{
                                        flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                                        background: (loading || newPassword !== confirmPassword || newPassword.length < 6) ? '#c7d2fe' : '#6366f1',
                                        color: '#fff', fontSize: 15, fontWeight: 600,
                                        cursor: loading ? 'wait' : (newPassword !== confirmPassword || newPassword.length < 6) ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    }}
                                >
                                    {loading
                                        ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>Salvando...</>
                                        : '🔒 Salvar Senha'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ABA EMAIL */}
                    {activeTab === 'email' && (
                        <form onSubmit={handleChangeEmail}>
                            <div style={{
                                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                                padding: '10px 14px', marginBottom: 18,
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                            }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                <span style={{ color: '#92400e', fontSize: 12, lineHeight: 1.5 }}>
                                    Após salvar, você será desconectado automaticamente para fazer login com o novo email.
                                </span>
                            </div>

                            <div style={{ marginBottom: 18 }}>
                                <label style={labelStyle}>Novo Email</label>
                                <input
                                    className="cp-input"
                                    type="email"
                                    value={newEmail}
                                    onChange={e => setNewEmail(e.target.value)}
                                    placeholder="novo@email.com"
                                    required autoFocus
                                    style={{ ...inputStyle, padding: '11px 14px' }}
                                />
                            </div>

                            <div style={{ marginBottom: 22 }}>
                                <label style={labelStyle}>Confirmar Novo Email</label>
                                <input
                                    className="cp-input"
                                    type="email"
                                    value={confirmEmail}
                                    onChange={e => setConfirmEmail(e.target.value)}
                                    placeholder="Repita o novo email"
                                    required
                                    style={{
                                        ...inputStyle, padding: '11px 14px',
                                        borderColor: confirmEmail && confirmEmail !== newEmail ? '#ef4444' : '#e5e7eb',
                                    }}
                                />
                                {confirmEmail && confirmEmail !== newEmail && (
                                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#ef4444' }}>Os emails não coincidem</p>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: 10 }}>
                                <button type="button" onClick={handleClose} className="cp-btn-cancel" style={{
                                    flex: 1, padding: '12px', borderRadius: 12,
                                    border: '1.5px solid #e5e7eb', background: '#fff',
                                    color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                }}>Cancelar</button>
                                <button
                                    type="submit"
                                    disabled={loading || !newEmail || newEmail !== confirmEmail}
                                    className="cp-btn-primary"
                                    style={{
                                        flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                                        background: (loading || !newEmail || newEmail !== confirmEmail) ? '#c7d2fe' : '#6366f1',
                                        color: '#fff', fontSize: 15, fontWeight: 600,
                                        cursor: loading ? 'wait' : (!newEmail || newEmail !== confirmEmail) ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    }}
                                >
                                    {loading
                                        ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>Salvando...</>
                                        : '✉️ Salvar Email'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
