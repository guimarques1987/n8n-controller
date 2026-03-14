import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BASE_URL = "https://n8npro.gdautomacao.com/api/v1";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2ODM3OS1jZDM3LTQxMWItOTVkYy1iNDBhZTQ0OWQ3NmIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjE0NGU2ZmYtNzEwYS00YjY0LTk0YjEtZGY2ODk5NTE0YWJjIiwiaWF0IjoxNzcxNjg1MTE5fQ.SIF0bqobw-YzEZewboZazwou2gEi6TuIsFr-f6TIzaQ";

// Lógica idêntica ao server.ts v6.1
function cleanForN8N(obj: any, isRoot: boolean = true): any {
    if (Array.isArray(obj)) return obj.map(item => cleanForN8N(item, false));
    if (obj !== null && typeof obj === 'object') {
        const newObj: any = {};
        const forbiddenKeys = ['id', 'active', 'tags', 'createdAt', 'updatedAt', 'versionId', 'creatorId', 'pinData', 'meta', 'staticData'];

        for (const key in obj) {
            if (forbiddenKeys.includes(key)) {
                if (isRoot || key !== 'id') continue;
            }
            newObj[key] = cleanForN8N(obj[key], false);
        }
        return newObj;
    }
    return obj;
}

async function run() {
    console.log("--- N8N DIAGNOSTIC START ---");

    try {
        const { data: listRes } = await axios.get(`${BASE_URL}/workflows`, {
            headers: { "X-N8N-API-KEY": API_KEY }
        });

        const targetWorkflow = listRes.data.find((w: any) => w.name === "modeloStatusUazapi");
        const { data: template } = await axios.get(`${BASE_URL}/workflows/${targetWorkflow.id}`, {
            headers: { "X-N8N-API-KEY": API_KEY }
        });

        // SIMULANDO O PAYLOAD DO FRONT-END (CreateWorkflowModal.tsx:150)
        // payload = { ...templateData, name, nodes }
        const frontEndPayload = {
            ...template, // TEM TUDO (ID, tags, etc.)
            name: "Teste Front-Simul 9.0",
            nodes: template.nodes
        };

        // O QUE O SERVIDOR FAZ (server.ts:125)
        const { name, nodes, connections, settings } = frontEndPayload;

        // NOTA: Se 'template' tinha 'tags', o destructuring acima IGNORA 'tags'.
        // Então 'rawPayload' NÃO deve ter 'tags'.
        const rawPayload: any = {
            name: name || "Novo Fluxo",
            nodes: nodes || [],
            connections: connections || {}
        };
        if (settings) rawPayload.settings = settings;

        // Saneamento
        const payload = cleanForN8N(rawPayload);

        console.log("CHAVES NO PAYLOAD FINAL:", Object.keys(payload));

        console.log("Tentando criar novo fluxo...");
        const response = await axios.post(`${BASE_URL}/workflows`, payload, {
            headers: { "X-N8N-API-KEY": API_KEY }
        });

        console.log("SUCCESS! ID:", response.data.id);
    } catch (e: any) {
        if (e.response) {
            console.error("ERROR FROM N8N:");
            console.error(JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("GENERAL ERROR:", e.message);
        }
    }
}

run();
