import axios from 'axios';

let rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
if (rawApiUrl && !rawApiUrl.includes('/api')) {
  rawApiUrl = rawApiUrl.replace(/\/+$/, '') + '/api';
}
const API_BASE_URL = rawApiUrl;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 75000, // 75s grace period for Render cold starts
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach bearer token
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('agri_token') || localStorage.getItem('agri_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 token invalidation
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const code = error.response.data?.code;
      if (code === 'TOKEN_EXPIRED' || code === 'TOKEN_REVOKED' || code === 'UNAUTHORIZED') {
        sessionStorage.removeItem('agri_token');
        sessionStorage.removeItem('agri_user');
        localStorage.removeItem('agri_token');
        localStorage.removeItem('agri_user');

        // Dispatch custom event for AuthContext to pick up
        window.dispatchEvent(new CustomEvent('agri:logout', { detail: { code } }));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
