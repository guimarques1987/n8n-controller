import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'login' | 'setup';

export const LOGIN_UI_CONFIG = {
    // Textos - Geral
    tituloDefault: 'Cardápio Click Bot',
    subtitulo: 'Plataforma de Automação',
    tabEntrar: 'Entrar',
    tabCadastrar: 'Cadastrar Senha',
    rodape: 'Acesso restrito - n8n Controller SaaS',

    // Textos - Aba Entrar
    labelEmail: 'EMAIL',
    placeholderEmail: 'seu@email.com',
    labelSenha: 'SENHA',
    placeholderSenha: 'Sua senha',
    btnEntrar: 'Entrar',

    // Textos - Aba Cadastrar
    labelSetupEmail: 'SEU E-MAIL',
    placeholderSetupEmail: 'email@cadastrado.com',
    labelSetupNovaSenha: 'NOVA SENHA',
    placeholderSetupNovaSenha: 'Mínimo 6 caracteres',
    labelSetupConfirmar: 'CONFIRMAR SENHA',
    placeholderSetupConfirmar: 'Repita a senha',
    btnCadastrar: 'Cadastrar Senha',
    btnIrParaLogin: 'Ir para Login',

    // Visuais
    corFundoDefault: '#0B0F19',
    btnGradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    btnColor: '#ffffff',
    cardBackground: 'rgba(255,255,255,0.06)',
    cardBorder: '1px solid rgba(255,255,255,0.13)',
    cardShadow: '0 32px 80px rgba(0,0,0,0.5)',
    cardBorderRadius: 24,
    fontFamily: "'Inter', -apple-system, sans-serif",
    spacingCardPadding: '0 28px 32px',
    spacingLogoMargin: '36px 36px 28px',
    
    // Cores Textos e Abas
    corTitulo: '#ffffff',
    corSubtitulo: 'rgba(255,255,255,0.5)',
    corAbasFundo: 'rgba(255,255,255,0.07)',
    corAbasTexto: 'rgba(255,255,255,0.5)',
    corAbasFundoAtiva: '#ffffff',
    corAbasTextoAtiva: '#6366f1',
    corLabels: 'rgba(255,255,255,0.7)',
    corRodape: 'rgba(255,255,255,0.3)',
    
    // Inputs
    inputBackground: 'rgba(255,255,255,0.08)',
    inputBorder: '1px solid rgba(255,255,255,0.12)',
    inputText: '#ffffff',
};

export default function LoginPage() {
    const { login } = useAuth();
    const [mode, setMode] = useState<Mode>('login');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [loginConfig, setLoginConfig] = useState<typeof LOGIN_UI_CONFIG & { urlLogo?: string, titulo?: string, corFundo?: string }>({ 
        urlLogo: '', 
        titulo: LOGIN_UI_CONFIG.tituloDefault, 
        corFundo: LOGIN_UI_CONFIG.corFundoDefault,
        ...LOGIN_UI_CONFIG 
    });

    useEffect(() => {
        fetch('/api/public/login-config')
            .then(res => res.json())
            .then(data => {
                if (data.titulo || data.corFundo || data.urlLogo || data.btnEntrar) {
                    setLoginConfig(prev => ({ ...prev, ...data }));
                }
            })
            .catch(console.error);
    }, []);

    // Setup fields
    const [setupEmail, setSetupEmail] = useState('');
    const [setupNewPassword, setSetupNewPassword] = useState('');
    const [setupConfirm, setSetupConfirm] = useState('');
    const [showNewPw, setShowNewPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);
    const [setupLoading, setSetupLoading] = useState(false);
    const [setupError, setSetupError] = useState('');
    const [setupSuccess, setSetupSuccess] = useState(false);

    const cardRef = useRef<HTMLDivElement>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const setupEmailRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (mode === 'login') emailRef.current?.focus();
        else setupEmailRef.current?.focus();
    }, [mode]);

    // Animated gradient background
    useEffect(() => {
        if (loginConfig.corFundo !== LOGIN_UI_CONFIG.corFundoDefault) return; // Se tem cor customizada, não anima o canvas
        let frame = 0;
        let animId: number;
        const canvas = document.getElementById('bg-canvas') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        resize();
        window.addEventListener('resize', resize);
        const animate = () => {
            frame++;
            const t = frame * 0.005;
            const grad = ctx.createRadialGradient(
                canvas.width * (0.5 + 0.3 * Math.sin(t)), canvas.height * (0.4 + 0.2 * Math.cos(t * 1.3)), 0,
                canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.9
            );
            grad.addColorStop(0, '#1e1b4b');
            grad.addColorStop(0.4, '#0f0c29');
            grad.addColorStop(0.7, '#24243e');
            grad.addColorStop(1, '#302b63');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            animId = requestAnimationFrame(animate);
        };
        animate();
        return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
    }, [loginConfig.corFundo]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        setLoginLoading(true);
        try {
            await login(email.trim(), password);
        } catch (err: any) {
            setLoginError(err.message || 'Erro ao entrar');
            cardRef.current?.animate([
                { transform: 'translateX(0)' }, { transform: 'translateX(-8px)' },
                { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' },
                { transform: 'translateX(4px)' }, { transform: 'translateX(0)' },
            ], { duration: 400, easing: 'ease-out' });
        } finally {
            setLoginLoading(false);
        }
    };

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setSetupError('');
        setSetupLoading(true);
        try {
            const res = await fetch('/api/auth/setup-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: setupEmail.trim(), newPassword: setupNewPassword, confirmPassword: setupConfirm }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar senha');
            setSetupSuccess(true);
        } catch (err: any) {
            setSetupError(err.message);
            cardRef.current?.animate([
                { transform: 'translateX(0)' }, { transform: 'translateX(-8px)' },
                { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' },
                { transform: 'translateX(4px)' }, { transform: 'translateX(0)' },
            ], { duration: 400, easing: 'ease-out' });
        } finally {
            setSetupLoading(false);
        }
    };

    const switchMode = (m: Mode) => {
        setMode(m);
        setLoginError('');
        setSetupError('');
        setSetupSuccess(false);
        setSetupEmail('');
        setSetupNewPassword('');
        setSetupConfirm('');
    };

    // Password strength
    const strength = (() => {
        if (setupNewPassword.length === 0) return 0;
        if (setupNewPassword.length < 6) return 1;
        if (setupNewPassword.length < 8) return 2;
        const hasUpper = /[A-Z]/.test(setupNewPassword);
        const hasNum = /[0-9]/.test(setupNewPassword);
        const hasSym = /[^A-Za-z0-9]/.test(setupNewPassword);
        return 2 + (hasUpper ? 1 : 0) + (hasNum ? 1 : 0) + (hasSym ? 1 : 0);
    })();
    const strengthLabels = ['', 'Fraca', 'Razoável', 'Boa', 'Forte', 'Excelente'];
    const strengthColors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

    const s = (base: React.CSSProperties): React.CSSProperties => base;

    return (
        <div style={s({ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', fontFamily: loginConfig.fontFamily, backgroundColor: loginConfig.corFundo })}>
            {loginConfig.corFundo === LOGIN_UI_CONFIG.corFundoDefault && (
                <canvas id="bg-canvas" style={{ position: 'fixed', inset: 0, zIndex: 0 }} />
            )}

            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .lp-input { transition: border-color 0.2s, box-shadow 0.2s; outline: none; }
        .lp-input:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.2) !important; }
        .lp-btn { transition: all 0.2s ease; }
        .lp-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,102,241,0.45) !important; }
        .lp-link { transition: color 0.2s; }
        .lp-link:hover { color: #a5b4fc !important; }
        .tab-btn { transition: all 0.2s; }
      `}</style>

            {/* Card */}
            <div ref={cardRef} style={s({
                position: 'relative', zIndex: 1,
                width: '100%', maxWidth: 400, margin: '0 16px',
                background: loginConfig.cardBackground,
                backdropFilter: 'blur(24px)',
                border: loginConfig.cardBorder,
                borderRadius: loginConfig.cardBorderRadius,
                boxShadow: loginConfig.cardShadow,
                overflow: 'hidden',
            })}>
                {/* Logo area */}
                <div style={s({ padding: loginConfig.spacingLogoMargin, textAlign: 'center' })}>
                    {loginConfig.urlLogo ? (
                        <div style={s({
                            width: 64, height: 64, margin: '0 auto 20px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        })}>
                            <img src={loginConfig.urlLogo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        </div>
                    ) : (
                        <div style={s({
                            width: 64, height: 64, borderRadius: 18, margin: '0 auto 20px',
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
                        })}>
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                <line x1="8" y1="21" x2="16" y2="21" />
                                <line x1="12" y1="17" x2="12" y2="21" />
                            </svg>
                        </div>
                    )}
                    <h1 style={s({ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: loginConfig.corTitulo, letterSpacing: '-0.3px' })}>
                        {loginConfig.titulo}
                    </h1>
                    <p style={s({ margin: 0, fontSize: 13, color: loginConfig.corSubtitulo, fontWeight: 500 })}>
                        {loginConfig.subtitulo}
                    </p>
                </div>

                {/* Tabs */}
                <div style={s({
                    display: 'flex', margin: '0 24px 24px',
                    background: loginConfig.corAbasFundo,
                    borderRadius: 12, padding: 4,
                })}>
                    {([['login', loginConfig.tabEntrar], ['setup', loginConfig.tabCadastrar]] as [Mode, string][]).map(([m, label]) => (
                        <button
                            key={m}
                            className="tab-btn"
                            onClick={() => switchMode(m)}
                            style={s({
                                flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 600,
                                border: 'none', borderRadius: 9, cursor: 'pointer',
                                background: mode === m ? loginConfig.corAbasFundoAtiva : 'transparent',
                                color: mode === m ? loginConfig.corAbasTextoAtiva : loginConfig.corAbasTexto,
                                boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                            })}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={s({ padding: loginConfig.spacingCardPadding })}>

                    {/* ── LOGIN MODE ─────────────────────────────────────── */}
                    {mode === 'login' && (
                        <form onSubmit={handleLogin}>
                            {/* Email */}
                            <div style={s({ marginBottom: 16 })}>
                                <label style={s({ display: 'block', fontSize: 12, fontWeight: 600, color: loginConfig.corLabels, marginBottom: 7, letterSpacing: '0.5px', textTransform: 'uppercase' })}>{loginConfig.labelEmail}</label>
                                <input
                                    ref={emailRef}
                                    className="lp-input"
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder={loginConfig.placeholderEmail}
                                    required
                                    autoComplete="username"
                                    style={s({
                                        width: '100%', padding: '13px 16px', boxSizing: 'border-box',
                                        background: loginConfig.inputBackground, border: loginConfig.inputBorder,
                                        borderRadius: 12, color: loginConfig.inputText, fontSize: 15,
                                    })}
                                />
                            </div>
                            {/* Senha */}
                            <div style={s({ marginBottom: 20 })}>
                                <label style={s({ display: 'block', fontSize: 12, fontWeight: 600, color: loginConfig.corLabels, marginBottom: 7, letterSpacing: '0.5px', textTransform: 'uppercase' })}>{loginConfig.labelSenha}</label>
                                <div style={s({ position: 'relative' })}>
                                    <input
                                        className="lp-input"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder={loginConfig.placeholderSenha}
                                        required
                                        autoComplete="current-password"
                                        style={s({
                                            width: '100%', padding: '13px 48px 13px 16px', boxSizing: 'border-box',
                                            background: loginConfig.inputBackground, border: loginConfig.inputBorder,
                                            borderRadius: 12, color: loginConfig.inputText, fontSize: 15,
                                        })}
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={s({ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: loginConfig.corLabels, padding: 0 })}>
                                        {showPassword
                                            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                        }
                                    </button>
                                </div>
                            </div>

                            {/* Error */}
                            {loginError && (
                                <div style={s({ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 })}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    <span style={s({ color: '#fca5a5', fontSize: 13 })}>{loginError}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loginLoading}
                                className="lp-btn"
                                style={s({
                                    width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                                    background: loginConfig.btnGradient,
                                    color: loginConfig.btnColor, fontSize: 15, fontWeight: 700, cursor: loginLoading ? 'wait' : 'pointer',
                                    boxShadow: '0 6px 20px rgba(99,102,241,0.35)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    opacity: loginLoading ? 0.7 : 1,
                                })}
                            >
                                {loginLoading ? (
                                    <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Entrando...</>
                                ) : loginConfig.btnEntrar}
                            </button>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

                            <p style={s({ textAlign: 'center', marginTop: 20, fontSize: 12, color: loginConfig.corRodape })}>
                                {loginConfig.rodape}
                            </p>
                        </form>
                    )}

                    {/* ── SETUP MODE ─────────────────────────────────────── */}
                    {mode === 'setup' && (
                        <>
                            {setupSuccess ? (
                                <div style={s({ textAlign: 'center', padding: '8px 0 8px' })}>
                                    <div style={s({ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #10b981)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(34,197,94,0.35)' })}>
                                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    </div>
                                    <h3 style={s({ margin: '0 0 8px', color: loginConfig.corTitulo, fontSize: 18, fontWeight: 700 })}>Senha cadastrada!</h3>
                                    <p style={s({ margin: '0 0 24px', color: loginConfig.corSubtitulo, fontSize: 14 })}>
                                        Sua senha foi salva. Agora você pode fazer login.
                                    </p>
                                    <button
                                        onClick={() => switchMode('login')}
                                        className="lp-btn"
                                        style={s({
                                            width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                                            background: loginConfig.btnGradient,
                                            color: loginConfig.btnColor, fontSize: 15, fontWeight: 700, cursor: 'pointer',
                                            boxShadow: '0 6px 20px rgba(99,102,241,0.35)',
                                        })}
                                    >
                                        {loginConfig.btnIrParaLogin}
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleSetup}>
                                    {/* Info banner */}
                                    <div style={s({ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' })}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                                        <span style={s({ color: '#c7d2fe', fontSize: 12, lineHeight: 1.5 })}>
                                            Cadastre a senha que você usará para acessar o sistema. Seu e-mail deve estar registrado na Cardápio Click.
                                        </span>
                                    </div>

                                    {/* Email */}
                                    <div style={s({ marginBottom: 16 })}>
                                        <label style={s({ display: 'block', fontSize: 12, fontWeight: 600, color: loginConfig.corLabels, marginBottom: 7, letterSpacing: '0.5px', textTransform: 'uppercase' })}>{loginConfig.labelSetupEmail}</label>
                                        <input
                                            ref={setupEmailRef}
                                            className="lp-input"
                                            type="email"
                                            value={setupEmail}
                                            onChange={e => setSetupEmail(e.target.value)}
                                            placeholder={loginConfig.placeholderSetupEmail}
                                            required
                                            style={s({ width: '100%', padding: '13px 16px', boxSizing: 'border-box', background: loginConfig.inputBackground, border: loginConfig.inputBorder, borderRadius: 12, color: loginConfig.inputText, fontSize: 15 })}
                                        />
                                    </div>

                                    {/* Nova senha */}
                                    <div style={s({ marginBottom: 16 })}>
                                        <label style={s({ display: 'block', fontSize: 12, fontWeight: 600, color: loginConfig.corLabels, marginBottom: 7, letterSpacing: '0.5px', textTransform: 'uppercase' })}>{loginConfig.labelSetupNovaSenha}</label>
                                        <div style={s({ position: 'relative' })}>
                                            <input
                                                className="lp-input"
                                                type={showNewPw ? 'text' : 'password'}
                                                value={setupNewPassword}
                                                onChange={e => setSetupNewPassword(e.target.value)}
                                                placeholder={loginConfig.placeholderSetupNovaSenha}
                                                required
                                                style={s({ width: '100%', padding: '13px 48px 13px 16px', boxSizing: 'border-box', background: loginConfig.inputBackground, border: loginConfig.inputBorder, borderRadius: 12, color: loginConfig.inputText, fontSize: 15 })}
                                            />
                                            <button type="button" onClick={() => setShowNewPw(!showNewPw)} style={s({ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: loginConfig.corLabels, padding: 0 })}>
                                                {showNewPw
                                                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                                }
                                            </button>
                                        </div>
                                        {setupNewPassword.length > 0 && (
                                            <div style={s({ marginTop: 8 })}>
                                                <div style={s({ display: 'flex', gap: 4, marginBottom: 4 })}>
                                                    {[1, 2, 3, 4, 5].map(i => (
                                                        <div key={i} style={s({ flex: 1, height: 3, borderRadius: 9999, background: i <= strength ? strengthColors[Math.min(strength, 5)] : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' })} />
                                                    ))}
                                                </div>
                                                <span style={s({ fontSize: 11, color: strengthColors[Math.min(strength, 5)], fontWeight: 600 })}>
                                                    {strengthLabels[Math.min(strength, 5)]}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Confirmar */}
                                    <div style={s({ marginBottom: 20 })}>
                                        <label style={s({ display: 'block', fontSize: 12, fontWeight: 600, color: loginConfig.corLabels, marginBottom: 7, letterSpacing: '0.5px', textTransform: 'uppercase' })}>{loginConfig.labelSetupConfirmar}</label>
                                        <div style={s({ position: 'relative' })}>
                                            <input
                                                className="lp-input"
                                                type={showConfirmPw ? 'text' : 'password'}
                                                value={setupConfirm}
                                                onChange={e => setSetupConfirm(e.target.value)}
                                                placeholder={loginConfig.placeholderSetupConfirmar}
                                                required
                                                style={s({ width: '100%', padding: '13px 48px 13px 16px', boxSizing: 'border-box', background: loginConfig.inputBackground, border: `1px solid ${setupConfirm && setupConfirm !== setupNewPassword ? 'rgba(239,68,68,0.5)' : loginConfig.inputBorder.split('solid ')[1] || 'transparent'}`, borderRadius: 12, color: loginConfig.inputText, fontSize: 15 })}
                                            />
                                            <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} style={s({ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: loginConfig.corLabels, padding: 0 })}>
                                                {showConfirmPw
                                                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                                }
                                            </button>
                                        </div>
                                        {setupConfirm && setupConfirm !== setupNewPassword && (
                                            <p style={s({ margin: '6px 0 0', fontSize: 12, color: '#f87171' })}>As senhas não coincidem</p>
                                        )}
                                    </div>

                                    {/* Error */}
                                    {setupError && (
                                        <div style={s({ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 })}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                            <span style={s({ color: '#fca5a5', fontSize: 13, lineHeight: 1.5 })}>{setupError}</span>
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={setupLoading || setupNewPassword !== setupConfirm || setupNewPassword.length < 6 || !setupEmail}
                                        className="lp-btn"
                                        style={s({
                                            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                                            background: setupLoading || setupNewPassword !== setupConfirm || setupNewPassword.length < 6 || !setupEmail
                                                ? 'rgba(99,102,241,0.35)' : loginConfig.btnGradient,
                                            color: loginConfig.btnColor, fontSize: 15, fontWeight: 700,
                                            cursor: setupLoading ? 'wait' : (setupNewPassword !== setupConfirm || setupNewPassword.length < 6 || !setupEmail) ? 'not-allowed' : 'pointer',
                                            boxShadow: '0 6px 20px rgba(99,102,241,0.25)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        })}
                                    >
                                        {setupLoading ? (
                                            <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Salvando...</>
                                        ) : loginConfig.btnCadastrar}
                                    </button>
                                </form>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
