/**
 * API Hooks
 *
 * Custom hooks for fetching data from the API.
 *
 * Design decisions:
 * 1. Simple fetch wrapper (no heavy libraries like react-query yet)
 * 2. Type-safe with generics
 * 3. Loading/error states built-in
 * 4. Easy to upgrade to react-query later if needed
 */

import { useState, useEffect, useCallback } from 'react';
import type { ApiResponse } from '@obsidian-claude/shared';

// ============================================================================
// TYPES
// ============================================================================

interface UseApiOptions {
  immediate?: boolean;  // Fetch immediately on mount
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// BASE FETCH FUNCTION
// ============================================================================

async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const json = (await response.json()) as ApiResponse<T>;

  if (!json.success) {
    throw new Error(json.error.message);
  }

  return json.data;
}

// ============================================================================
// GENERIC HOOK
// ============================================================================

export function useApi<T>(
  url: string,
  options: UseApiOptions = { immediate: true }
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(options.immediate ?? true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiFetch<T>(url);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (options.immediate !== false) {
      fetchData();
    }
  }, [fetchData, options.immediate]);

  return { data, loading, error, refetch: fetchData };
}

// ============================================================================
// MUTATION HOOK
// ============================================================================

interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData>;
  loading: boolean;
  error: string | null;
}

export function useMutation<TData, TVariables>(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST'
): UseMutationResult<TData, TVariables> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiFetch<TData>(url, {
          method,
          body: JSON.stringify(variables),
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [url, method]
  );

  return { mutate, loading, error };
}

// ============================================================================
// SPECIFIC HOOKS
// ============================================================================

// Stats hook
export function useStats() {
  return useApi<{
    totalNotes: number;
    notesToday: number;
    activeProjects: number;
    timeThisWeek: number;
  }>('/api/stats/dashboard');
}

// Daily note hook
export function useDailyNote(date?: string) {
  const url = date ? `/api/daily/${date}` : '/api/daily';
  return useApi<{
    id: string;
    title: string;
    content: string;
    body: string;
  }>(url);
}

// Notes list hook
export function useNotes(filters?: { type?: string; tag?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.tag) params.set('tag', filters.tag);
  if (filters?.limit) params.set('limit', String(filters.limit));

  const query = params.toString();
  const url = query ? `/api/notes?${query}` : '/api/notes';

  return useApi<{
    notes: Array<{
      id: string;
      title: string;
      type: string;
      status: string;
      tags: string[];
      excerpt: string;
      modifiedAt: string;
    }>;
    total: number;
  }>(url);
}

// Single note hook
export function useNote(id: string) {
  return useApi<{
    id: string;
    title: string;
    type: string;
    status: string;
    tags: string[];
    content: string;
    body: string;
    createdAt: string;
    modifiedAt: string;
  }>(`/api/notes/${encodeURIComponent(id)}`);
}

// Growth evidence hook
export function useGrowthSummary() {
  return useApi<{
    dimensions: Array<{
      id: string;
      label: string;
      count: number;
      level: string;
    }>;
  }>('/api/growth/competencies');
}

// Projects hook
export function useProjects() {
  return useApi<Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    createdAt: string;
  }>>('/api/projects');
}

// Search hook
export function useSearch(query: string) {
  return useApi<Array<{
    id: string;
    title: string;
    type: string;
    excerpt: string;
    tags: string[];
  }>>(`/api/search?q=${encodeURIComponent(query)}`, { immediate: query.length > 0 });
}

// Time entries for today
export function useTimeToday() {
  return useApi<{
    entries: Array<{
      id: number;
      activity: string;
      duration: number;
      project: string | null;
    }>;
    totalMinutes: number;
  }>('/api/time/today');
}
