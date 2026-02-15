import { useState, useCallback } from 'react';

/**
 * Custom hook wrapping all API calls with loading/error state.
 *
 * Usage:
 *   const api = useApi();
 *   const cases = await api.get('/api/cases');
 *   await api.post('/api/cases', { title: '...' });
 */
export default function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || `Request failed (${res.status})`);
      }
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await res.json();
      }
      return null;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback((url) => request(url, { method: 'GET' }), [request]);

  const post = useCallback((url, data) => request(url, {
    method: 'POST',
    body: JSON.stringify(data),
  }), [request]);

  const put = useCallback((url, data) => request(url, {
    method: 'PUT',
    body: JSON.stringify(data),
  }), [request]);

  const del = useCallback((url) => request(url, { method: 'DELETE' }), [request]);

  const upload = useCallback((url, formData) => request(url, {
    method: 'POST',
    headers: {},
    body: formData,
  }), [request]);

  return { get, post, put, del, upload, loading, error };
}
