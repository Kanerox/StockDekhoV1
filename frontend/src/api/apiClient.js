import axios from "axios";

const fallbackBaseURL =
  import.meta.env.PROD
    ? "https://stockdekho-api.onrender.com/api"
    : "http://localhost:3001/api";

const apiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    fallbackBaseURL,
});

export default apiClient;