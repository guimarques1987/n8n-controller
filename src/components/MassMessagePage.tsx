import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ErrorBoundary from './ErrorBoundary';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PhoneNumber { phoneNumber: string; displayPhoneNumber: string; verifiedName: string; }
interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  buttons?: { type: string; text: string; url?: string; phoneNumber?: string }[];
  example?: { header_handle?: string[]; body_text?: string[][]; header_text?: string[] };
}
interface Template {
  name: string;
  language: string;
  status: string;
  category: string;
  components: TemplateComponent[];
}
interface Recipient { phone: string; vars: string[]; }
interface Campaign {
  id: number;
  nome: string;
  template_name: string;
  phone_from: string;
  scheduled_at: string | null;
  sent_at: string | null;
  status: string;
  total: number;
  total_sent: number;
  total_failed: number;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function extractVars(text: string): string[] {
  const matches = [...(text?.matchAll(/\{\{\s*([^}]+)\s*\}\}/g) || [])];
  return Array.from(new Set(matches.map(m => m[1].trim())));
}

function getTemplateVarCount(template: Template): { header: number; body: number; hasImage: boolean; hasVideo: boolean } {
  let header = 0, body = 0, hasImage = false, hasVideo = false;
  for (const c of template.components) {
    if (c.type === 'HEADER') {
      if (c.format === 'IMAGE') hasImage = true;
      else if (c.format === 'VIDEO') hasVideo = true;
      else if (c.format === 'TEXT') header = extractVars(c.text || '').length;
    }
    if (c.type === 'BODY') body = extractVars(c.text || '').length;
  }
  return { header, body, hasImage, hasVideo };
}

function parseCSV(text: string): Recipient[] {
  const lines = text.trim().split('\n');
  const result: Recipient[] = [];
  for (const line of lines) {
    if (!line.trim() || line.toLowerCase().startsWith('telefone')) continue;
    const cols = line.split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
    const phone = cols[0]?.replace(/\D/g, '');
    if (!phone || phone.length < 10) continue;
    const vars = cols.slice(1);
    result.push({ phone: phone.startsWith('55') ? phone : `55${phone}`, vars });
  }
  return result;
}

function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    pending:   ['#e0e7ef', '#374151'],
    scheduled: ['#ede9fe', '#6d28d9'],
    sending:   ['#fef9c3', '#92400e'],
    done:      ['#dcfce7', '#166534'],
    failed:    ['#fee2e2', '#991b1b'],
    cancelled: ['#f3f4f6', '#6b7280'],
  };
  const [bg, color] = map[status] || ['#f3f4f6', '#6b7280'];
  return (
    <span style={{ background: bg, color, borderRadius: 20, padding: '2px 12px', fontSize: 12, fontWeight: 700 }}>
      {status === 'scheduled' ? '🕐 Agendado' : status === 'sending' ? '⏳ Enviando' : status === 'done' ? '✅ Concluído' : status === 'failed' ? '❌ Falhou' : status === 'cancelled' ? '🚫 Cancelado' : '⏸ Pendente'}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MassMessagePage({ externalLojistaId }: { externalLojistaId?: string }) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'nova' | 'historico' | 'logs' | 'templates' | 'config'>('nova');
  const [logCampaign, setLogCampaign] = useState<any | null>(null);
  const [logCampaignList, setLogCampaignList] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Config
  const [ycToken, setYcToken] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<{ 
    configured: boolean; preview: string; 
    metaConfigured?: boolean; metaTokenPreview?: string; metaPhoneId?: string; metaWabaId?: string;
    provedorDisparo?: string;
  } | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);

  // Phone numbers & templates
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');

  // Campaign form
  const [campaignName, setCampaignName] = useState('');
  const [selectedPhone, setSelectedPhone] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [scheduleType, setScheduleType] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [csvText, setCsvText] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // Template Creation
  const [newTplName, setNewTplName] = useState('');
  const [newTplHeaderType, setNewTplHeaderType] = useState<'NONE'|'TEXT'|'IMAGE'>('NONE');
  const [newTplHeaderText, setNewTplHeaderText] = useState('');
  const [newTplHeaderImage, setNewTplHeaderImage] = useState('');
  const [newTplBody, setNewTplBody] = useState('');
  const [newTplFooter, setNewTplFooter] = useState('');
  const [newTplCategory, setNewTplCategory] = useState('MARKETING');
  const [newTplLanguage, setNewTplLanguage] = useState('pt_BR');
  const [newTplButtonType, setNewTplButtonType] = useState<'NONE'|'URL'|'PHONE'|'QUICK_REPLY'>('NONE');
  const [newTplButtonUrlType, setNewTplButtonUrlType] = useState<'STATIC'|'DYNAMIC'>('STATIC');
  const [newTplButtonText, setNewTplButtonText] = useState('');
  const [newTplButtonValue, setNewTplButtonValue] = useState('');
  const [newTplBodySamples, setNewTplBodySamples] = useState<string[]>([]);
  const [creatingTpl, setCreatingTpl] = useState(false);
  const [tplCreationError, setTplCreationError] = useState('');
  const [showTplForm, setShowTplForm] = useState(false);

  // History
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [manualVars, setManualVars] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState<Record<number, boolean>>({});
  
  const [newYcToken, setNewYcToken] = useState('');
  const [newMetaToken, setNewMetaToken] = useState('');
  const [newMetaPhoneId, setNewMetaPhoneId] = useState('');
  const [newMetaWabaId, setNewMetaWabaId] = useState('');
  const [newProvedorDisparo, setNewProvedorDisparo] = useState('YCLOUD');

  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [timezoneSaved, setTimezoneSaved] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [webhookStatus, setWebhookStatus] = useState('active');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);

  const lojistaParam = externalLojistaId ? `?lojistaId=${externalLojistaId}` : '';
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Load phone numbers & templates
  const loadYCloudData = async () => {
    setLoadingData(true);
    setDataError('');
    try {
      const [pRes, tRes] = await Promise.all([
        fetch(`/api/ycloud/phone-numbers${lojistaParam}`, { headers: authHeaders }),
        fetch(`/api/ycloud/templates${lojistaParam}`, { headers: authHeaders }),
      ]);
      if (pRes.ok) {
        const p = await pRes.json();
        setPhoneNumbers(p.items || p.data || []);
      } else {
        const err = await pRes.json();
        setDataError(err.error || 'Erro ao carregar dados do YCloud');
        setActiveTab('config');
      }
      if (tRes.ok) {
        const t = await tRes.json();
        setTemplates(t.items || t.data || []);
      }
    } catch {
      setDataError('Erro de conexão com o servidor');
    }
    setLoadingData(false);
  };

  // Load history
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/ycloud/campaigns${lojistaParam}`, { headers: authHeaders });
      const data = await res.json();
      if (Array.isArray(data)) {
        setCampaigns(data);
      } else {
        console.error('Expected array of campaigns, got:', data);
        setCampaigns([]);
      }
    } catch (e) {}
    setLoadingHistory(false);
  };

  // Sync status
  const syncStatus = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await fetch(`/api/ycloud/campaigns/${id}/sync${lojistaParam ? lojistaParam : ''}`, { method: 'POST', headers: authHeaders });
      if (res.ok) {
        await loadHistory();
      }
    } catch {}
    setSyncingId(null);
  };

  // Carrega status do token automaticamente do banco
  const loadTokenStatus = async () => {
    setLoadingToken(true);
    try {
      const res = await fetch(`/api/ycloud/token${lojistaParam}`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setTokenStatus(data);
        if (data.provedorDisparo) setNewProvedorDisparo(data.provedorDisparo);
        if (data.metaPhoneId) setNewMetaPhoneId(data.metaPhoneId);
        if (data.metaWabaId) setNewMetaWabaId(data.metaWabaId);
      }
      const tzRes = await fetch(`/api/ycloud/timezone${lojistaParam}`, { headers: authHeaders });
      if (tzRes.ok) {
        const tzData = await tzRes.json();
        if (tzData.timezone) setTimezone(tzData.timezone);
      }
      
      const whRes = await fetch(`/api/ycloud/webhook-config${lojistaParam}`, { headers: authHeaders });
      if (whRes.ok) {
        const whData = await whRes.json();
        setWebhookUrl(whData.url || '');
        setWebhookEvents(whData.enabledEvents || []);
        setWebhookStatus(whData.status || 'disabled');
      }
    } catch {}
    setLoadingToken(false);
  };

  useEffect(() => {
    loadTokenStatus();
    loadYCloudData();
    loadHistory();
  }, [externalLojistaId]);

  // Parse CSV on change
  useEffect(() => {
    if (csvText.trim()) setRecipients(parseCSV(csvText));
  }, [csvText]);

  // Assistente Inteligente de Categoria
  const [aiTip, setAiTip] = useState('');

  useEffect(() => {
    if (!newTplBody) {
      setAiTip('');
      return;
    }
    const lowerBody = newTplBody.toLowerCase();
    const isMarketing = /promoção|promocao|oferta|desconto|novidade|compre|aproveite|conheça|imperdível|especial|cupom|grátis|brinde/.test(lowerBody);
    const isUtility = /pedido|compra|agendamento|consulta|status|confirmado|pagamento|código|entrega|senha|conta|atualização/.test(lowerBody);
    const isGeneric = newTplBody.length < 30 && !lowerBody.includes('{{');

    if (isMarketing || isGeneric) {
      setNewTplCategory('MARKETING');
      setAiTip(isGeneric ? '✨ IA: Texto genérico ou muito curto geralmente é classificado pela Meta como Marketing.' : '✨ IA: Termos promocionais detectados. Categoria alterada para Marketing.');
    } else if (isUtility) {
      setNewTplCategory('UTILITY');
      setAiTip('✨ IA: Termos transacionais detectados. Categoria alterada para Utilidade.');
    } else {
      setAiTip('');
    }
  }, [newTplBody]);

  // Save token
  const saveToken = async () => {
    if (!newYcToken && !newMetaToken && !newMetaPhoneId && !newMetaWabaId) {
      alert('Preencha alguma credencial para salvar.');
      return;
    }
    setSavingToken(true);
    try {
      const res = await fetch(`/api/ycloud/token${lojistaParam ? lojistaParam : ''}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: newYcToken || undefined,
          metaToken: newMetaToken || undefined,
          metaPhoneId: newMetaPhoneId || undefined,
          metaWabaId: newMetaWabaId || undefined,
          provedorDisparo: newProvedorDisparo
        })
      });
      if (res.ok) {
        setNewYcToken('');
        setNewMetaToken('');
        setTokenSaved(true);
        setTimeout(() => setTokenSaved(false), 3000);
        await loadTokenStatus();
        await loadYCloudData();
      }
    } catch {}
    setSavingToken(false);
  };

  // Save timezone
  const handleSaveTimezone = async () => {
    setSavingTimezone(true);
    try {
      const res = await fetch(`/api/ycloud/timezone${lojistaParam ? lojistaParam : ''}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      if (res.ok) {
        setTimezoneSaved(true);
        setTimeout(() => setTimezoneSaved(false), 3000);
      }
    } catch {}
    setSavingTimezone(false);
  };

  // Save webhook
  const handleSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      const res = await fetch(`/api/ycloud/webhook-config${lojistaParam ? lojistaParam : ''}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, enabledEvents: webhookEvents, status: webhookStatus }),
      });
      if (res.ok) {
        setWebhookSaved(true);
        setTimeout(() => setWebhookSaved(false), 3000);
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao salvar webhook na YCloud');
      }
    } catch {
      alert('Erro de conexão ao salvar webhook');
    }
    setSavingWebhook(false);
  };

  // Add manual recipient
  const addManualRecipient = () => {
    const phone = manualPhone.replace(/\D/g, '');
    if (!phone || phone.length < 10) return;
    const normalized = phone.startsWith('55') ? phone : `55${phone}`;
    if (recipients.some(r => r.phone === normalized)) return;
    const varInfo = selectedTemplate ? getTemplateVarCount(selectedTemplate) : { header: 0, body: 0, hasImage: false, hasVideo: false };
    const totalVars = varInfo.header + varInfo.body;
    
    const varsToAdd = Array.from({ length: totalVars }, (_, i) => manualVars[i] || '');
    setRecipients(prev => [...prev, { phone: normalized, vars: varsToAdd }]);
    setManualPhone('');
    setManualVars([]);
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string || '');
    reader.readAsText(file, 'UTF-8');
  };

  // Update recipient var
  const updateRecipientVar = (rIdx: number, vIdx: number, value: string) => {
    setRecipients(prev => prev.map((r, i) => i === rIdx ? { ...r, vars: r.vars.map((v, j) => j === vIdx ? value : v) } : r));
  };

  // Remove recipient
  const removeRecipient = (idx: number) => setRecipients(prev => prev.filter((_, i) => i !== idx));

  // Send campaign
  const handleSend = async () => {
    if (!campaignName || !selectedPhone || !selectedTemplate || !recipients.length) {
      alert('Preencha todos os campos obrigatórios: nome, número, template e destinatários.');
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const templateComps = selectedTemplate.components.map(c => ({
        ...c,
        imageUrl: c.type === 'HEADER' && c.format === 'IMAGE' ? imageUrl : undefined,
        videoUrl: c.type === 'HEADER' && c.format === 'VIDEO' ? videoUrl : undefined,
        variables: c.type === 'BODY' ? Array(extractVars(c.text || '').length).fill(null) :
                   c.type === 'HEADER' && c.format === 'TEXT' ? Array(extractVars(c.text || '').length).fill(null) : undefined,
      }));

      const payload = {
        nome: campaignName,
        template_name: selectedTemplate.name,
        template_lang: selectedTemplate.language,
        phone_from: selectedPhone,
        recipients,
        components: templateComps,
        scheduled_at: scheduleType === 'later' ? scheduledAt : null,
      };

      const res = await fetch(`/api/ycloud/campaigns${lojistaParam}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setSendResult({ success: true, message: data.message });
        setCampaignName('');
        setRecipients([]);
        setCsvText('');
        setSelectedTemplate(null);
        setImageUrl('');
        setVideoUrl('');
        await loadHistory();
        setActiveTab('historico');
      } else {
        setSendResult({ success: false, message: data.error || 'Erro ao enviar' });
      }
    } catch (e: any) {
      setSendResult({ success: false, message: e.message });
    }
    setSending(false);
  };

  // Helper for tracking body samples
  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewTplBody(val);
    const varsCount = extractVars(val).length;
    if (varsCount !== newTplBodySamples.length) {
      setNewTplBodySamples(prev => {
        const next = [...prev];
        next.length = varsCount;
        for (let i = 0; i < varsCount; i++) {
          if (!next[i]) next[i] = '';
        }
        return next;
      });
    }
  };

  // Create template
  const handleCreateTemplate = async () => {
    if (!newTplName || !newTplBody) {
      setTplCreationError('Nome e Corpo da mensagem são obrigatórios.');
      return;
    }

    const vars = extractVars(newTplBody);
    let finalBody = newTplBody;
    vars.forEach((varName, idx) => {
      const safeVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{\\{\\s*${safeVarName}\\s*\\}\\}`, 'g');
      finalBody = finalBody.replace(regex, `{{${idx + 1}}}`);
    });

    const trimmedBody = finalBody.trim();
    if (trimmedBody.match(/^\{\{\d+\}\}/) || trimmedBody.match(/\{\{\d+\}\}$/)) {
      setTplCreationError('Formato inválido: As variáveis não podem ser colocadas no início ou no fim da mensagem. Coloque um texto antes e depois.');
      return;
    }

    setCreatingTpl(true);
    setTplCreationError('');

    const components: any[] = [];

    if (newTplHeaderType === 'TEXT' && newTplHeaderText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: newTplHeaderText });
    } else if (newTplHeaderType === 'IMAGE' && newTplHeaderImage) {
      components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [newTplHeaderImage] } });
    }

    const bodyComp: any = { type: 'BODY', text: finalBody };
    if (vars.length > 0) {
      // Validate if all samples are provided
      if (newTplBodySamples.some(s => !s.trim())) {
        setTplCreationError('Por favor, preencha as amostras para todas as variáveis do corpo da mensagem.');
        setCreatingTpl(false);
        return;
      }
      bodyComp.example = { body_text: [newTplBodySamples] };
    }
    components.push(bodyComp);

    if (newTplFooter) {
      components.push({ type: 'FOOTER', text: newTplFooter });
    }

    if (newTplButtonType !== 'NONE' && newTplButtonText) {
      if (newTplButtonType === 'URL' && newTplButtonValue) {
        const btnUrl: any = { type: 'URL', text: newTplButtonText, url: newTplButtonValue };
        if (newTplButtonUrlType === 'DYNAMIC' && newTplButtonValue.includes('{{1}}')) {
          btnUrl.example = [ newTplButtonValue.replace('{{1}}', '12345') ];
        }
        components.push({ type: 'BUTTONS', buttons: [btnUrl] });
      } else if (newTplButtonType === 'PHONE' && newTplButtonValue) {
        components.push({ type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: newTplButtonText, phone_number: newTplButtonValue }] });
      } else if (newTplButtonType === 'QUICK_REPLY') {
        components.push({ type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: newTplButtonText }] });
      }
    }

    try {
      const res = await fetch(`/api/ycloud/templates${lojistaParam}`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTplName, category: newTplCategory, language: newTplLanguage, components })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar template');
      
      setNewTplName('');
      setNewTplBody('');
      setNewTplBodySamples([]);
      setNewTplHeaderText('');
      setNewTplHeaderImage('');
      setNewTplFooter('');
      setNewTplButtonType('NONE');
      setNewTplButtonText('');
      setNewTplButtonValue('');
      setNewTplHeaderType('NONE');
      setShowTplForm(false);
      await loadYCloudData();
      alert('Template enviado para análise da Meta com sucesso!');
    } catch (e: any) {
      setTplCreationError(e.message);
    }
    setCreatingTpl(false);
  };

  // Cancel campaign
  const handleCancel = async (id: number) => {
    if (!confirm('Cancelar este agendamento?')) return;
    const p = lojistaParam ? `${lojistaParam}&` : '?';
    await fetch(`/api/ycloud/campaigns/${id}${p.slice(0, -1)}`, { method: 'DELETE', headers: authHeaders });
    await loadHistory();
  };

  const varInfo = selectedTemplate ? getTemplateVarCount(selectedTemplate) : null;
  const bodyComp = selectedTemplate?.components.find(c => c.type === 'BODY');
  const footerComp = selectedTemplate?.components.find(c => c.type === 'FOOTER');
  const buttonsComp = selectedTemplate?.components.find(c => c.type === 'BUTTONS');

  // ─── Render ──────────────────────────────────────────────────────────────────
  const tabStyle = (t: string) => ({
    padding: '10px 20px',
    border: 'none',
    borderBottom: activeTab === t ? '3px solid #6366f1' : '3px solid transparent',
    background: 'none',
    fontWeight: activeTab === t ? 700 : 500,
    color: activeTab === t ? '#6366f1' : '#6b7280',
    cursor: 'pointer',
    fontSize: 14,
    transition: 'all 0.15s',
  });

  return (
    <ErrorBoundary>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 40px' }}>
        {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', borderRadius: 16, padding: '24px 28px', marginBottom: 24, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 36 }}>📢</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Disparo em Massa</h2>
            <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: 14 }}>Envie mensagens WhatsApp para múltiplos clientes via YCloud</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: 20 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', padding: '0 8px' }}>
          <button style={tabStyle('nova')} onClick={() => setActiveTab('nova')}>✉️ Nova Campanha</button>
          <button style={tabStyle('historico')} onClick={() => { setActiveTab('historico'); loadHistory(); }}>📊 Histórico</button>
          <button style={tabStyle('logs')} onClick={() => { setActiveTab('logs'); loadHistory().then(() => {}); }}>🧾 Logs de Envio</button>
          <button style={tabStyle('templates')} onClick={() => { setActiveTab('templates'); loadYCloudData(); }}>📋 Templates</button>
          <button style={tabStyle('config')} onClick={() => setActiveTab('config')}>⚙️ Configuração</button>
        </div>

        {/* ── ABA: NOVA CAMPANHA ── */}
        {activeTab === 'nova' && (
          <div style={{ padding: 24 }}>
            {dataError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#991b1b', fontSize: 14 }}>
                ⚠️ {dataError} — <button onClick={() => setActiveTab('config')} style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Configurar Token</button>
              </div>
            )}

            <div style={{ display: 'grid', gap: 18 }}>
              {/* Nome da campanha */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Nome da Campanha *</label>
                <input
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                  placeholder="Ex: Promoção Dia dos Namorados"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              {/* Número remetente */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Número Remetente (WhatsApp) *</label>
                {loadingData ? (
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>Carregando números...</div>
                ) : phoneNumbers.length > 0 ? (
                  <select
                    value={selectedPhone}
                    onChange={e => setSelectedPhone(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  >
                    <option value="">Selecione o número...</option>
                    {phoneNumbers.map(p => (
                      <option key={p.phoneNumber} value={p.phoneNumber}>
                        {p.displayPhoneNumber} — {p.verifiedName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ padding: '10px 14px', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 8, color: '#9ca3af', fontSize: 13 }}>
                    Nenhum número encontrado. Configure o token YCloud.
                  </div>
                )}
              </div>

              {/* Template */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Template WhatsApp (APROVADO) *</label>
                {loadingData ? (
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>Carregando templates...</div>
                ) : templates.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10, maxHeight: 320, overflowY: 'auto', padding: 2 }}>
                    {templates.filter(t => t.status === 'APPROVED').map(t => {
                      const vi = getTemplateVarCount(t);
                      const body = t.components.find(c => c.type === 'BODY');
                      const isSelected = selectedTemplate?.name === t.name && selectedTemplate?.language === t.language;
                      return (
                        <div
                          key={`${t.name}-${t.language}`}
                          onClick={() => { setSelectedTemplate(t); setRecipients([]); setCsvText(''); }}
                          style={{
                            border: `2px solid ${isSelected ? '#6366f1' : '#e5e7eb'}`,
                            borderRadius: 10, padding: '12px 16px', cursor: 'pointer',
                            background: isSelected ? '#f5f3ff' : '#fff',
                            transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#1f2937' }}>{t.name}</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {vi.hasImage && <span style={{ fontSize: 11, background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 10 }}>📷 Imagem</span>}
                              {vi.hasVideo && <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10 }}>🎥 Vídeo</span>}
                              {(vi.header + vi.body) > 0 && <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 10 }}>{vi.header + vi.body} variáveis</span>}
                              <span style={{ fontSize: 11, background: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: 10 }}>{t.language}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {body?.text?.substring(0, 100)}...
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '12px 16px', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 8, color: '#9ca3af', fontSize: 13 }}>
                    Nenhum template aprovado encontrado no YCloud.
                  </div>
                )}
              </div>

              {/* Media URL se o template tiver imagem/video */}
              {varInfo?.hasImage && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>🖼️ URL da Imagem do Header *</label>
                  <input
                    value={imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    placeholder="https://exemplo.com/imagem.jpg"
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              )}
              {varInfo?.hasVideo && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>🎥 URL do Vídeo do Header *</label>
                  <input
                    value={videoUrl}
                    onChange={e => setVideoUrl(e.target.value)}
                    placeholder="https://exemplo.com/video.mp4"
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              )}

              {/* Preview do template selecionado */}
              {selectedTemplate && (
                <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 8 }}>👁️ Preview do Template</div>
                  <div style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', maxWidth: 340 }}>
                    {selectedTemplate.components.map((c, i) => (
                      <div key={i}>
                        {c.type === 'HEADER' && (
                          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#1f2937' }}>
                            {c.format === 'IMAGE' ? '📷 [Imagem]' : c.format === 'VIDEO' ? '🎥 [Vídeo]' : c.text}
                          </div>
                        )}
                        {c.type === 'BODY' && <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{c.text}</div>}
                        {c.type === 'FOOTER' && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>{c.text}</div>}
                        {c.type === 'BUTTONS' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                            {c.buttons?.map((btn, bi) => (
                              <div key={bi} style={{ textAlign: 'center', color: '#6366f1', fontWeight: 600, fontSize: 13, padding: '6px', border: '1px solid #e0e7ff', borderRadius: 6 }}>
                                {btn.type === 'PHONE_NUMBER' ? '📞 ' : btn.type === 'URL' ? '🔗 ' : '↩️ '}{btn.text}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Destinatários */}
              {selectedTemplate && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                    👥 Destinatários ({recipients.length} adicionados)
                  </label>

                  {/* Adicionar manual */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <input
                      value={manualPhone}
                      onChange={e => setManualPhone(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addManualRecipient()}
                      placeholder="Telefone ex: 5516999990001"
                      style={{ flex: 1, minWidth: 200, padding: '9px 14px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}
                    />
                    
                    {varInfo && Array.from({ length: varInfo.header + varInfo.body }, (_, vi) => (
                      <input
                        key={vi}
                        value={manualVars[vi] || ''}
                        onChange={e => {
                          const newVars = [...manualVars];
                          newVars[vi] = e.target.value;
                          setManualVars(newVars);
                        }}
                        onKeyDown={e => e.key === 'Enter' && addManualRecipient()}
                        placeholder={`Variável {{${vi + 1}}}`}
                        style={{ width: 130, padding: '9px 14px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}
                      />
                    ))}

                    <button onClick={addManualRecipient} style={{ padding: '9px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      + Adicionar
                    </button>
                  </div>

                  {/* Upload CSV */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{ padding: '8px 14px', background: '#f0fdf4', color: '#166534', border: '1.5px solid #86efac', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                    >
                      📂 Importar CSV/Excel
                    </button>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                      Formato: telefone,var1,var2... (1ª linha pode ser cabeçalho)
                    </span>
                    <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx" style={{ display: 'none' }} onChange={handleFileUpload} />
                  </div>

                  {/* Lista de destinatários com campos de variável */}
                  {recipients.length > 0 && (
                    <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Telefone</th>
                            {varInfo && Array.from({ length: varInfo.header + varInfo.body }, (_, i) => (
                              <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>
                                {`{{${i + 1}}}`}
                              </th>
                            ))}
                            <th style={{ padding: '8px 12px', width: 40 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {recipients.map((r, ri) => (
                            <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '6px 12px', color: '#374151' }}>{r.phone}</td>
                              {varInfo && Array.from({ length: varInfo.header + varInfo.body }, (_, vi) => (
                                <td key={vi} style={{ padding: '4px 8px' }}>
                                  <input
                                    value={r.vars[vi] || ''}
                                    onChange={e => updateRecipientVar(ri, vi, e.target.value)}
                                    placeholder={`Var ${vi + 1}`}
                                    style={{ width: '100%', padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                                  />
                                </td>
                              ))}
                              <td style={{ padding: '4px 8px' }}>
                                <button onClick={() => removeRecipient(ri)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16 }}>×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Agendamento */}
              {selectedTemplate && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>🕐 Quando enviar?</label>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="radio" checked={scheduleType === 'now'} onChange={() => setScheduleType('now')} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Agora</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="radio" checked={scheduleType === 'later'} onChange={() => setScheduleType('later')} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Agendar para...</span>
                    </label>
                  </div>
                  {scheduleType === 'later' && (
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      style={{ padding: '9px 14px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}
                    />
                  )}
                </div>
              )}

              {/* Result message */}
              {sendResult && (
                <div style={{
                  background: sendResult.success ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${sendResult.success ? '#86efac' : '#fca5a5'}`,
                  borderRadius: 10, padding: '12px 16px',
                  color: sendResult.success ? '#166534' : '#991b1b', fontSize: 14, fontWeight: 600
                }}>
                  {sendResult.success ? '✅' : '❌'} {sendResult.message}
                </div>
              )}

              {/* Botão enviar */}
              <button
                onClick={handleSend}
                disabled={sending || !selectedTemplate || !recipients.length || !selectedPhone || !campaignName}
                style={{
                  padding: '14px 24px',
                  background: sending || !selectedTemplate || !recipients.length || !selectedPhone || !campaignName
                    ? '#e5e7eb' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 15,
                  cursor: sending || !selectedTemplate || !recipients.length || !selectedPhone || !campaignName ? 'not-allowed' : 'pointer',
                  width: '100%', transition: 'all 0.2s'
                }}
              >
                {sending ? '⏳ Enviando...' : scheduleType === 'later' ? `📅 Agendar para ${recipients.length} destinatário(s)` : `🚀 Disparar agora para ${recipients.length} destinatário(s)`}
              </button>
              
              {(!campaignName || !selectedPhone || !selectedTemplate || !recipients.length) && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#ef4444', textAlign: 'center', fontWeight: 600 }}>
                  Para liberar o botão, preencha:{' '}
                  {[
                    !campaignName ? 'Nome da Campanha' : '',
                    !selectedPhone ? 'Número Remetente' : '',
                    !selectedTemplate ? 'Template' : '',
                    !recipients.length ? 'Pelo menos 1 Destinatário' : ''
                  ].filter(Boolean).join(' • ')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ABA: HISTÓRICO ── */}
        {activeTab === 'historico' && (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1f2937' }}>Histórico de Campanhas</h3>
              <button onClick={loadHistory} style={{ padding: '6px 14px', background: '#f0f0f0', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                🔄 Atualizar
              </button>
            </div>
            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Carregando...</div>
            ) : campaigns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 14 }}>
                📭 Nenhuma campanha encontrada. Crie sua primeira campanha!
              </div>
            ) : !Array.isArray(campaigns) ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Erro ao carregar campanhas.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {campaigns.map(c => (
                  <div key={c.id} style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#1f2937' }}>{c.nome}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Template: <strong>{c.template_name}</strong></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {statusBadge(c.status)}
                        <button
                          onClick={() => syncStatus(c.id)}
                          disabled={syncingId === c.id}
                          style={{ padding: '3px 10px', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: 6, cursor: syncingId === c.id ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700 }}
                        >
                          {syncingId === c.id ? 'Sincronizando...' : '🔄 Meta Status'}
                        </button>
                        {c.status === 'scheduled' && (
                          <button
                            onClick={() => handleCancel(c.id)}
                            style={{ padding: '3px 10px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                        <span>📊 Total: <strong>{c.total}</strong></span>
                        <span style={{ color: '#166534' }}>✅ Enviados: <strong>{c.total_sent}</strong></span>
                        {c.total_failed > 0 && <span style={{ color: '#991b1b' }}>❌ Falhas: <strong>{c.total_failed}</strong></span>}
                        {c.scheduled_at && <span style={{ color: '#6d28d9' }}>🕐 {new Date(c.scheduled_at).toLocaleString('pt-BR')}</span>}
                        <span style={{ color: '#9ca3af' }}>{new Date(c.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                      {(() => {
                        let parsedLog: any[] = [];
                        if (c.error_log) {
                          try {
                            parsedLog = JSON.parse(c.error_log);
                            if (!Array.isArray(parsedLog)) parsedLog = [{ phone: 'Geral', status: 'failed', error: c.error_log }];
                          } catch (e) {
                            parsedLog = [{ phone: 'Geral', status: 'failed', error: c.error_log }];
                          }
                        }
                        return parsedLog.length > 0 && (
                          <button
                            onClick={() => setShowLogs(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                            style={{ padding: '3px 10px', background: showLogs[c.id] ? '#f3f4f6' : '#fef3c7', color: showLogs[c.id] ? '#4b5563' : '#d97706', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                          >
                            {showLogs[c.id] ? 'Esconder Logs' : '🧾 Ver Logs'}
                          </button>
                        );
                      })()}
                    </div>
                    {showLogs[c.id] && c.error_log && (
                      <div style={{ marginTop: 12, padding: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, maxHeight: 200, overflowY: 'auto' }}>
                        {(() => {
                          let parsedLog: any[] = [];
                          try {
                            parsedLog = JSON.parse(c.error_log);
                            if (!Array.isArray(parsedLog)) parsedLog = [{ phone: 'Geral', status: 'failed', error: c.error_log }];
                          } catch (e) {
                            parsedLog = [{ phone: 'Geral', status: 'failed', error: c.error_log }];
                          }
                          return parsedLog.map((log: any, idx: number) => (
                            <div key={idx} style={{ marginBottom: 6, color: log.status === 'success' ? '#166534' : '#991b1b' }}>
                              <strong>{log.phone}:</strong> {log.status === 'success' ? 'Enviado com sucesso' : `Erro: ${log.error}`}
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ABA: LOGS DE ENVIO ── */}
        {activeTab === 'logs' && (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1f2937' }}>🧾 Logs de Envio por Campanha</h3>
              <button onClick={() => loadHistory()} style={{ padding: '6px 14px', background: '#f0f0f0', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🔄 Atualizar</button>
            </div>

            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Carregando...</div>
            ) : campaigns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 14 }}>📭 Nenhuma campanha com logs disponíveis.</div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {campaigns.map(c => {
                  let parsedLog: any[] = [];
                  if (c.error_log) {
                    try {
                      parsedLog = JSON.parse(c.error_log);
                      if (!Array.isArray(parsedLog)) parsedLog = [{ phone: 'Geral', status: 'failed', error: c.error_log }];
                    } catch {
                      parsedLog = [{ phone: 'Geral', status: 'failed', error: c.error_log }];
                    }
                  }
                  const successCount = parsedLog.filter((l: any) => l.status === 'success').length;
                  const failCount = parsedLog.filter((l: any) => l.status === 'failed').length;
                  const [expanded, setExpanded] = [showLogs[c.id], () => setShowLogs(prev => ({ ...prev, [c.id]: !prev[c.id] }))];

                  return (
                    <div key={c.id} style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                      {/* Cabeçalho da campanha */}
                      <div
                        onClick={() => setShowLogs(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                        style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: showLogs[c.id] ? '#f5f3ff' : '#fff', borderBottom: showLogs[c.id] ? '1px solid #e5e7eb' : 'none' }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>{c.nome}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                            {new Date(c.created_at).toLocaleString('pt-BR')} · Template: {c.template_name}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          {parsedLog.length > 0 ? (
                            <>
                              <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>✅ {successCount} ok</span>
                              {failCount > 0 && <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>❌ {failCount} falhas</span>}
                            </>
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: 12 }}>Sem logs</span>
                          )}
                          {statusBadge(c.status)}
                          <span style={{ fontSize: 16, color: '#9ca3af' }}>{showLogs[c.id] ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {/* Detalhe dos logs */}
                      {showLogs[c.id] && (
                        <div style={{ padding: '12px 18px', maxHeight: 320, overflowY: 'auto' }}>
                          {parsedLog.length === 0 ? (
                            <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 16 }}>Nenhum log registrado para esta campanha.</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>Telefone</th>
                                  <th style={{ textAlign: 'center', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>Status</th>
                                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#6b7280', fontWeight: 600 }}>Detalhes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {parsedLog.map((log: any, idx: number) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{log.phone}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                      {log.status === 'success'
                                        ? <span style={{ color: '#166534', fontWeight: 700 }}>✅ Enviado</span>
                                        : <span style={{ color: '#991b1b', fontWeight: 700 }}>❌ Falhou</span>
                                      }
                                    </td>
                                    <td style={{ padding: '6px 8px', color: log.status === 'success' ? '#059669' : '#dc2626', fontSize: 12 }}>
                                      {log.status === 'success' ? (log.id ? `ID: ${log.id}` : 'Enviado com sucesso') : (log.error || 'Erro desconhecido')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ABA: TEMPLATES ── */}
        {activeTab === 'templates' && (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1f2937' }}>📋 Gerenciar Templates</h3>
              {!showTplForm && (
                <button
                  onClick={() => setShowTplForm(true)}
                  style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                >
                  + Criar Novo Template
                </button>
              )}
            </div>

            {showTplForm ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h4 style={{ margin: 0, fontSize: 15, color: '#334155' }}>
                    Criar Template de {newTplCategory === 'UTILITY' ? 'Utilidade' : newTplCategory === 'AUTHENTICATION' ? 'Autenticação' : 'Marketing'}
                  </h4>
                  <button onClick={() => setShowTplForm(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Voltar</button>
                </div>

                {tplCreationError && (
                  <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
                    ⚠️ {tplCreationError}
                  </div>
                )}

                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Categoria *</label>
                      <select value={newTplCategory} onChange={e => setNewTplCategory(e.target.value)} style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
                        <option value="MARKETING">Marketing (Promoções, Ofertas)</option>
                        <option value="UTILITY">Utilidade (Lembretes, Status)</option>
                        <option value="AUTHENTICATION">Autenticação (Códigos, Tokens)</option>
                      </select>
                      {aiTip && <div style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>{aiTip}</div>}
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Idioma *</label>
                      <select value={newTplLanguage} onChange={e => setNewTplLanguage(e.target.value)} style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
                        <option value="pt_BR">Português (Brasil)</option>
                        <option value="en_US">Inglês (EUA)</option>
                        <option value="es">Espanhol</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Nome do Template *</label>
                    <input
                      value={newTplName}
                      onChange={e => setNewTplName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                      placeholder="ex: promocao_dia_das_maes"
                      style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}
                    />
                    <small style={{ color: '#6b7280', fontSize: 11 }}>Apenas letras minúsculas, números e underline.</small>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Cabeçalho (Opcional)</label>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                      {(['NONE', 'TEXT', 'IMAGE'] as const).map(type => (
                        <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input type="radio" checked={newTplHeaderType === type} onChange={() => setNewTplHeaderType(type)} />
                          {type === 'NONE' ? 'Nenhum' : type === 'TEXT' ? 'Texto' : 'Imagem'}
                        </label>
                      ))}
                    </div>
                    {newTplHeaderType === 'TEXT' && (
                      <input value={newTplHeaderText} onChange={e => setNewTplHeaderText(e.target.value)} placeholder="Texto curto do cabeçalho" style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} />
                    )}
                    {newTplHeaderType === 'IMAGE' && (
                      <input value={newTplHeaderImage} onChange={e => setNewTplHeaderImage(e.target.value)} placeholder="URL pública da imagem (https://...)" style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} />
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Mensagem Principal *</label>
                    <textarea
                      value={newTplBody}
                      onChange={handleBodyChange}
                      placeholder="Olá {{1}}, confira nossa oferta de hoje..."
                      rows={5}
                      style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <small style={{ color: '#6b7280', fontSize: 11 }}>Use {'{{1}}, {{2}}'} para inserir variáveis de texto personalizadas para cada cliente.</small>
                    
                    {newTplBodySamples.length > 0 && (
                      <div style={{ marginTop: 10, background: '#fdf4ff', padding: 16, borderRadius: 8, border: '1px solid #fbcfe8' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#86198f', marginBottom: 12 }}>Variáveis detectadas (Amostras obrigatórias)</div>
                        {extractVars(newTplBody).map((varName, idx) => (
                          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, marginBottom: 8, alignItems: 'center' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 2 }}>Variável</label>
                              <input value={`{{${varName}}}`} disabled style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#f1f5f9', fontSize: 12, fontWeight: 700, color: '#475569', textAlign: 'center' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 2 }}>Adicione um exemplo para envio à Meta *</label>
                              <input 
                                value={newTplBodySamples[idx] || ''}
                                onChange={e => {
                                  const next = [...newTplBodySamples];
                                  next[idx] = e.target.value;
                                  setNewTplBodySamples(next);
                                }}
                                placeholder={`Ex: ${idx === 0 ? 'João Silva' : '10%'}`}
                                style={{ width: '100%', padding: '8px', border: '1px solid #fbcfe8', borderRadius: 6, fontSize: 13 }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Rodapé (Opcional)</label>
                    <input value={newTplFooter} onChange={e => setNewTplFooter(e.target.value)} placeholder="Texto pequeno em cinza no fim da mensagem" style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} />
                  </div>

                  <div style={{ background: '#f1f5f9', padding: 12, borderRadius: 8 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Botão (Opcional)</label>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      {(['NONE', 'URL', 'PHONE', 'QUICK_REPLY'] as const).map(type => (
                        <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input type="radio" checked={newTplButtonType === type} onChange={() => setNewTplButtonType(type)} />
                          {type === 'NONE' ? 'Nenhum' : type === 'URL' ? 'Acessar Site (URL)' : type === 'PHONE' ? 'Ligar (Telefone)' : 'Resposta Rápida (Ex: Sim)'}
                        </label>
                      ))}
                    </div>
                    {newTplButtonType !== 'NONE' && (
                      <div style={{ display: 'grid', gridTemplateColumns: newTplButtonType === 'QUICK_REPLY' ? '1fr' : '1fr 1fr', gap: 10, marginTop: 8 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Texto do Botão</label>
                          <input value={newTplButtonText} onChange={e => setNewTplButtonText(e.target.value)} placeholder={newTplButtonType === 'URL' ? "Ex: Comprar Agora" : newTplButtonType === 'PHONE' ? "Ex: Ligar Agora" : "Ex: Sim, eu quero!"} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                        </div>
                        {newTplButtonType !== 'QUICK_REPLY' && (
                          <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{newTplButtonType === 'URL' ? 'URL do Site' : 'Número (com +55)'}</label>
                            
                            {newTplButtonType === 'URL' && (
                              <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                                  <input type="radio" checked={newTplButtonUrlType === 'STATIC'} onChange={() => setNewTplButtonUrlType('STATIC')} />
                                  Estático
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                                  <input type="radio" checked={newTplButtonUrlType === 'DYNAMIC'} onChange={() => setNewTplButtonUrlType('DYNAMIC')} />
                                  Dinâmico
                                </label>
                              </div>
                            )}

                            <input value={newTplButtonValue} onChange={e => setNewTplButtonValue(e.target.value)} placeholder={newTplButtonType === 'URL' ? (newTplButtonUrlType === 'DYNAMIC' ? "Ex: https://site.com/pedido/{{1}}" : "https://site.com") : "+5511999999999"} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }} />
                            
                            {newTplButtonType === 'URL' && newTplButtonUrlType === 'DYNAMIC' && (
                              <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#64748b' }}>Use <b>{`{{1}}`}</b> na URL no lugar onde a variável será injetada.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                    <button
                      onClick={handleCreateTemplate}
                      disabled={creatingTpl}
                      style={{ padding: '12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: creatingTpl ? 'not-allowed' : 'pointer', fontSize: 14, marginTop: 10 }}
                    >
                      {creatingTpl ? '⏳ Enviando...' : '🚀 Salvar e Enviar para Análise'}
                    </button>
                  </div>
                </div>

                {/* WHATSAPP PREVIEW */}
                <div style={{ background: '#efeae2', borderRadius: 24, border: '8px solid #1f2937', padding: '16px 12px', height: 'fit-content', position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
                  {/* Fake Header */}
                  <div style={{ background: '#005c4b', margin: '-16px -12px 12px -12px', padding: '14px', borderRadius: '16px 16px 0 0', color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, background: '#d1d5db', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>👤</div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>Pré-visualização</div>
                  </div>

                  <div style={{ background: '#fff', borderRadius: '0 8px 8px 8px', padding: 8, fontSize: 14, color: '#111', alignSelf: 'flex-start', width: '100%', maxWidth: '90%', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>
                    {newTplHeaderType === 'IMAGE' && (
                      <div style={{ width: '100%', height: 140, background: '#f1f5f9', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, overflow: 'hidden' }}>
                        {newTplHeaderImage ? <img src={newTplHeaderImage} alt="Header" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🖼️ Imagem (1.91:1)'}
                      </div>
                    )}
                    {newTplHeaderType === 'TEXT' && newTplHeaderText && (
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{newTplHeaderText}</div>
                    )}
                    
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                      {newTplBody ? newTplBody.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, p1) => {
                        const vars = extractVars(newTplBody);
                        const idx = vars.indexOf(p1.trim());
                        return idx !== -1 && newTplBodySamples[idx] ? newTplBodySamples[idx] : match;
                      }) : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>A mensagem aparecerá aqui...</span>}
                    </div>

                    {newTplFooter && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>{newTplFooter}</div>
                    )}
                  </div>

                  {newTplButtonType !== 'NONE' && newTplButtonText && (
                    <div style={{ background: '#fff', borderRadius: 8, padding: '10px', textAlign: 'center', fontSize: 14, color: '#00a884', fontWeight: 500, alignSelf: 'flex-start', width: '100%', maxWidth: '90%', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>
                      <span style={{ marginRight: 6 }}>{newTplButtonType === 'URL' ? '🔗' : newTplButtonType === 'PHONE' ? '📞' : '↩️'}</span>
                      {newTplButtonText}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {loadingData ? (
                  <div style={{ color: '#9ca3af', fontSize: 13, padding: 20, textAlign: 'center' }}>Carregando templates...</div>
                ) : templates.length === 0 ? (
                  <div style={{ color: '#9ca3af', fontSize: 13, padding: 20, textAlign: 'center', background: '#f9fafb', borderRadius: 8 }}>Nenhum template encontrado.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {templates.map(t => {
                      const body = t.components.find(c => c.type === 'BODY')?.text || '';
                      let badge = { text: 'Em Análise', bg: '#fef9c3', color: '#854d0e' };
                      if (t.status === 'APPROVED') badge = { text: 'Aprovado', bg: '#dcfce7', color: '#166534' };
                      if (t.status === 'REJECTED') badge = { text: 'Rejeitado', bg: '#fee2e2', color: '#991b1b' };

                      return (
                        <div key={t.name} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <strong style={{ color: '#1f2937', fontSize: 15 }}>{t.name}</strong>
                              <span style={{ fontSize: 11, background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                                {badge.text}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: 13, color: '#4b5563', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{body}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ABA: CONFIGURAÇÃO ── */}
        {activeTab === 'config' && (
          <div style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1f2937' }}>⚙️ Configuração de Conexão WhatsApp</h3>
            
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 24 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Provedor Ativo para Disparos</h4>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="radio" checked={newProvedorDisparo === 'YCLOUD'} onChange={() => setNewProvedorDisparo('YCLOUD')} />
                  YCloud
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                  <input type="radio" checked={newProvedorDisparo === 'META'} onChange={() => setNewProvedorDisparo('META')} />
                  API Oficial Meta (Cloud API)
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* YCLOUD CONFIG */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
                <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1f2937' }}>YCloud</h4>
                {tokenStatus?.configured ? (
                  <div style={{ padding: '14px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>✅ Token Configurado</div>
                    <div style={{ fontSize: 12, color: '#166534', marginTop: 3, fontFamily: 'monospace' }}>{tokenStatus.preview}</div>
                    <button onClick={() => setTokenStatus({ ...tokenStatus, configured: false })} style={{ padding: '4px 8px', marginTop: 8, background: '#fff', border: '1px solid #86efac', borderRadius: 6, color: '#166534', cursor: 'pointer', fontSize: 12 }}>Editar</button>
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Token de API</label>
                    <input type="password" value={newYcToken} onChange={e => setNewYcToken(e.target.value)} placeholder="Cole o token YCloud" style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 6, boxSizing: 'border-box' }} />
                  </div>
                )}
              </div>

              {/* META CONFIG */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
                <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1f2937' }}>API Oficial Meta</h4>
                {tokenStatus?.metaConfigured ? (
                  <div style={{ padding: '14px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>✅ Token Configurado</div>
                    <div style={{ fontSize: 12, color: '#166534', marginTop: 3, fontFamily: 'monospace' }}>{tokenStatus.metaTokenPreview}</div>
                    <button onClick={() => setTokenStatus({ ...tokenStatus, metaConfigured: false })} style={{ padding: '4px 8px', marginTop: 8, background: '#fff', border: '1px solid #86efac', borderRadius: 6, color: '#166534', cursor: 'pointer', fontSize: 12 }}>Editar</button>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Token de Acesso</label>
                      <input type="password" value={newMetaToken} onChange={e => setNewMetaToken(e.target.value)} placeholder="Token temporário ou permanente" style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 6, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Phone ID Oficial</label>
                      <input value={newMetaPhoneId} onChange={e => setNewMetaPhoneId(e.target.value)} placeholder="Ex: 1092989257221869" style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 6, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>WABA ID (Opcional p/ disparo, Obrigatório p/ template)</label>
                      <input value={newMetaWabaId} onChange={e => setNewMetaWabaId(e.target.value)} placeholder="ID da Conta do WhatsApp Business" style={{ width: '100%', padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 6, boxSizing: 'border-box' }} />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={{ marginTop: 24, padding: 16, borderTop: '1px solid #e5e7eb' }}>
              <button
                onClick={saveToken}
                disabled={savingToken}
                style={{ padding: '12px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: savingToken ? 'not-allowed' : 'pointer', fontSize: 14 }}
              >
                {savingToken ? 'Salvando...' : 'Salvar Configurações e Provedor'}
              </button>
              {tokenSaved && <span style={{ color: '#16a34a', fontSize: 13, marginLeft: 12, fontWeight: 600 }}>✅ Salvo com sucesso!</span>}
            </div>

            <div style={{ marginTop: 32, padding: 20, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>🌎</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1f2937' }}>Fuso Horário</h3>
              </div>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748b' }}>Configure seu fuso horário para garantir que os agendamentos sejam disparados na hora exata.</p>
              
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  style={{ flex: 1, minWidth: 250, padding: '10px 14px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: 14 }}
                >
                  <option value="America/Sao_Paulo">Horário de Brasília (America/Sao_Paulo)</option>
                  <option value="America/Manaus">Amazonas (America/Manaus)</option>
                  <option value="America/Cuiaba">Mato Grosso (America/Cuiaba)</option>
                  <option value="America/Campo_Grande">Mato Grosso do Sul (America/Campo_Grande)</option>
                  <option value="America/Porto_Velho">Rondônia (America/Porto_Velho)</option>
                  <option value="America/Rio_Branco">Acre (America/Rio_Branco)</option>
                  <option value="America/Belem">Pará (America/Belem)</option>
                  <option value="America/Fortaleza">Ceará (America/Fortaleza)</option>
                  <option value="America/Recife">Pernambuco (America/Recife)</option>
                </select>
                <button
                  onClick={handleSaveTimezone}
                  disabled={savingTimezone}
                  style={{ padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                >
                  {savingTimezone ? 'Salvando...' : 'Salvar Fuso'}
                </button>
              </div>
              {timezoneSaved && <div style={{ color: '#16a34a', fontSize: 13, marginTop: 8, fontWeight: 600 }}>✅ Fuso horário salvo com sucesso!</div>}
            </div>

            <div style={{ marginTop: 32, padding: 20, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>🔗</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1f2937' }}>Webhook do n8n na YCloud</h3>
              </div>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748b' }}>Configure aqui o webhook do seu fluxo do n8n para receber as mensagens dos clientes. Isso envia a URL diretamente para a YCloud sem você precisar abrir o painel deles.</p>
              
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={webhookStatus}
                  onChange={e => setWebhookStatus(e.target.value)}
                  style={{ padding: '10px 14px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: 14, fontWeight: 700, backgroundColor: webhookStatus === 'active' ? '#f0fdf4' : '#fef2f2', color: webhookStatus === 'active' ? '#166534' : '#991b1b' }}
                >
                  <option value="active">🟢 Ativo</option>
                  <option value="disabled">🔴 Inativo</option>
                </select>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  placeholder="Ex: https://n8n.cardapioclick.com.br/webhook/..."
                  style={{ flex: 1, minWidth: 250, padding: '10px 14px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: 14 }}
                />
                <button
                  onClick={handleSaveWebhook}
                  disabled={savingWebhook}
                  style={{ padding: '10px 20px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                >
                  {savingWebhook ? 'Salvando...' : 'Atualizar na YCloud'}
                </button>
              </div>
              
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Eventos (selecione o que o n8n vai receber):</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                  {[
                    'whatsapp.inbound_message.received',
                    'whatsapp.message.updated',
                    'whatsapp.business_account.deleted',
                    'whatsapp.business_account.reviewed',
                    'whatsapp.business_account.updated',
                    'whatsapp.flow.status_change',
                    'whatsapp.payment.updated',
                    'whatsapp.phone_number.deleted',
                    'whatsapp.phone_number.name_updated',
                    'whatsapp.phone_number.quality_updated',
                    'whatsapp.smb.app.state.sync',
                    'whatsapp.smb.history'
                  ].map(evt => (
                    <label key={evt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4b5563', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={webhookEvents.includes(evt)}
                        onChange={(e) => {
                          if (e.target.checked) setWebhookEvents(prev => [...prev, evt]);
                          else setWebhookEvents(prev => prev.filter(x => x !== evt));
                        }}
                      />
                      {evt}
                    </label>
                  ))}
                </div>
              </div>

              {webhookSaved && <div style={{ color: '#16a34a', fontSize: 13, marginTop: 12, fontWeight: 600 }}>✅ Webhook atualizado na YCloud com sucesso!</div>}
            </div>

          </div>
        )}
      </div>
      </div>
    </ErrorBoundary>
  );
}
