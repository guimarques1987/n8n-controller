
import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, Sparkles, Plus, Image as ImageIcon, X, Loader2, 
  Wand2, Layers, AlertCircle, Ruler, Zap, Info, ArrowRight, LayoutTemplate, 
  DollarSign, Type, Tag, Calendar, Clock, Users, Truck, Megaphone, Palette, Copy, Check,
  Settings, ShieldCheck, Key, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    generateImageREST, 
    generateCreativePromptREST, 
    generateMarketingTextsREST
} from '../services/geminiRestService';
import { compressImage } from '../utils/imageUtils';
import { 
    QUALITY_OPTIONS, 
    EXACT_SIZE_PRESETS, 
    PROMO_IDEAS, 
    DAYS_OF_WEEK, 
    PROMO_CATEGORIES, 
    VISUAL_STYLES, 
    BACKGROUND_TYPES 
} from '../constants/imageGenConstants';
import { ReferenceImage, PromoData, PromoAdvanced } from '../types/imageGenTypes';

interface ImageGeneratorPanelProps {
    token: string | null;
    plano: string;
    lojistaId?: string | number | null;
    onUseImage?: (url: string, target: 'saudacao' | 'despedida') => void;
}

// Função auxiliar para redimensionar (Object-Fit: Cover)
const cropAndResize = (src: string, width: number, height: number): Promise<string> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(src), 3000);
    const img = new Image();
    img.crossOrigin = "anonymous"; 
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(src); return; }
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width / 2) - (img.width / 2) * scale;
        const y = (canvas.height / 2) - (img.height / 2) * scale;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch (e) { resolve(src); }
    };
    img.onerror = () => { clearTimeout(timer); resolve(src); };
    img.src = src;
  });
};

export default function ImageGeneratorPanel({ token, plano, lojistaId, onUseImage }: ImageGeneratorPanelProps) {
    const isPremium = plano === 'premium';
    
    // --- ESTADOS DE API KEY ---
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [savedKey, setSavedKey] = useState('');
    const [maskedKey, setMaskedKey] = useState('');
    const [hasKey, setHasKey] = useState(false);
    const [savingKey, setSavingKey] = useState(false);
    const [keyMsg, setKeyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [showKeySettings, setShowKeySettings] = useState(false);
    const [editingKey, setEditingKey] = useState(false);

    // --- ESTADOS DO GERADOR ---
    const [prompt, setPrompt] = useState('');
    const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('low');
    const [pixelSize, setPixelSize] = useState({ w: 1024, h: 1024 });
    const [activeSizeLabel, setActiveSizeLabel] = useState('QUADRADO');
    const [result, setResult] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [showComboMode, setShowComboMode] = useState(false);
    const [comboRefImages, setComboRefImages] = useState<any[]>([]);
    const [logo, setLogo] = useState<any>(null);
    const [promoData, setPromoData] = useState<PromoData>({ type: '', title: '', price: '', details: '' });
    const [promoAdvanced, setPromoAdvanced] = useState<PromoAdvanced>({
        startDate: '', endDate: '', validHours: '', days: [],
        discountType: 'fixed', quantityLimit: '', category: '', serves: 'individual', observations: '',
        delivery: { delivery: true, pickup: true, dineIn: true, fee: false, time: '' },
        marketing: { phrase: '', cta: '', tag: '' },
        visuals: { style: 'realista', background: 'lanchonete' }
    });
    const [generatedTexts, setGeneratedTexts] = useState<any>(null);
    const [isGeneratingText, setIsGeneratingText] = useState(false);
    const [editPrompt, setEditPrompt] = useState('');
    const [zoomImage, setZoomImage] = useState<string | null>(null);
    const [showDownloadOptions, setShowDownloadOptions] = useState(false);

    const comboInputRef = useRef<HTMLInputElement>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    // Carregar chave de API do banco (por lojista)
    useEffect(() => {
        if (!token) return;
        const url = lojistaId
            ? `/api/google-api-key?lojistaId=${lojistaId}`
            : '/api/google-api-key';
        fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                if (data.hasKey && data.apiKey) {
                    setSavedKey(data.apiKey);
                    setMaskedKey(data.maskedKey || data.apiKey.slice(0, 6) + '••••••••' + data.apiKey.slice(-4));
                    setHasKey(true);
                }
            })
            .catch(() => {});
    }, [token, lojistaId]);

    // Efeito para construir prompt automático no Modo Combo
    useEffect(() => {
        if (showComboMode) {
           const parts = [];
           parts.push(`Crie uma imagem publicitária profissional de ALTO IMPACTO.`);
           if (promoData.type) parts.push(`TIPO DE CAMPANHA: "${promoData.type}".`);
           if (promoData.title) parts.push(`PRODUTO: "${promoData.title}".`);
           if (promoData.price) {
             const priceStr = promoData.price.includes('R$') ? promoData.price : `R$ ${promoData.price}`;
             parts.push(`PREÇO EM DESTAQUE: "${priceStr}" (Moeda Real Brasileiro).`);
           }
           if (promoAdvanced.marketing.phrase) parts.push(`FRASE DESTAQUE: "${promoAdvanced.marketing.phrase}".`);
           if (promoData.details) parts.push(`INGREDIENTES/DETALHES: ${promoData.details}.`);
           
           let styleDesc = promoAdvanced.visuals.style === 'ilustrado' ? "Ilustração 3D vibrante." : "Fotografia gastronômica comercial.";
           parts.push(`ESTILO VISUAL: ${styleDesc}`);
           parts.push(`AMBIENTE/FUNDO: ${promoAdvanced.visuals.background}.`);
           parts.push(`FORMATO: ${activeSizeLabel} (${pixelSize.w}x${pixelSize.h}).`);
           setPrompt(parts.join(' '));
        }
    }, [showComboMode, promoData, promoAdvanced, pixelSize, activeSizeLabel]);

    const handleSaveKey = async () => {
        if (!apiKeyInput.trim()) return;
        setSavingKey(true);
        try {
            const body: any = { apiKey: apiKeyInput.trim() };
            if (lojistaId) body.lojistaId = lojistaId;
            const res = await fetch('/api/google-api-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar chave.');
            setSavedKey(apiKeyInput.trim());
            setMaskedKey(apiKeyInput.slice(0, 6) + '••••••••' + apiKeyInput.slice(-4));
            setHasKey(true);
            setEditingKey(false);
            setApiKeyInput('');
            setKeyMsg({ type: 'ok', text: 'Chave salva com sucesso!' });
            setTimeout(() => setKeyMsg(null), 3000);
        } catch (e: any) {
            setKeyMsg({ type: 'err', text: e.message || 'Erro ao salvar chave.' });
        } finally {
            setSavingKey(false);
        }
    };

    const handleGenerate = async () => {
        if (!hasKey) { setShowKeySettings(true); return; }
        const finalW = pixelSize.w || 1024;
        const finalH = pixelSize.h || 1024;
        
        setIsGenerating(true);
        setResult(null);
        setErrorMessage(null);
        setEditPrompt(""); 
        
        const refs: ReferenceImage[] = comboRefImages.map(r => ({ data: r.data, mimeType: r.mimeType }));
        const logoRef: ReferenceImage | undefined = logo ? { data: logo.data, mimeType: logo.mimeType } : undefined;

        try {
          const rawUrl = await generateImageREST(savedKey, prompt, finalW, finalH, refs, quality, logoRef);
          const processedUrl = await cropAndResize(rawUrl, finalW, finalH);
          setResult(processedUrl);
          setEditPrompt(""); 
        } catch (err: any) { 
          setErrorMessage(err.message); 
        } finally { 
          setIsGenerating(false); 
        }
    };

    const handleEditImage = async () => {
        if (!hasKey) { setShowKeySettings(true); return; }
        if (!result || !editPrompt.trim()) return;

        const finalW = pixelSize.w || 1024;
        const finalH = pixelSize.h || 1024;
        
        setIsGenerating(true);
        setErrorMessage(null);

        const currentImageBase64 = result.split(',')[1];
        const currentRef: ReferenceImage = { data: currentImageBase64, mimeType: 'image/jpeg' };
        const logoRef: ReferenceImage | undefined = logo ? { data: logo.data, mimeType: logo.mimeType } : undefined;

        const refinementPrompt = `ESTA É A IMAGEM ATUAL. FAÇA AS SEGUINTES ALTERAÇÕES: ${editPrompt}. Mantenha o estilo e os elementos principais, focando apenas no feedback solicitado.`;

        try {
          const rawUrl = await generateImageREST(savedKey, refinementPrompt, finalW, finalH, [currentRef], quality, logoRef);
          const processedUrl = await cropAndResize(rawUrl, finalW, finalH);
          setResult(processedUrl);
          setEditPrompt(""); 
        } catch (err: any) { 
          setErrorMessage("Erro ao refinar imagem: " + err.message); 
        } finally { 
          setIsGenerating(false); 
        }
    };

    const handleGenerateTextAI = async () => {
        if (!hasKey) { setShowKeySettings(true); return; }
        setIsGeneratingText(true);
        try {
            const context = `Produto: ${promoData.title}, Preço: ${promoData.price}, Detalhes: ${promoData.details}`;
            const texts = await generateMarketingTextsREST(savedKey, context);
            setGeneratedTexts(texts);
        } catch (e) {
            setErrorMessage("Erro ao gerar textos publicitários.");
        } finally {
            setIsGeneratingText(false);
        }
    };

    const handleImprovePrompt = async () => {
        if (!hasKey) { setShowKeySettings(true); return; }
        setIsEnhancing(true);
        try {
            const improved = await generateCreativePromptREST(savedKey, prompt);
            setPrompt(improved);
        } catch (e) {} finally { setIsEnhancing(false); }
    };

    const handleDownload = (qualityLevel: 'hd' | 'web') => {
        if (!result) return;
        const link = document.createElement('a');
        link.download = `propaganda-${qualityLevel}.jpg`;
        link.href = result; 
        link.click();
        setShowDownloadOptions(false);
    };

    return (
        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden relative">
            {!isPremium && (
                <div className="absolute inset-0 z-[100] bg-slate-900/60 backdrop-blur-[4px] flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-amber-400 p-4 rounded-full mb-4 shadow-xl">
                        <ShieldCheck className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-2">Exclusivo Plano Premium</h3>
                    <p className="text-slate-200 text-sm max-w-xs mb-8 font-medium">
                        A geração de propagandas avançada está disponível apenas para assinantes Premium.
                    </p>
                    <button className="bg-white text-slate-900 font-black px-8 py-3 rounded-2xl hover:bg-slate-50 transition-all shadow-2xl active:scale-95">
                        Conhecer Plano Premium
                    </button>
                </div>
            )}

            <div className="p-6 sm:px-10 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                <div className="flex items-center gap-3">
                    <div className="bg-[#e32619] p-2 rounded-xl shadow-lg shadow-red-500/20">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-900 leading-tight">Click AI Studio</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nano Banana Pro 2.5</p>
                    </div>
                </div>
                <button 
                  onClick={() => { setShowKeySettings(!showKeySettings); setEditingKey(false); }}
                  className={`p-3 rounded-xl transition-all ${showKeySettings ? 'bg-slate-200 text-slate-900' : 'bg-white text-slate-400 border border-slate-100 shadow-sm hover:text-slate-600'}`}
                >
                    <Settings className="w-5 h-5" />
                </button>
            </div>

            <AnimatePresence>
                {showKeySettings && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="bg-slate-50 border-b border-slate-100 overflow-hidden"
                    >
                        <div className="p-6 sm:px-10">
                            <div className="flex items-center gap-2 mb-3">
                                <Key className="w-4 h-4 text-slate-500" />
                                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-widest">Chave Gemini API</label>
                            </div>
                            {hasKey && !editingKey ? (
                                <div className="flex gap-2">
                                    <input readOnly value={maskedKey} className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-400 font-mono text-xs outline-none" />
                                    <button onClick={() => setEditingKey(true)} className="bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-100 transition-all">Alterar</button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <input type="password" placeholder="Cole sua chave AIza..." value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-[#e32619]/20" />
                                    <div className="flex items-center justify-between">
                                        <button onClick={handleSaveKey} disabled={savingKey || !apiKeyInput.trim()} className="bg-slate-900 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-black transition-all disabled:opacity-50">Salvar Chave</button>
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] font-black text-[#e32619] uppercase tracking-widest hover:underline">Pegar Chave Grátis</a>
                                    </div>
                                </div>
                            )}
                            {keyMsg && <p className={`mt-3 text-[10px] font-black uppercase ${keyMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{keyMsg.text}</p>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-12">
                <div className="lg:col-span-12 xl:col-span-5 p-6 sm:p-10 space-y-8 border-b xl:border-r border-slate-100">
                    <button onClick={() => setShowComboMode(!showComboMode)} className={`w-full py-5 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${showComboMode ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-100 text-slate-400 hover:border-indigo-100 hover:text-indigo-600'}`}>
                        <LayoutTemplate size={18}/> {showComboMode ? 'Fechar Criador Guiado' : 'Abrir Criador de Promoção'}
                    </button>

                    {showComboMode ? (
                        <div className="space-y-8 animate-in slide-in-from-top-4 duration-500">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Tag size={12}/> Dados do Produto</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <input placeholder="Título (Burguer)" value={promoData.title} onChange={e => setPromoData({...promoData, title: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold" />
                                    <input placeholder="Preço (29,90)" value={promoData.price} onChange={e => setPromoData({...promoData, price: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold" />
                                </div>
                                <textarea placeholder="Detalhes (Ingredientes, etc)" value={promoData.details} onChange={e => setPromoData({...promoData, details: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium h-20 resize-none" />
                            </div>

                            <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 space-y-4">
                                <h4 className="text-[10px] font-black text-indigo-500 uppercase flex items-center gap-2 tracking-widest"><Megaphone size={14}/> Marketing & IA</h4>
                                <button onClick={handleGenerateTextAI} disabled={isGeneratingText} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200">
                                    {isGeneratingText ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16} className="text-yellow-300"/>}
                                    Gerar Legendas & Copys com IA
                                </button>
                                {generatedTexts && (
                                    <div className="bg-white p-4 rounded-2xl border border-indigo-50 space-y-3 shadow-sm text-[10px]">
                                        <div className="flex justify-between items-center group">
                                            <span className="font-black text-indigo-500 uppercase">Banner: <span className="text-slate-900 font-bold ml-1">{generatedTexts.banner}</span></span>
                                            <button onClick={() => navigator.clipboard.writeText(generatedTexts.banner)} className="text-slate-300 hover:text-indigo-500"><Copy size={14}/></button>
                                        </div>
                                        <div className="h-px bg-slate-50"></div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-black text-green-600 uppercase">WhatsApp</span>
                                            <button onClick={() => navigator.clipboard.writeText(generatedTexts.whatsapp)} className="text-slate-300 hover:text-green-500"><Copy size={14}/></button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ImageIcon size={12}/> Fotos de Referência ({comboRefImages.length}/3)</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {comboRefImages.map((img, idx) => (
                                        <div key={idx} className="relative aspect-square rounded-xl border border-slate-100 overflow-hidden shadow-sm">
                                            <img src={img.url} className="w-full h-full object-cover" />
                                            <button onClick={() => setComboRefImages(p => p.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-red-500 text-white rounded-lg p-1 shadow-lg hover:bg-red-600 transition-colors"><X size={10}/></button>
                                        </div>
                                    ))}
                                    {comboRefImages.length < 3 && (
                                        <button onClick={() => comboInputRef.current?.click()} className="aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 hover:text-indigo-400 hover:border-indigo-200 transition-all group">
                                            <Plus size={24} className="group-hover:scale-110 transition-transform" />
                                        </button>
                                    )}
                                </div>
                                <input type="file" ref={comboInputRef} multiple onChange={async (e) => {
                                    if (e.target.files) {
                                      const files = Array.from(e.target.files);
                                      setErrorMessage(null);
                                      try {
                                        const results = await Promise.all(files.map(async (file) => {
                                          const compressed = await compressImage(file as File);
                                          return { url: `data:image/jpeg;base64,${compressed.data}`, data: compressed.data, mimeType: 'image/jpeg' };
                                        }));
                                        setComboRefImages(prev => [...prev, ...results].slice(0, 3));
                                      } catch (err) {
                                        setErrorMessage("Erro ao processar imagens.");
                                      }
                                    }
                                 }} className="hidden" accept="image/*" />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-8 animate-in fade-in duration-500">
                             <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">O que você quer criar?</label>
                                    <button onClick={handleImprovePrompt} disabled={!prompt || isEnhancing} className="text-[10px] font-black uppercase text-[#e32619] flex items-center gap-1.5 hover:opacity-80 transition-all disabled:opacity-30">
                                        {isEnhancing ? <Loader2 size={12} className="animate-spin"/> : <Wand2 size={12}/>}IA Turbinar Prompt
                                    </button>
                                </div>
                                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ex: Hambúrguer suculento em fundo dark com luz cinematográfica..." className="w-full p-5 bg-slate-900 text-white rounded-[1.5rem] text-xs font-medium h-40 resize-none outline-none focus:ring-4 focus:ring-red-500/10 shadow-2xl" />
                             </div>
                        </div>
                    )}

                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck size={12}/> Logotipo da Marca (Opcional)
                        </label>
                        {logo ? (
                            <div className="relative w-24 h-24 rounded-xl border border-slate-100 overflow-hidden shadow-sm group">
                                <img src={logo.url} className="w-full h-full object-contain p-2 bg-slate-50" />
                                <button onClick={() => setLogo(null)} className="absolute top-1 right-1 bg-red-500 text-white rounded-lg p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"><X size={10}/></button>
                            </div>
                        ) : (
                            <button onClick={() => logoInputRef.current?.click()} className="w-full py-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-2 text-slate-400 text-[10px] font-black uppercase hover:text-indigo-500 hover:border-indigo-100 transition-all">
                                <Plus size={14}/> Adicionar Logotipo (.png transparente)
                            </button>
                        )}
                        <input type="file" ref={logoInputRef} onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setErrorMessage(null);
                                    try {
                                    const compressed = await compressImage(file);
                                    setLogo({ url: `data:image/jpeg;base64,${compressed.data}`, data: compressed.data, mimeType: 'image/jpeg' });
                                    } catch (err) {
                                    setErrorMessage("Erro ao processar logotipo.");
                                    }
                                }
                            }} className="hidden" accept="image/*" />
                        <p className="text-[9px] text-slate-300 font-bold uppercase italic">* Preferencialmente em PNG com fundo transparente.</p>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Ruler size={12}/> Dimensões do Anúncio</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {EXACT_SIZE_PRESETS.map(preset => (
                                <button key={preset.label} onClick={() => { setPixelSize({ w: preset.w, h: preset.h }); setActiveSizeLabel(preset.label); }} className={`px-2 py-3 rounded-xl text-[8px] font-black uppercase tracking-tighter text-center transition-all border ${activeSizeLabel === preset.label ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50'}`}>
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleGenerate} disabled={isGenerating || (!prompt && !showComboMode)} className="w-full py-6 rounded-[2rem] bg-slate-950 text-white font-black uppercase tracking-[0.3em] text-[11px] shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-black disabled:opacity-30">
                        {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} className="text-[#e32619]"/>}
                        {isGenerating ? 'CRIANDO SUA ARTE...' : 'GERAR PROPAGANDA AGORA'}
                    </button>
                </div>

                <div className="lg:col-span-12 xl:col-span-7 bg-[#f8fafc] p-6 sm:p-10 flex flex-col items-center justify-center min-h-[500px] border-t xl:border-t-0">
                    <AnimatePresence mode="wait">
                        {!result && !isGenerating ? (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center space-y-4">
                                <div className="bg-white p-10 rounded-[4rem] shadow-sm border border-slate-100">
                                    <ImageIcon size={100} className="mx-auto text-slate-100" />
                                </div>
                                <p className="text-[10px] font-black uppercase text-slate-300 tracking-[0.3em]">Sua criação aparecerá aqui</p>
                            </motion.div>
                        ) : isGenerating ? (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-6">
                                <div className="relative">
                                    <div className="w-32 h-32 border-4 border-slate-100 border-t-[#e32619] rounded-full animate-spin"></div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Sparkles className="w-10 h-10 text-[#e32619] animate-pulse" />
                                    </div>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-black text-slate-900 uppercase tracking-widest">Nano Banana Pro 2.5</p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2 animate-pulse">Desenhando sua propaganda...</p>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-2xl flex flex-col items-center gap-6">
                                <div className="relative bg-white p-2 rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden group">
                                    <img src={result!} className="w-full h-auto rounded-[2rem] max-h-[70vh] object-contain cursor-zoom-in" onClick={() => setZoomImage(result)} />
                                    <div className="absolute top-6 left-6 bg-black/50 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                                        <Layers size={12}/> {pixelSize.w}x{pixelSize.h} PX
                                    </div>
                                    
                                    <div className="absolute bottom-6 right-6 flex flex-col items-end gap-3">
                                        {onUseImage && (
                                            <div className="flex gap-2 mb-1">
                                                <button 
                                                    onClick={() => onUseImage(result!, 'saudacao')}
                                                    className="bg-white/90 backdrop-blur-md text-slate-900 px-4 py-2 rounded-xl font-bold uppercase text-[9px] shadow-lg flex items-center gap-2 hover:bg-[#e32619] hover:text-white transition-all border border-slate-200"
                                                >
                                                    <Megaphone size={12}/> Usar na Saudação
                                                </button>
                                                <button 
                                                    onClick={() => onUseImage(result!, 'despedida')}
                                                    className="bg-white/90 backdrop-blur-md text-slate-900 px-4 py-2 rounded-xl font-bold uppercase text-[9px] shadow-lg flex items-center gap-2 hover:bg-[#e32619] hover:text-white transition-all border border-slate-200"
                                                >
                                                    <LogOut size={12}/> Usar na Despedida
                                                </button>
                                            </div>
                                        )}
                                        <div className="relative">
                                            <button onClick={() => setShowDownloadOptions(!showDownloadOptions)} className="bg-[#e32619] text-white px-8 py-4 rounded-2xl font-black uppercase text-[11px] shadow-2xl flex items-center gap-3 hover:scale-105 transition-all w-full">
                                                <Download size={18}/> Baixar Arte
                                            </button>
                                            {showDownloadOptions && (
                                                <div className="absolute bottom-full right-0 mb-3 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-2 z-10">
                                                    <button onClick={() => handleDownload('hd')} className="w-full px-5 py-4 text-left text-[11px] font-black uppercase hover:bg-slate-50 flex justify-between items-center border-b border-slate-50">
                                                        Resol. HD <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[8px]">MÁX</span>
                                                    </button>
                                                    <button onClick={() => handleDownload('web')} className="w-full px-5 py-4 text-left text-[11px] font-black uppercase hover:bg-slate-50 flex justify-between items-center text-slate-400">
                                                        Resol. Web <span className="bg-slate-100 text-slate-400 px-2 py-0.5 rounded text-[8px]">VELOZ</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="w-full bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl space-y-4">
                                     <div className="flex items-center gap-2 mb-2">
                                         <Wand2 className="text-[#e32619]" size={20}/>
                                         <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Deseja mudar algo nesta imagem?</h4>
                                     </div>
                                     <div className="relative">
                                         <textarea 
                                             value={editPrompt}
                                             onChange={(e) => setEditPrompt(e.target.value)}
                                             placeholder="Ex: Mude a cor do fundo para azul..."
                                             className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-medium focus:border-indigo-400 focus:bg-white outline-none transition-all pr-32 min-h-[100px] text-slate-900"
                                         />
                                         <button 
                                             onClick={handleEditImage}
                                             disabled={!editPrompt.trim() || isGenerating}
                                             className="absolute bottom-4 right-4 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] shadow-lg flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 disabled:grayscale transition-all"
                                         >
                                             {isGenerating ? "Processando..." : <><Sparkles size={14}/> Aplicar Alterações</>}
                                         </button>
                                     </div>
                                     <p className="text-[10px] text-slate-400 font-bold italic">A IA usará a imagem acima como base para aplicar seus pedidos.</p>
                                </div>

                                <button onClick={() => setResult(null)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-[#e32619] transition-all">Criar nova arte do zero</button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {errorMessage && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-red-600 text-white p-6 rounded-[2.5rem] shadow-2xl flex flex-col gap-4 z-[500] max-w-md animate-in slide-in-from-bottom-10">
                    <div className="flex items-start gap-4">
                       <AlertCircle size={32} className="shrink-0" />
                       <p className="text-xs font-bold leading-relaxed">{errorMessage}</p>
                    </div>
                    <button onClick={() => setErrorMessage(null)} className="w-full py-4 text-white/60 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors">Entendi</button>
                </div>
            )}

            {zoomImage && (
                <div className="fixed inset-0 z-[1000] bg-slate-950/95 flex items-center justify-center p-4 backdrop-blur-xl animate-in fade-in" onClick={() => setZoomImage(null)}>
                   <button className="absolute top-8 right-8 text-white/30 hover:text-white transition-colors"><X size={40}/></button>
                   <img src={zoomImage} className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95" />
                </div>
            )}
        </div>
    );
}
