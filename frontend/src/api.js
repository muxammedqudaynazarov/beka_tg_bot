import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  // ngrok bepul tarifi ba'zan API so'rovlariga ham HTML "ogohlantirish"
  // sahifasini qaytarib yuboradi (JSON o'rniga) — bu header shuni oldini oladi.
  // Production'da (haqiqiy domenda) bu header hech qanday ta'sir qilmaydi.
  headers: { 'ngrok-skip-browser-warning': 'true' },
});

let authToken = null;
export function setAuthToken(token) {
  authToken = token;
  if (token) localStorage.setItem('cs2auction_token', token);
}
export function loadStoredToken() {
  authToken = localStorage.getItem('cs2auction_token');
  return authToken;
}

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

export { API_BASE_URL };
