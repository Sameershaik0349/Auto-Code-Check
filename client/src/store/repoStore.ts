import { create } from 'zustand';
import { useAuthStore, API_BASE } from './authStore';

export interface Repository {
  id: number;
  name: string;
  owner: string;
  url: string;
  branch: string;
  language: string;
  status: 'active' | 'analyzing' | 'failed';
  last_analysis_at?: string;
  score?: number;
  total_issues?: number;
  created_at: string;
}

interface RepoState {
  repos: Repository[];
  isLoading: boolean;
  error: string | null;
  
  fetchRepos: () => Promise<void>;
  connectRepo: (name: string, url: string, owner: string, branch: string) => Promise<boolean>;
  deleteRepo: (id: number) => Promise<boolean>;
  analyzeRepo: (id: number) => Promise<boolean>;
  updateRepoStatus: (id: number, status: 'active' | 'analyzing' | 'failed', extra?: Partial<Repository>) => void;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repos: [],
  isLoading: false,
  error: null,

  fetchRepos: async () => {
    set({ isLoading: true, error: null });
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/repos/`, { headers });
      
      if (!response.ok) {
        if (response.status === 401) {
          const newToken = await useAuthStore.getState().refreshTokenAction();
          if (newToken) {
            const retryResp = await fetch(`${API_BASE}/repos/`, {
              headers: { 'Authorization': `Bearer ${newToken}` }
            });
            const data = await retryResp.json();
            // Handle pagination returned by DRF (if any)
            const results = data.results !== undefined ? data.results : data;
            set({ repos: results, isLoading: false });
            return;
          }
        }
        throw new Error('Failed to fetch repositories');
      }

      const data = await response.json();
      const results = data.results !== undefined ? data.results : data;
      set({ repos: results, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  connectRepo: async (name, url, owner, branch) => {
    set({ isLoading: true, error: null });
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/repos/`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, url, owner, branch })
      });

      if (!response.ok) throw new Error('Failed to connect repository');

      const newRepo = await response.json();
      set(state => ({
        repos: [newRepo, ...state.repos],
        isLoading: false
      }));
      return true;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  deleteRepo: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/repos/${id}/`, {
        method: 'DELETE',
        headers
      });

      if (!response.ok) throw new Error('Failed to delete repository');

      set(state => ({
        repos: state.repos.filter(r => r.id !== id),
        isLoading: false
      }));
      return true;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  analyzeRepo: async (id) => {
    set({ error: null });
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/repos/${id}/analyze/`, {
        method: 'POST',
        headers
      });

      if (!response.ok) throw new Error('Failed to start code analysis');
      
      // Update state locally to analyzing
      get().updateRepoStatus(id, 'analyzing');
      return true;
    } catch (err: any) {
      set({ error: err.message });
      return false;
    }
  },

  updateRepoStatus: (id, status, extra = {}) => {
    set(state => ({
      repos: state.repos.map(r => 
        r.id === id ? { ...r, status, ...extra } : r
      )
    }));
  }
}));
