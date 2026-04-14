import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("crictrust_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401s
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("crictrust_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
