import { create } from 'zustand';

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name: string;
  avatar: string;
  role: 'admin' | 'reviewer' | 'developer';
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  login: (email: string, password: string) => Promise<boolean>;
  signup: (username: string, email: string, password: string, name: string, role: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  initialize: () => void;
  getAuthHeaders: () => Record<string, string>;
  refreshTokenAction: () => Promise<string | null>;
}

export const API_BASE = window.location.origin + '/api';

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  getAuthHeaders: () => {
    const { token } = get();
    return token ? { 'Authorization': `Bearer ${token}` } as Record<string, string> : {} as Record<string, string>;
  },

  initialize: () => {
    const token = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');
    const userStr = localStorage.getItem('user_profile');
    
    if (token && refreshToken && userStr && userStr !== 'undefined') {
      try {
        set({
          token,
          refreshToken,
          user: JSON.parse(userStr),
          isAuthenticated: true
        });
      } catch (err) {
        console.error('Failed to parse user session, resetting...', err);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_profile');
      }
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.detail || 'Login failed');
      }

      const data = await response.json();
      
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      localStorage.setItem('user_profile', JSON.stringify(data.user));

      set({
        token: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
        isAuthenticated: true,
        isLoading: false
      });
      return true;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  signup: async (username, email, password, name, role) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/auth/signup/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, name, role })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || Object.values(errData)[0] || 'Registration failed');
      }
      
      set({ isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    const { token, refreshToken } = get();
    if (token && refreshToken) {
      try {
        await fetch(`${API_BASE}/auth/logout/`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ refresh: refreshToken })
        });
      } catch (err) {
        console.warn("API logout call failed", err);
      }
    }
    
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_profile');

    set({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      error: null
    });
  },

  refreshTokenAction: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken })
      });

      if (!response.ok) throw new Error('Token refresh expired');

      const data = await response.json();
      localStorage.setItem('access_token', data.access);
      set({ token: data.access });
      return data.access;
    } catch (err) {
      console.error("JWT token refresh failed, logging out", err);
      get().logout();
      return null;
    }
  }
}));
