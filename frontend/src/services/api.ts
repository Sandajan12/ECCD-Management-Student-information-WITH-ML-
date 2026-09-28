import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
});

// Automatically attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 422 && error.response.data && Array.isArray(error.response.data.detail)) {
      error.response.data.detail = error.response.data.detail.map((err: any) => err.msg).join(', ');
    }
    return Promise.reject(error);
  }
);
