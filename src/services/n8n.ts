import axios from 'axios';
import { Workflow } from '../types';

// Injeta automaticamente o token JWT em todas as requisições
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Se receber 401, limpa o token e recarrega a página (força login)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export const getProjects = async (instanceId: string) => {
  const response = await axios.get(`/api/${instanceId}/projects`);
  return response.data;
};

export const getWorkflows = async (instanceId: string) => {
  const response = await axios.get(`/api/${instanceId}/workflows`);
  return response.data;
};

export const toggleWorkflow = async (instanceId: string, id: string, active: boolean) => {
  const response = await axios.patch(`/api/${instanceId}/workflows/${id}`, { active });
  return response.data;
};

export const getWorkflow = async (instanceId: string, id: string) => {
  const response = await axios.get(`/api/${instanceId}/workflows/${id}`);
  return response.data;
};

export const updateWorkflow = async (instanceId: string, id: string, data: any) => {
  const response = await axios.put(`/api/${instanceId}/workflows/${id}`, data);
  return response.data;
};

export const createWorkflow = async (instanceId: string, data: any) => {
  const response = await axios.post(`/api/${instanceId}/workflows`, data);
  return response.data;
};

export const getConfig = async () => {
  const response = await axios.get('/api/config');
  return response.data;
};

export const saveConfig = async (config: any) => {
  const response = await axios.post('/api/config', config);
  return response.data;
};

export const deleteWorkflow = async (instanceId: string, id: string) => {
  await axios.delete(`/api/${instanceId}/workflows/${id}`);
};
