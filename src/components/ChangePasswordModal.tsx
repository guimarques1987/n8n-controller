import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: Props) {
    const { token } = useAuth();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    if (!isOpen) return null;

    const handleClose = () => {
        setNewPassword('');
        setConfirmPassword('');
        setError('');
        setSuccess(false);
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ newPassword, confirmPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar senha');
            setSuccess(true);
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
        .cp-input:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.15) !important; outline: none; }
        .cp-btn-primary:hover:not(:disabled) { background: #4f46e5 !important; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.4) !important; }
        .cp-btn-cancel:hover { background: #f3f4f6 !important; }
      `}</style>

            <div style={{
                width: '100%', maxWidth: 420, borderRadius: 20,
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
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>Cadastrar Senha</h2>
                            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Defina sua senha de acesso</p>
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

                {/* Body */}
                <div style={{ padding: '24px 28px 28px' }}>
                    {success ? (
                        <div style={{ textAlign: 'center', padding: '12px 0' }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #22c55e, #10b981)',
                                margin: '0 auto 16px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>
                            <h3 style={{ margin: '0 0 8px', color: '#111', fontSize: 18, fontWeight: 700 }}>Senha cadastrada!</h3>
                            <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>
                                Sua nova senha foi salva com sucesso. Use-a no próximo login.
                            </p>
                            <button onClick={handleClose} className="cp-btn-primary" style={{
                                width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                                background: '#6366f1', color: '#fff', fontSize: 15, fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.2s ease',
                            }}>
                                Fechar
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            {/* Nova senha */}
                            <div style={{ marginBottom: 18 }}>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                                    Nova Senha
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="cp-input"
                                        type={showNew ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Mínimo 6 caracteres"
                                        required
                                        autoFocus
                                        style={{
                                            width: '100%', padding: '11px 44px 11px 14px', boxSizing: 'border-box',
                                            border: '1.5px solid #e5e7eb', borderRadius: 10,
                                            fontSize: 15, color: '#111', background: '#f9fafb',
                                            transition: 'all 0.2s ease',
                                        }}
                                    />
                                    <button type="button" onClick={() => setShowNew(!showNew)} style={{
                                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0,
                                    }}>
                                        {showNew
                                            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                        }
                                    </button>
                                </div>

                                {/* Strength bar */}
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

                            {/* Confirmar senha */}
                            <div style={{ marginBottom: 22 }}>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                                    Confirmar Senha
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        className="cp-input"
                                        type={showConfirm ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="Repita a nova senha"
                                        required
                                        style={{
                                            width: '100%', padding: '11px 44px 11px 14px', boxSizing: 'border-box',
                                            border: `1.5px solid ${confirmPassword && confirmPassword !== newPassword ? '#ef4444' : '#e5e7eb'}`,
                                            borderRadius: 10, fontSize: 15, color: '#111', background: '#f9fafb',
                                            transition: 'all 0.2s ease',
                                        }}
                                    />
                                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{
                                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0,
                                    }}>
                                        {showConfirm
                                            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                        }
                                    </button>
                                </div>
                                {confirmPassword && confirmPassword !== newPassword && (
                                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#ef4444' }}>As senhas não coincidem</p>
                                )}
                            </div>

                            {/* Error */}
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

                            {/* Buttons */}
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button type="button" onClick={handleClose} className="cp-btn-cancel" style={{
                                    flex: 1, padding: '12px', borderRadius: 12,
                                    border: '1.5px solid #e5e7eb', background: '#fff',
                                    color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                }}>
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || newPassword !== confirmPassword || newPassword.length < 6}
                                    className="cp-btn-primary"
                                    style={{
                                        flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                                        background: loading || newPassword !== confirmPassword || newPassword.length < 6
                                            ? '#c7d2fe' : '#6366f1',
                                        color: '#fff', fontSize: 15, fontWeight: 600,
                                        cursor: loading ? 'wait' : newPassword !== confirmPassword || newPassword.length < 6 ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    }}
                                >
                                    {loading ? (
                                        <>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                            </svg>
                                            Salvando...
                                        </>
                                    ) : 'Salvar Senha'}
                                </button>
                            </div>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
