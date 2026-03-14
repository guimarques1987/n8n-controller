import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const BASE_URL = "https://n8npro.gdautomacao.com/api/v1";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2ODM3OS1jZDM3LTQxMWItOTVkYy1iNDBhZTQ0OWQ3NmIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjE0NGU2ZmYtNzEwYS00YjY0LTk0YjEtZGY2ODk5NTE0YWJjIiwiaWF0IjoxNzcxNjg1MTE5fQ.SIF0bqobw-YzEZewboZazwou2gEi6TuIsFr-f6TIzaQ";

const headers = { "X-N8N-API-KEY": API_KEY };

async function run() {
    // 1. Listar projects/pastas
    console.log("=== PROJECTS ===");
    try {
        const { data: proj } = await axios.get(`${BASE_URL}/projects`, { headers });
        console.log(JSON.stringify(proj, null, 2));
    } catch (e: any) {
        console.error("Projects error:", e.response?.data || e.message);
    }

    // 2. Listar workflows com paginação e ver o que vem
    console.log("\n=== WORKFLOWS (limit=100) ===");
    try {
        const { data } = await axios.get(`${BASE_URL}/workflows`, { headers, params: { limit: 100 } });
        console.log("Total items:", data.data?.length || "array:", (data as any[]).length);
        console.log("nextCursor:", data.nextCursor);
        console.log("Meta:", JSON.stringify({ count: data.count, nextCursor: data.nextCursor }, null, 2));

        // Mostrar o projectId de cada workflow
        const items = Array.isArray(data) ? data : (data.data || []);
        console.log("\nWorkflows e seus projectId:");
        items.forEach((w: any) => {
            console.log(`  - ${w.name} | active:${w.active} | projectId:${w.projectId || 'none'}`);
        });
    } catch (e: any) {
        console.error("Workflows error:", e.response?.data || e.message);
    }
}

run();
