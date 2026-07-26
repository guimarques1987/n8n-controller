import React, { useState, useEffect } from 'react';
import { Save, Image as ImageIcon, LayoutTemplate, Palette, Type, ChevronDown, ChevronRight } from 'lucide-react';
import { LOGIN_UI_CONFIG } from './LoginPage';
import { compressImage } from '../utils/imageUtils';

export default function AdminLoginConfig() {
  const [urlLogo, setUrlLogo] = useState('');
  const [titulo, setTitulo] = useState(LOGIN_UI_CONFIG.tituloDefault);
  const [corFundo, setCorFundo] = useState(LOGIN_UI_CONFIG.corFundoDefault);
  const [jsonConfig, setJsonConfig] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [uploading, setUploading] = useState(false);

  // Accordion state
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/public/login-config')
      .then(res => res.json())
      .then(data => {
        if (data.urlLogo) setUrlLogo(data.urlLogo);
        if (data.titulo) setTitulo(data.titulo);
        if (data.corFundo) setCorFundo(data.corFundo);

        // Load the rest of the dynamic config
        const { urlLogo: _, titulo: __, corFundo: ___, ...rest } = data;
        setJsonConfig(rest);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressedBoundary = await compressImage(file);
    setUploading(true);
    const formData = new FormData();
    formData.append('foto', compressedBoundary.file);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/robo-config/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUrlLogo(data.url);
      setMessage({ text: 'Logo enviada. Salve as configurações no botão abaixo.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage({ text: '', type: '' });
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/admin/login-config', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ urlLogo, titulo, corFundo, ...jsonConfig })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ text: 'Configurações de Login salvas com sucesso!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Erro ao salvar', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Recuperando configurações do sistema...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center gap-3">
          <LayoutTemplate className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-medium text-gray-900">Configuração da Tela de Login (Admin)</h2>
        </div>

        <div className="p-6 space-y-6 flex flex-col">
          {message.text && (
            <div className={`p-4 rounded-md text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {message.text}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-gray-400" /> Logomarca (Lado Direito)
            </label>
            <div className="flex items-center gap-4">
              {urlLogo ? (
                <div className="h-16 w-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center p-2">
                  <img src={urlLogo.startsWith('data:') || urlLogo.startsWith('http') || urlLogo.startsWith('/') ? urlLogo : `data:image/jpeg;base64,${urlLogo}`} alt="Logo" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-lg bg-gray-50 border border-gray-200 border-dashed flex items-center justify-center">
                  <span className="text-xs text-center text-gray-400">Sem<br />Logo</span>
                </div>
              )}
              <div className="flex-1">
                <input
                  type="text"
                  value={urlLogo}
                  onChange={e => setUrlLogo(e.target.value)}
                  placeholder="Link direto da imagem..."
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 mb-2 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
                <div className="flex items-center gap-3">
                  <div className="relative inline-block">
                    <input type="file" accept="image/*" onChange={handleUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={uploading} />
                    <button type="button" disabled={uploading} className="text-sm px-3 py-1.5 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center">
                      {uploading ? 'Enviando...' : 'Ou envie do Computador'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Tamanho:</span>
                    <input
                      type="number"
                      value={jsonConfig.logoSize || LOGIN_UI_CONFIG.logoSize}
                      onChange={e => setJsonConfig({ ...jsonConfig, logoSize: Number(e.target.value) })}
                      className="w-16 text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-xs text-gray-400">px</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Título do Sistema (Abaixo da Logo)</label>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Palette className="h-4 w-4 text-gray-400" /> Cor de Fundo
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={corFundo.startsWith('#') && (corFundo.length === 4 || corFundo.length === 7) ? corFundo : '#000000'}
                onChange={e => setCorFundo(e.target.value)}
                title="Seletor visual (Apenas HEX)"
                className="h-9 w-12 p-1 cursor-pointer bg-white border border-gray-300 rounded"
              />
              <input
                type="text"
                value={corFundo}
                onChange={e => setCorFundo(e.target.value)}
                placeholder="Ex: #0B0F19 ou rgb(11, 15, 25)"
                className="w-64 text-sm font-mono border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
              <button
                type="button"
                onClick={() => setCorFundo('#0B0F19')}
                className="text-xs text-indigo-600 hover:text-indigo-800 underline ml-2"
              >
                Voltar ao Padrão (Canvas Animado)
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Dica: Selecione a cor manualmente ou digite o HEX. O formato RGB/HEX customizado irá esconder a animação de estrelas pelo fundo sólido.</p>
          </div>

          {/* --- ACCORDIONS PARA CONFIGURAÇÕES EXTRAS --- */}
          <div className="mt-8 border-t border-gray-200 pt-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Type className="h-4 w-4 text-indigo-600" /> Textos e Layout Avançado
            </h3>

            <div className="space-y-4">
              {/* Seção 1: Textos Gerais */}
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <button
                  onClick={() => setOpenSection(openSection === 'geral' ? null : 'geral')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-medium text-sm text-gray-700">Textos Gerais</span>
                  {openSection === 'geral' ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                </button>
                {openSection === 'geral' && (
                  <div className="p-4 bg-white space-y-4 border-t border-gray-200">
                    <ConfigField label="Subtítulo" configKey="subtitulo" value={jsonConfig.subtitulo} onChange={(v) => setJsonConfig({ ...jsonConfig, subtitulo: v })} defaultVal={LOGIN_UI_CONFIG.subtitulo} />
                    <ConfigField label="Rodapé" configKey="rodape" value={jsonConfig.rodape} onChange={(v) => setJsonConfig({ ...jsonConfig, rodape: v })} defaultVal={LOGIN_UI_CONFIG.rodape} />
                    <ConfigField label="Texto Aba Entrar" configKey="tabEntrar" value={jsonConfig.tabEntrar} onChange={(v) => setJsonConfig({ ...jsonConfig, tabEntrar: v })} defaultVal={LOGIN_UI_CONFIG.tabEntrar} />
                    <ConfigField label="Texto Aba Cadastrar" configKey="tabCadastrar" value={jsonConfig.tabCadastrar} onChange={(v) => setJsonConfig({ ...jsonConfig, tabCadastrar: v })} defaultVal={LOGIN_UI_CONFIG.tabCadastrar} />
                  </div>
                )}
              </div>

              {/* Seção 2: Tela Entrar */}
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <button
                  onClick={() => setOpenSection(openSection === 'entrar' ? null : 'entrar')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-medium text-sm text-gray-700">Formulário: Entrar</span>
                  {openSection === 'entrar' ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                </button>
                {openSection === 'entrar' && (
                  <div className="p-4 bg-white space-y-4 border-t border-gray-200">
                    <ConfigField label="Label Email" configKey="labelEmail" value={jsonConfig.labelEmail} onChange={(v) => setJsonConfig({ ...jsonConfig, labelEmail: v })} defaultVal={LOGIN_UI_CONFIG.labelEmail} />
                    <ConfigField label="Placeholder Email" configKey="placeholderEmail" value={jsonConfig.placeholderEmail} onChange={(v) => setJsonConfig({ ...jsonConfig, placeholderEmail: v })} defaultVal={LOGIN_UI_CONFIG.placeholderEmail} />
                    <ConfigField label="Label Senha" configKey="labelSenha" value={jsonConfig.labelSenha} onChange={(v) => setJsonConfig({ ...jsonConfig, labelSenha: v })} defaultVal={LOGIN_UI_CONFIG.labelSenha} />
                    <ConfigField label="Placeholder Senha" configKey="placeholderSenha" value={jsonConfig.placeholderSenha} onChange={(v) => setJsonConfig({ ...jsonConfig, placeholderSenha: v })} defaultVal={LOGIN_UI_CONFIG.placeholderSenha} />
                    <ConfigField label="Botão Entrar" configKey="btnEntrar" value={jsonConfig.btnEntrar} onChange={(v) => setJsonConfig({ ...jsonConfig, btnEntrar: v })} defaultVal={LOGIN_UI_CONFIG.btnEntrar} />
                  </div>
                )}
              </div>

              {/* Seção 3: Tela Cadastrar */}
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <button
                  onClick={() => setOpenSection(openSection === 'cadastrar' ? null : 'cadastrar')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-medium text-sm text-gray-700">Formulário: Cadastrar</span>
                  {openSection === 'cadastrar' ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                </button>
                {openSection === 'cadastrar' && (
                  <div className="p-4 bg-white space-y-4 border-t border-gray-200">
                    <ConfigField label="Label E-mail" configKey="labelSetupEmail" value={jsonConfig.labelSetupEmail} onChange={(v) => setJsonConfig({ ...jsonConfig, labelSetupEmail: v })} defaultVal={LOGIN_UI_CONFIG.labelSetupEmail} />
                    <ConfigField label="Placeholder E-mail" configKey="placeholderSetupEmail" value={jsonConfig.placeholderSetupEmail} onChange={(v) => setJsonConfig({ ...jsonConfig, placeholderSetupEmail: v })} defaultVal={LOGIN_UI_CONFIG.placeholderSetupEmail} />
                    <ConfigField label="Label Nova Senha" configKey="labelSetupNovaSenha" value={jsonConfig.labelSetupNovaSenha} onChange={(v) => setJsonConfig({ ...jsonConfig, labelSetupNovaSenha: v })} defaultVal={LOGIN_UI_CONFIG.labelSetupNovaSenha} />
                    <ConfigField label="Placeholder Nova Senha" configKey="placeholderSetupNovaSenha" value={jsonConfig.placeholderSetupNovaSenha} onChange={(v) => setJsonConfig({ ...jsonConfig, placeholderSetupNovaSenha: v })} defaultVal={LOGIN_UI_CONFIG.placeholderSetupNovaSenha} />
                    <ConfigField label="Label Confirmação" configKey="labelSetupConfirmar" value={jsonConfig.labelSetupConfirmar} onChange={(v) => setJsonConfig({ ...jsonConfig, labelSetupConfirmar: v })} defaultVal={LOGIN_UI_CONFIG.labelSetupConfirmar} />
                    <ConfigField label="Placeholder Confirmação" configKey="placeholderSetupConfirmar" value={jsonConfig.placeholderSetupConfirmar} onChange={(v) => setJsonConfig({ ...jsonConfig, placeholderSetupConfirmar: v })} defaultVal={LOGIN_UI_CONFIG.placeholderSetupConfirmar} />
                    <ConfigField label="Botão Cadastrar" configKey="btnCadastrar" value={jsonConfig.btnCadastrar} onChange={(v) => setJsonConfig({ ...jsonConfig, btnCadastrar: v })} defaultVal={LOGIN_UI_CONFIG.btnCadastrar} />
                    <ConfigField label="Botão Voltar Login" configKey="btnIrParaLogin" value={jsonConfig.btnIrParaLogin} onChange={(v) => setJsonConfig({ ...jsonConfig, btnIrParaLogin: v })} defaultVal={LOGIN_UI_CONFIG.btnIrParaLogin} />
                  </div>
                )}
              </div>

              {/* Seção 4: Estilos Avançados */}
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <button
                  onClick={() => setOpenSection(openSection === 'estilos' ? null : 'estilos')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-medium text-sm text-gray-700">Visuais e Elementos</span>
                  {openSection === 'estilos' ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                </button>
                {openSection === 'estilos' && (
                  <div className="p-4 bg-white space-y-4 border-t border-gray-200">
                    {/* MINI MAPA VISUAL */}
                    <div className="bg-gray-900 rounded-xl p-8 flex items-center justify-center mb-8 relative group overflow-hidden border border-gray-800" style={{ backgroundColor: corFundo }}>
                      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]"></div>
                      <div className="relative w-48 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-2xl scale-110 pointer-events-none" style={{ backgroundColor: jsonConfig.cardBackground as any, border: jsonConfig.cardBorder as any, borderRadius: `${jsonConfig.cardBorderRadius || 12}px` }}>
                        <div className="w-8 h-8 mx-auto mb-3 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/30 flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-white" />
                        </div>
                        <div className="w-24 h-2 bg-white/80 mx-auto mb-1 rounded" style={{ backgroundColor: jsonConfig.corTitulo as any }}></div>
                        <div className="w-16 h-1.5 bg-white/40 mx-auto mb-4 rounded" style={{ backgroundColor: jsonConfig.corSubtitulo as any }}></div>

                        <div className="flex gap-1 mb-3">
                          <div className="flex-1 h-4 bg-white/20 rounded border border-white/10" style={{ backgroundColor: jsonConfig.corAbasFundoAtiva as any }}></div>
                          <div className="flex-1 h-4 bg-white/5 rounded border border-white/10"></div>
                        </div>

                        <div className="h-6 w-full bg-white/10 rounded mb-2 border border-white/5" style={{ backgroundColor: jsonConfig.inputBackground as any }}></div>
                        <div className="h-6 w-full bg-indigo-500 rounded-lg shadow-md" style={{ background: jsonConfig.btnGradient as any }}></div>

                        <div className="w-20 h-1 bg-white/20 mx-auto mt-4 rounded" style={{ backgroundColor: jsonConfig.corRodape as any }}></div>
                      </div>
                      <div className="absolute bottom-2 right-3 text-[10px] font-bold text-white/30 uppercase tracking-widest">Preview Digital</div>
                    </div>

                    <ConfigField label="Cor de Fundo do Botão" configKey="btnBackground" type="color" value={jsonConfig.btnBackground} onChange={(v) => {
                      // Ao mudar a cor simples, geramos um gradiente compatível automaticamente
                      const { hex } = parseRGBA(v);
                      const grad = `linear-gradient(135deg, ${hex} 0%, ${hex}dd 100%)`;
                      setJsonConfig({ ...jsonConfig, btnBackground: v, btnGradient: grad });
                    }} defaultVal={LOGIN_UI_CONFIG.btnBackground || '#6366f1'} />
                    <ConfigField label="Gradiente Personalizado (CSS)" configKey="btnGradient" value={jsonConfig.btnGradient} onChange={(v) => setJsonConfig({ ...jsonConfig, btnGradient: v })} defaultVal={LOGIN_UI_CONFIG.btnGradient} />
                    <ConfigField label="Cor Texto Botões" configKey="btnColor" type="color" value={jsonConfig.btnColor} onChange={(v) => setJsonConfig({ ...jsonConfig, btnColor: v })} defaultVal={LOGIN_UI_CONFIG.btnColor} />
                    <ConfigField label="Fundo do Card principal" configKey="cardBackground" type="color" value={jsonConfig.cardBackground} onChange={(v) => setJsonConfig({ ...jsonConfig, cardBackground: v })} defaultVal={LOGIN_UI_CONFIG.cardBackground} />
                    <ConfigField label="Borda do Card" configKey="cardBorder" value={jsonConfig.cardBorder} onChange={(v) => setJsonConfig({ ...jsonConfig, cardBorder: v })} defaultVal={LOGIN_UI_CONFIG.cardBorder} />
                    <ConfigField label="Sombra do Card" configKey="cardShadow" value={jsonConfig.cardShadow} onChange={(v) => setJsonConfig({ ...jsonConfig, cardShadow: v })} defaultVal={LOGIN_UI_CONFIG.cardShadow} />
                    <ConfigField label="Arredondamento do Card (px)" configKey="cardBorderRadius" type="number" value={jsonConfig.cardBorderRadius} onChange={(v) => setJsonConfig({ ...jsonConfig, cardBorderRadius: v })} defaultVal={LOGIN_UI_CONFIG.cardBorderRadius} />

                    <div className="border border-gray-100 p-3 rounded bg-gray-50/50 space-y-3 my-2">
                      <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mb-2">Cores de Textos e Abas</h4>
                      <ConfigField label="Cor do Título Principal" configKey="corTitulo" type="color" value={jsonConfig.corTitulo} onChange={(v) => setJsonConfig({ ...jsonConfig, corTitulo: v })} defaultVal={LOGIN_UI_CONFIG.corTitulo} />
                      <ConfigField label="Cor do Subtítulo" configKey="corSubtitulo" type="color" value={jsonConfig.corSubtitulo} onChange={(v) => setJsonConfig({ ...jsonConfig, corSubtitulo: v })} defaultVal={LOGIN_UI_CONFIG.corSubtitulo} />
                      <ConfigField label="Cor das Labels (Ex: Email)" configKey="corLabels" type="color" value={jsonConfig.corLabels} onChange={(v) => setJsonConfig({ ...jsonConfig, corLabels: v })} defaultVal={LOGIN_UI_CONFIG.corLabels} />
                      <ConfigField label="Cor do Rodapé" configKey="corRodape" type="color" value={jsonConfig.corRodape} onChange={(v) => setJsonConfig({ ...jsonConfig, corRodape: v })} defaultVal={LOGIN_UI_CONFIG.corRodape} />

                      <div className="pt-3 border-t border-gray-200 mt-2 space-y-3">
                        <ConfigField label="Fundo da Barra de Abas" configKey="corAbasFundo" type="color" value={jsonConfig.corAbasFundo} onChange={(v) => setJsonConfig({ ...jsonConfig, corAbasFundo: v })} defaultVal={LOGIN_UI_CONFIG.corAbasFundo} />
                        <ConfigField label="Cor do Texto das Abas" configKey="corAbasTexto" type="color" value={jsonConfig.corAbasTexto} onChange={(v) => setJsonConfig({ ...jsonConfig, corAbasTexto: v })} defaultVal={LOGIN_UI_CONFIG.corAbasTexto} />
                        <ConfigField label="Fundo da Aba Ativa" configKey="corAbasFundoAtiva" type="color" value={jsonConfig.corAbasFundoAtiva} onChange={(v) => setJsonConfig({ ...jsonConfig, corAbasFundoAtiva: v })} defaultVal={LOGIN_UI_CONFIG.corAbasFundoAtiva} />
                        <ConfigField label="Texto da Aba Ativa" configKey="corAbasTextoAtiva" type="color" value={jsonConfig.corAbasTextoAtiva} onChange={(v) => setJsonConfig({ ...jsonConfig, corAbasTextoAtiva: v })} defaultVal={LOGIN_UI_CONFIG.corAbasTextoAtiva} />
                      </div>
                    </div>

                    <div className="border border-gray-100 p-3 rounded bg-gray-50/50 space-y-3 my-2">
                      <ConfigField label="Fundo dos Campos (Inputs)" configKey="inputBackground" type="color" value={jsonConfig.inputBackground} onChange={(v) => setJsonConfig({ ...jsonConfig, inputBackground: v })} defaultVal={LOGIN_UI_CONFIG.inputBackground} />
                      <ConfigField label="Borda dos Campos" configKey="inputBorder" value={jsonConfig.inputBorder} onChange={(v) => setJsonConfig({ ...jsonConfig, inputBorder: v })} defaultVal={LOGIN_UI_CONFIG.inputBorder} />
                      <ConfigField label="Cor do Texto (Inputs)" configKey="inputText" type="color" value={jsonConfig.inputText} onChange={(v) => setJsonConfig({ ...jsonConfig, inputText: v })} defaultVal={LOGIN_UI_CONFIG.inputText} />
                    </div>
                    <ConfigField label="Família de Fontes" configKey="fontFamily" value={jsonConfig.fontFamily} onChange={(v) => setJsonConfig({ ...jsonConfig, fontFamily: v })} defaultVal={LOGIN_UI_CONFIG.fontFamily} />
                    <ConfigField label="Padding do Card" configKey="spacingCardPadding" value={jsonConfig.spacingCardPadding} onChange={(v) => setJsonConfig({ ...jsonConfig, spacingCardPadding: v })} defaultVal={LOGIN_UI_CONFIG.spacingCardPadding} />
                    <ConfigField label="Margem da Logo" configKey="spacingLogoMargin" value={jsonConfig.spacingLogoMargin} onChange={(v) => setJsonConfig({ ...jsonConfig, spacingLogoMargin: v })} defaultVal={LOGIN_UI_CONFIG.spacingLogoMargin} />
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center w-full px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : <><Save className="h-4 w-4 mr-2" /> Salvar Configurações</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper para converter RGBA para HEX e Alpha
function parseRGBA(rgba: string) {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return { hex: '#000000', alpha: 1 };

  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  const a = match[4] ? parseFloat(match[4]) : 1;

  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, alpha: a };
}

// Helper para converter HEX + Alpha para RGBA
function formatRGBA(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Helper para extrair valores RGBA individuais
function parseRGBFull(color: string) {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1
    };
  }
  const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
      a: 1
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function toHex(n: number) {
  return n.toString(16).padStart(2, '0');
}

// Subcomponente ajudante para renderizar os inputs do Json Config
function ConfigField({ label, configKey, value, defaultVal, onChange, type = "text" }: { label: string, configKey: string, value: any, defaultVal: any, onChange: (v: any) => void, type?: string }) {
  const currentValue = value !== undefined ? value : defaultVal;

  if (type === 'color') {
    const { r, g, b, a } = parseRGBFull(String(currentValue));
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

    const updateColor = (newR: number, newG: number, newB: number, newA: number) => {
      if (newA < 1) {
        onChange(`rgba(${newR}, ${newG}, ${newB}, ${newA})`);
      } else {
        const h = `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
        onChange(h);
      }
    };

    return (
      <div className="group relative">
        <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center justify-between">
          <span>{label}</span>
          <span className="font-normal text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">({configKey})</span>
        </label>
        <div className="space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-100 shadow-inner">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={hex}
              onChange={e => {
                const { r: nr, g: ng, b: nb } = parseRGBFull(e.target.value);
                updateColor(nr, ng, nb, a);
              }}
              className="h-10 w-12 p-1 cursor-pointer bg-white border border-gray-300 rounded shadow-sm"
            />

            {/* Campos RGB Individuais */}
            <div className="flex-1 grid grid-cols-4 gap-1.5">
              {[{ l: 'R', v: r, c: 'r' }, { l: 'G', v: g, c: 'g' }, { l: 'B', v: b, c: 'b' }].map(item => (
                <div key={item.l} className="flex flex-col">
                  <span className="text-[9px] text-gray-400 font-bold ml-1">{item.l}</span>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={item.v}
                    onChange={e => {
                      const val = Math.min(255, Math.max(0, parseInt(e.target.value) || 0));
                      if (item.c === 'r') updateColor(val, g, b, a);
                      if (item.c === 'g') updateColor(r, val, b, a);
                      if (item.c === 'b') updateColor(r, g, val, a);
                    }}
                    className="w-full text-center text-xs border border-gray-300 rounded px-1 py-1 focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                  />
                </div>
              ))}
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-400 font-bold ml-1">A%</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round(a * 100)}
                  onChange={e => {
                    const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) / 100;
                    updateColor(r, g, b, val);
                  }}
                  className="w-full text-center text-xs border border-gray-300 rounded px-1 py-1 focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={a}
              onChange={e => updateColor(r, g, b, parseFloat(e.target.value))}
              className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          <div className="text-[10px] font-mono text-gray-400 bg-white/50 px-2 py-0.5 rounded border border-gray-200 text-center truncate">
            {currentValue}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label} <span className="font-normal text-gray-400 opacity-50 ml-2">({configKey})</span></label>
      <input
        type={type}
        value={currentValue}
        onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={String(defaultVal)}
        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none placeholder-gray-300"
      />
    </div>
  );
}
