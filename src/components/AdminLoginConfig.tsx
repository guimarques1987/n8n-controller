import React, { useState, useEffect } from 'react';
import { Save, Image as ImageIcon, LayoutTemplate, Palette, Type, ChevronDown, ChevronRight } from 'lucide-react';
import { LOGIN_UI_CONFIG } from './LoginPage';

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
    if (file.size > 300 * 1024) {
      setMessage({ text: 'Imagem muito pesada. Max 300kb.', type: 'error' });
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('foto', file);
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
      setMessage({ text: 'Configurações de Login salvas com sucesso no Baserow!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Erro ao salvar', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Recuperando configurações do Baserow...</div>;

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
                  <img src={urlLogo} alt="Logo" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-lg bg-gray-50 border border-gray-200 border-dashed flex items-center justify-center">
                  <span className="text-xs text-center text-gray-400">Sem<br/>Logo</span>
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
                <div className="relative inline-block">
                  <input type="file" accept="image/*" onChange={handleUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={uploading}/>
                  <button type="button" disabled={uploading} className="text-sm px-3 py-1.5 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center">
                    {uploading ? 'Enviando ao Baserow...' : 'Ou envie do Computador'}
                  </button>
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
                  {openSection === 'geral' ? <ChevronDown className="h-4 w-4 text-gray-500"/> : <ChevronRight className="h-4 w-4 text-gray-500"/>}
                </button>
                {openSection === 'geral' && (
                  <div className="p-4 bg-white space-y-4 border-t border-gray-200">
                    <ConfigField label="Subtítulo" configKey="subtitulo" value={jsonConfig.subtitulo} onChange={(v) => setJsonConfig({...jsonConfig, subtitulo: v})} defaultVal={LOGIN_UI_CONFIG.subtitulo} />
                    <ConfigField label="Rodapé" configKey="rodape" value={jsonConfig.rodape} onChange={(v) => setJsonConfig({...jsonConfig, rodape: v})} defaultVal={LOGIN_UI_CONFIG.rodape} />
                    <ConfigField label="Texto Aba Entrar" configKey="tabEntrar" value={jsonConfig.tabEntrar} onChange={(v) => setJsonConfig({...jsonConfig, tabEntrar: v})} defaultVal={LOGIN_UI_CONFIG.tabEntrar} />
                    <ConfigField label="Texto Aba Cadastrar" configKey="tabCadastrar" value={jsonConfig.tabCadastrar} onChange={(v) => setJsonConfig({...jsonConfig, tabCadastrar: v})} defaultVal={LOGIN_UI_CONFIG.tabCadastrar} />
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
                  {openSection === 'entrar' ? <ChevronDown className="h-4 w-4 text-gray-500"/> : <ChevronRight className="h-4 w-4 text-gray-500"/>}
                </button>
                {openSection === 'entrar' && (
                  <div className="p-4 bg-white space-y-4 border-t border-gray-200">
                    <ConfigField label="Label Email" configKey="labelEmail" value={jsonConfig.labelEmail} onChange={(v) => setJsonConfig({...jsonConfig, labelEmail: v})} defaultVal={LOGIN_UI_CONFIG.labelEmail} />
                    <ConfigField label="Placeholder Email" configKey="placeholderEmail" value={jsonConfig.placeholderEmail} onChange={(v) => setJsonConfig({...jsonConfig, placeholderEmail: v})} defaultVal={LOGIN_UI_CONFIG.placeholderEmail} />
                    <ConfigField label="Label Senha" configKey="labelSenha" value={jsonConfig.labelSenha} onChange={(v) => setJsonConfig({...jsonConfig, labelSenha: v})} defaultVal={LOGIN_UI_CONFIG.labelSenha} />
                    <ConfigField label="Placeholder Senha" configKey="placeholderSenha" value={jsonConfig.placeholderSenha} onChange={(v) => setJsonConfig({...jsonConfig, placeholderSenha: v})} defaultVal={LOGIN_UI_CONFIG.placeholderSenha} />
                    <ConfigField label="Botão Entrar" configKey="btnEntrar" value={jsonConfig.btnEntrar} onChange={(v) => setJsonConfig({...jsonConfig, btnEntrar: v})} defaultVal={LOGIN_UI_CONFIG.btnEntrar} />
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
                  {openSection === 'cadastrar' ? <ChevronDown className="h-4 w-4 text-gray-500"/> : <ChevronRight className="h-4 w-4 text-gray-500"/>}
                </button>
                {openSection === 'cadastrar' && (
                  <div className="p-4 bg-white space-y-4 border-t border-gray-200">
                    <ConfigField label="Label E-mail" configKey="labelSetupEmail" value={jsonConfig.labelSetupEmail} onChange={(v) => setJsonConfig({...jsonConfig, labelSetupEmail: v})} defaultVal={LOGIN_UI_CONFIG.labelSetupEmail} />
                    <ConfigField label="Placeholder E-mail" configKey="placeholderSetupEmail" value={jsonConfig.placeholderSetupEmail} onChange={(v) => setJsonConfig({...jsonConfig, placeholderSetupEmail: v})} defaultVal={LOGIN_UI_CONFIG.placeholderSetupEmail} />
                    <ConfigField label="Label Nova Senha" configKey="labelSetupNovaSenha" value={jsonConfig.labelSetupNovaSenha} onChange={(v) => setJsonConfig({...jsonConfig, labelSetupNovaSenha: v})} defaultVal={LOGIN_UI_CONFIG.labelSetupNovaSenha} />
                    <ConfigField label="Placeholder Nova Senha" configKey="placeholderSetupNovaSenha" value={jsonConfig.placeholderSetupNovaSenha} onChange={(v) => setJsonConfig({...jsonConfig, placeholderSetupNovaSenha: v})} defaultVal={LOGIN_UI_CONFIG.placeholderSetupNovaSenha} />
                    <ConfigField label="Label Confirmação" configKey="labelSetupConfirmar" value={jsonConfig.labelSetupConfirmar} onChange={(v) => setJsonConfig({...jsonConfig, labelSetupConfirmar: v})} defaultVal={LOGIN_UI_CONFIG.labelSetupConfirmar} />
                    <ConfigField label="Placeholder Confirmação" configKey="placeholderSetupConfirmar" value={jsonConfig.placeholderSetupConfirmar} onChange={(v) => setJsonConfig({...jsonConfig, placeholderSetupConfirmar: v})} defaultVal={LOGIN_UI_CONFIG.placeholderSetupConfirmar} />
                    <ConfigField label="Botão Cadastrar" configKey="btnCadastrar" value={jsonConfig.btnCadastrar} onChange={(v) => setJsonConfig({...jsonConfig, btnCadastrar: v})} defaultVal={LOGIN_UI_CONFIG.btnCadastrar} />
                    <ConfigField label="Botão Voltar Login" configKey="btnIrParaLogin" value={jsonConfig.btnIrParaLogin} onChange={(v) => setJsonConfig({...jsonConfig, btnIrParaLogin: v})} defaultVal={LOGIN_UI_CONFIG.btnIrParaLogin} />
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
                  {openSection === 'estilos' ? <ChevronDown className="h-4 w-4 text-gray-500"/> : <ChevronRight className="h-4 w-4 text-gray-500"/>}
                </button>
                {openSection === 'estilos' && (
                  <div className="p-4 bg-white space-y-4 border-t border-gray-200">
                    <ConfigField label="Cor Texto Botões" configKey="btnColor" type="color" value={jsonConfig.btnColor} onChange={(v) => setJsonConfig({...jsonConfig, btnColor: v})} defaultVal={LOGIN_UI_CONFIG.btnColor} />
                    <ConfigField label="Gradiente Botões" configKey="btnGradient" value={jsonConfig.btnGradient} onChange={(v) => setJsonConfig({...jsonConfig, btnGradient: v})} defaultVal={LOGIN_UI_CONFIG.btnGradient} />
                    <ConfigField label="Fundo do Card principal" configKey="cardBackground" type="color" value={jsonConfig.cardBackground} onChange={(v) => setJsonConfig({...jsonConfig, cardBackground: v})} defaultVal={LOGIN_UI_CONFIG.cardBackground} />
                    <ConfigField label="Borda do Card" configKey="cardBorder" value={jsonConfig.cardBorder} onChange={(v) => setJsonConfig({...jsonConfig, cardBorder: v})} defaultVal={LOGIN_UI_CONFIG.cardBorder} />
                    <ConfigField label="Sombra do Card" configKey="cardShadow" value={jsonConfig.cardShadow} onChange={(v) => setJsonConfig({...jsonConfig, cardShadow: v})} defaultVal={LOGIN_UI_CONFIG.cardShadow} />
                    <ConfigField label="Arredondamento do Card (px)" configKey="cardBorderRadius" type="number" value={jsonConfig.cardBorderRadius} onChange={(v) => setJsonConfig({...jsonConfig, cardBorderRadius: v})} defaultVal={LOGIN_UI_CONFIG.cardBorderRadius} />
                    
                    <div className="border border-gray-100 p-3 rounded bg-gray-50/50 space-y-3 my-2">
                        <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mb-2">Cores de Textos e Abas</h4>
                        <ConfigField label="Cor do Título Principal" configKey="corTitulo" type="color" value={jsonConfig.corTitulo} onChange={(v) => setJsonConfig({...jsonConfig, corTitulo: v})} defaultVal={LOGIN_UI_CONFIG.corTitulo} />
                        <ConfigField label="Cor do Subtítulo" configKey="corSubtitulo" type="color" value={jsonConfig.corSubtitulo} onChange={(v) => setJsonConfig({...jsonConfig, corSubtitulo: v})} defaultVal={LOGIN_UI_CONFIG.corSubtitulo} />
                        <ConfigField label="Cor das Labels (Ex: Email)" configKey="corLabels" type="color" value={jsonConfig.corLabels} onChange={(v) => setJsonConfig({...jsonConfig, corLabels: v})} defaultVal={LOGIN_UI_CONFIG.corLabels} />
                        <ConfigField label="Cor do Rodapé" configKey="corRodape" type="color" value={jsonConfig.corRodape} onChange={(v) => setJsonConfig({...jsonConfig, corRodape: v})} defaultVal={LOGIN_UI_CONFIG.corRodape} />
                        
                        <div className="pt-3 border-t border-gray-200 mt-2 space-y-3">
                            <ConfigField label="Fundo da Barra de Abas" configKey="corAbasFundo" type="color" value={jsonConfig.corAbasFundo} onChange={(v) => setJsonConfig({...jsonConfig, corAbasFundo: v})} defaultVal={LOGIN_UI_CONFIG.corAbasFundo} />
                            <ConfigField label="Cor do Texto das Abas" configKey="corAbasTexto" type="color" value={jsonConfig.corAbasTexto} onChange={(v) => setJsonConfig({...jsonConfig, corAbasTexto: v})} defaultVal={LOGIN_UI_CONFIG.corAbasTexto} />
                            <ConfigField label="Fundo da Aba Ativa" configKey="corAbasFundoAtiva" type="color" value={jsonConfig.corAbasFundoAtiva} onChange={(v) => setJsonConfig({...jsonConfig, corAbasFundoAtiva: v})} defaultVal={LOGIN_UI_CONFIG.corAbasFundoAtiva} />
                            <ConfigField label="Texto da Aba Ativa" configKey="corAbasTextoAtiva" type="color" value={jsonConfig.corAbasTextoAtiva} onChange={(v) => setJsonConfig({...jsonConfig, corAbasTextoAtiva: v})} defaultVal={LOGIN_UI_CONFIG.corAbasTextoAtiva} />
                        </div>
                    </div>

                    <div className="border border-gray-100 p-3 rounded bg-gray-50/50 space-y-3 my-2">
                        <ConfigField label="Fundo dos Campos (Inputs)" configKey="inputBackground" type="color" value={jsonConfig.inputBackground} onChange={(v) => setJsonConfig({...jsonConfig, inputBackground: v})} defaultVal={LOGIN_UI_CONFIG.inputBackground} />
                        <ConfigField label="Borda dos Campos" configKey="inputBorder" value={jsonConfig.inputBorder} onChange={(v) => setJsonConfig({...jsonConfig, inputBorder: v})} defaultVal={LOGIN_UI_CONFIG.inputBorder} />
                        <ConfigField label="Cor do Texto (Inputs)" configKey="inputText" type="color" value={jsonConfig.inputText} onChange={(v) => setJsonConfig({...jsonConfig, inputText: v})} defaultVal={LOGIN_UI_CONFIG.inputText} />
                    </div>
                    <ConfigField label="Família de Fontes" configKey="fontFamily" value={jsonConfig.fontFamily} onChange={(v) => setJsonConfig({...jsonConfig, fontFamily: v})} defaultVal={LOGIN_UI_CONFIG.fontFamily} />
                    <ConfigField label="Padding do Card" configKey="spacingCardPadding" value={jsonConfig.spacingCardPadding} onChange={(v) => setJsonConfig({...jsonConfig, spacingCardPadding: v})} defaultVal={LOGIN_UI_CONFIG.spacingCardPadding} />
                    <ConfigField label="Margem da Logo" configKey="spacingLogoMargin" value={jsonConfig.spacingLogoMargin} onChange={(v) => setJsonConfig({...jsonConfig, spacingLogoMargin: v})} defaultVal={LOGIN_UI_CONFIG.spacingLogoMargin} />
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
            {saving ? 'Salvando...' : <><Save className="h-4 w-4 mr-2" /> Salvar Configurações no Baserow</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// Subcomponente ajudante para renderizar os inputs do Json Config
function ConfigField({ label, configKey, value, defaultVal, onChange, type = "text" }: { label: string, configKey: string, value: any, defaultVal: any, onChange: (v: any) => void, type?: string }) {
  const currentValue = value !== undefined ? value : defaultVal;
  
  if (type === 'color') {
    const isHex = typeof currentValue === 'string' && currentValue.startsWith('#') && (currentValue.length === 4 || currentValue.length === 7);
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">{label} <span className="font-normal text-gray-400 opacity-50 ml-2">({configKey})</span></label>
        <div className="flex items-center gap-2">
          <input 
            type="color" 
            value={isHex ? currentValue : '#000000'}
            onChange={e => onChange(e.target.value)}
            title="Seletor visual (Apenas HEX)"
            className="h-9 w-10 p-1 cursor-pointer bg-white border border-gray-300 rounded"
          />
          <input 
            type="text" 
            value={currentValue}
            onChange={e => onChange(e.target.value)}
            placeholder={String(defaultVal)}
            className="flex-1 text-sm font-mono border border-gray-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none placeholder-gray-300"
          />
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
