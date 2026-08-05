import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: { 'ngrok-skip-browser-warning': 'true' },
});

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
  if (token) sessionStorage.setItem('cs2admin_token', token);
}
export function loadStoredToken() {
  authToken = sessionStorage.getItem('cs2admin_token');
  return authToken;
}
api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});
