// src/services/api.ts

// Use Vite's environment variables. VITE_API_BASE_URL will be /api in production
// and http://localhost:3000/api in development.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  // 1. Check for an auth token (adjust key if your app stores it differently, e.g., 'token')
  const token = localStorage.getItem('token'); 

  // 2. Setup standard headers (omit Content-Type for FormData so browser sets boundary)
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  // 3. Inject the Authorization header if the user has a token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // 4. Execute the fetch request
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // 5. Handle security rejections and other errors
  if (response.status === 401) {
    console.error(`Security Block: ${response.status} on ${endpoint}`);
    
    // Auto-logout the user if their session expired
    localStorage.removeItem('currentUser');
    localStorage.removeItem('token');
    window.location.reload(); 
    
    throw new Error(`API Error: ${response.status}`);
  }

  if (response.status === 403) {
    console.debug(`Access denied (403) on ${endpoint} — expected for current role.`);
    return null; // Gracefully return null instead of throwing
  }

  if (!response.ok) {
    let errorMessage = `API Error: ${response.status}`;
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        errorMessage = errorBody.message;
      } else if (typeof errorBody === 'string') {
        errorMessage = errorBody;
      }
    } catch (parseError) {
      // If response is not JSON, use default error message
      console.warn("Could not parse error response as JSON:", parseError);
    }
    throw new Error(errorMessage);
  }

  try {
    return await response.json();
  } catch (jsonError) {
    // Handle cases where response is OK but not JSON (e.g., 204 No Content)
    if (response.status === 204) return null;
    throw new Error("Failed to parse response as JSON.");
  }
};

/**
 * Fetches an authenticated blob URL for previewing images/files inline.
 * Automatically injects JWT Authorization header and creates an Object URL.
 */
export async function getAuthenticatedBlobUrl(endpoint: string): Promise<string> {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let errorMessage = `Failed to load attachment (${response.status})`;
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        errorMessage = errorBody.message;
      } else if (typeof errorBody === 'string') {
        errorMessage = errorBody;
      }
    } catch (_) {}
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * Downloads an attachment with proper JWT authentication and file saving.
 */
export async function downloadAuthenticatedAttachment(endpoint: string, filename: string): Promise<void> {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let errorMessage = `Failed to download attachment (${response.status})`;
    try {
      const errorBody = await response.json();
      if (errorBody.message) {
        errorMessage = errorBody.message;
      } else if (typeof errorBody === 'string') {
        errorMessage = errorBody;
      }
    } catch (_) {}
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}