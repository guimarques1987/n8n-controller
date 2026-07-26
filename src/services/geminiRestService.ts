
import { ReferenceImage } from '../types/imageGenTypes';

// Função para tratar erros da API
const handleGenAIError = (error: any) => {
  console.error("Gemini API Error:", error);
  const errorMessage = error?.message || "";
  if (errorMessage.includes("429") || errorMessage.includes("quota")) {
    throw new Error("Limite de cota excedido no Google Cloud.");
  }
  throw new Error(errorMessage.length > 100 ? "Erro na comunicação com a IA." : errorMessage);
};

// Determina a proporção padrão mais próxima
const getClosestStandardRatio = (width: number, height: number): "1:1" | "3:4" | "4:3" | "9:16" | "16:9" => {
  const ratio = width / height;
  const standards = [
    { name: "1:1", val: 1 },
    { name: "3:4", val: 0.75 },
    { name: "4:3", val: 1.33 },
    { name: "9:16", val: 0.5625 },
    { name: "16:9", val: 1.777 },
  ];
  return standards.reduce((prev, curr) => Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev).name as any;
};

// Função de Fetch Direto (REST)
const fetchGeminiREST = async (model: string, apiKey: string, body: any, apiVersion: 'v1' | 'v1beta' = 'v1beta') => {
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = errorText;
    try {
      const jsonErr = JSON.parse(errorText);
      errorMsg = jsonErr.error?.message || jsonErr.error?.details?.[0]?.message || errorText;
    } catch (e) { }
    throw new Error(`Erro ${response.status}: ${errorMsg}`);
  }

  return await response.json();
};

export const generateImageREST = async (
  apiKey: string,
  prompt: string,
  width: number,
  height: number,
  references?: ReferenceImage[],
  quality: 'low' | 'medium' | 'high' = 'low',
  logo?: ReferenceImage
): Promise<string> => {
  try {
    const aspectRatio = getClosestStandardRatio(width, height);
    const ratioValue = width / height;

    // Lógica de Composição baseada no tamanho
    let compositionInstruction = "Enquadramento: Centralize o objeto.";
    if (ratioValue > 2.0) {
      compositionInstruction = "COMPOSIÇÃO PANORÂMICA (WIDE): A imagem final será um BANNER muito largo. Afaste a câmera. O objeto principal deve estar CENTRALIZADO no meio.";
    } else if (ratioValue < 0.6) {
      compositionInstruction = "COMPOSIÇÃO VERTICAL (TALL): A imagem é para Stories. Deixe espaço livre no topo e na base para textos.";
    }

    const parts: any[] = [];

    // Adiciona Referências
    if (references && references.length > 0) {
      references.forEach((ref, i) => {
        parts.push({ inlineData: { data: ref.data, mimeType: ref.mimeType } });
        parts.push({ text: `PRODUTO DE REFERÊNCIA #${i + 1}: Use este item como elemento principal.` });
      });
    }

    // Adiciona Logo
    if (logo) {
      parts.push({ inlineData: { data: logo.data, mimeType: logo.mimeType } });
      parts.push({ text: "LOGOTIPO OBRIGATÓRIO: A imagem fornecida acima é o LOGO OFICIAL. Insira-o na arte de forma legível." });
    }

    const finalInstruction = `
      Crie uma imagem de propaganda profissional:
      ASSUNTO: ${prompt}.
      ESTILO: Fotografia comercial de alta qualidade 8k.
      DIMENSÕES: ${width}x${height} pixels.
      ${compositionInstruction}
      REGRAS: Use APENAS "R$" para moeda. Sem marcas d'água fictícias.
      PROPORÇÃO: ${aspectRatio}.
    `;

    parts.push({ text: finalInstruction });

    // Tenta Google AI - Modelos com suporte a imagem
    const potentialModels = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-2.5-flash'];
    let lastError: any;

    for (const currentModel of potentialModels) {
        try {
            console.log(`Tentando Google AI (${currentModel})...`);
            const response = await fetchGeminiREST(currentModel, apiKey, {
                contents: [{ parts }],
                generationConfig: { temperature: 0.7 }
            }, 'v1beta');

            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts) {
                const part = candidate.content.parts.find((p: any) => p.inlineData);
                if (part?.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        } catch (err: any) {
            lastError = err;
            console.warn(`Erro no modelo ${currentModel}:`, err.message);
        }
    }

    // --- FALLBACK: Pollinations ---
    console.warn("Google Falhou. Usando Gerador Reserva (Pollinations)...");

    const simpleSubject = prompt
        .split('ASSUNTO:')[1]?.split('.')[0]
        ?.trim() || 'Product advertisement';

    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(simpleSubject)}?nologo=true`;

    try {
        const pollRes = await fetch(pollinationsUrl);
        if (!pollRes.ok) throw new Error(`Pollinations retornou HTTP ${pollRes.status}`);
        const blob = await pollRes.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err: any) {
        throw new Error(err?.message || "Serviço de fallback indisponível. Tente novamente.");
    }

  } catch (error: any) {
    return handleGenAIError(error);
  }
};

export const generateCreativePromptREST = async (apiKey: string, baseText: string): Promise<string> => {
    const textModels = ['gemini-2.5-flash', 'gemini-2.5-flash-8b'];
    for (const textModel of textModels) {
        try {
            const response = await fetchGeminiREST(textModel, apiKey, {
                contents: [{ parts: [{ text: `Melhore este texto para um prompt de imagem: "${baseText}". Retorne apenas o prompt melhorado em Português.` }] }]
            }, 'v1beta');
            return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || baseText;
        } catch (e: any) {}
    }
    return baseText;
};

export const generateMarketingTextsREST = async (apiKey: string, context: string): Promise<any> => {
    const instruction = `
        Atue como um Copywriter Sênior. Gere 4 textos persuasivos para os seguintes dados:
        ${context}
        
        RETORNE EXATAMENTE NESTE FORMATO:
        [COMERCIAL]: texto...
        [WHATSAPP]: texto...
        [INSTAGRAM]: texto...
        [BANNER]: texto...
    `;

    const textModels = ['gemini-2.5-flash', 'gemini-2.5-flash-8b'];

    for (const textModel of textModels) {
        try {
            const response = await fetchGeminiREST(textModel, apiKey, {
                contents: [{ parts: [{ text: instruction }] }]
            }, 'v1beta');

            const textResult = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            if (!textResult) continue;

            const extractSection = (tag: string) => {
                const parts = textResult.split(tag);
                if (parts.length < 2) return '';
                return parts[1].split('[')[0].trim();
            };

            return {
                comercial: extractSection('[COMERCIAL]:'),
                whatsapp: extractSection('[WHATSAPP]:'),
                instagram: extractSection('[INSTAGRAM]:'),
                banner: extractSection('[BANNER]:') || textResult.split('[BANNER]:')[1]?.trim() || ''
            };
        } catch (e) {}
    }
    throw new Error("Erro de conexão. Tente novamente.");
};

export const analyzeImageREST = async (apiKey: string, base64: string): Promise<string> => {
    const visionModels = ['gemini-2.5-flash', 'gemini-2.5-flash-8b', 'gemini-2.0-flash'];
    const instruction = "Descreva detalhadamente o que você vê nesta imagem (objetos, cores, textos, clima, composição). Use um tom descritivo técnico em Português para que eu possa usar isso como base para pedir alterações depois. Seja direto e objetivo.";

    for (const model of visionModels) {
        try {
            const response = await fetchGeminiREST(model, apiKey, {
                contents: [{
                    parts: [
                        { text: instruction },
                        { inlineData: { mimeType: "image/jpeg", data: base64 } }
                    ]
                }]
            }, 'v1beta');
            return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        } catch (e) {
            console.error(`Erro ao analisar com ${model}:`, e);
        }
    }
    return "";
};
