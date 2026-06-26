import { create } from 'zustand';
import { useAuthStore, API_BASE } from './authStore';

export interface Review {
  id: number;
  repo: number;
  commit_hash: string;
  branch: string;
  status: 'pending' | 'completed';
  score: number;
  author: string;
  created_at: string;
}

export interface Issue {
  id: number;
  review: number;
  filepath: string;
  line: number;
  code_snippet: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'performance' | 'complexity' | 'style';
  suggestion: string;
  status: 'open' | 'resolved' | 'false_positive';
  created_at: string;
}

export interface Comment {
  id: number;
  review: number;
  filepath: string;
  line: number;
  user: number;
  user_details: {
    username: string;
    email: string;
    name: string;
    avatar: string;
  };
  text: string;
  created_at: string;
}

export interface CodeMetrics {
  id: number;
  review: number;
  filepath: string;
  complexity: number;
  maintainability: number;
  loc: number;
  coverage: number;
}

export interface Rule {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'performance' | 'complexity' | 'style';
}

export interface VirtualFile {
  filepath: string;
  content: string;
}

interface ActiveReviewDetails {
  review: Review;
  issues: Issue[];
  metrics: CodeMetrics[];
  comments: Comment[];
  files: VirtualFile[];
}

interface ReviewState {
  reviews: Review[];
  activeReview: ActiveReviewDetails | null;
  rules: Rule[];
  isLoading: boolean;
  error: string | null;

  fetchReviews: (repoId?: number) => Promise<void>;
  fetchReviewDetails: (id: number) => Promise<void>;
  fetchRules: () => Promise<void>;
  updateRule: (id: number, enabled: boolean, severity: string) => Promise<boolean>;
  resolveIssue: (issueId: number, status: 'open' | 'resolved' | 'false_positive') => Promise<boolean>;
  postComment: (reviewId: number, filepath: string, line: number, text: string) => Promise<Comment | null>;
  applyAiFix: (issueId: number) => Promise<{ originalCode: string; fixedCode: string; filepath: string; line: number } | null>;
  addCommentLocally: (comment: Comment) => void;
  updateIssueLocally: (issue: Issue) => void;
  socket: WebSocket | null;
  wsListeners: ((data: any) => void)[];
  setSocket: (socket: WebSocket | null) => void;
  addWsListener: (listener: (data: any) => void) => void;
  removeWsListener: (listener: (data: any) => void) => void;
  triggerWsListeners: (data: any) => void;
  autoJoinCall: boolean;
  setAutoJoinCall: (autoJoin: boolean) => void;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  reviews: [],
  activeReview: null,
  rules: [],
  isLoading: false,
  error: null,

  fetchReviews: async (repoId) => {
    set({ isLoading: true, error: null });
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const url = repoId ? `${API_BASE}/reviews/?repoId=${repoId}` : `${API_BASE}/reviews/`;
      const response = await fetch(url, { headers });
      
      if (!response.ok) throw new Error('Failed to fetch reviews');

      const data = await response.json();
      const results = data.results !== undefined ? data.results : data;
      set({ reviews: results, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchReviewDetails: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/reviews/${id}/`, { headers });

      if (!response.ok) throw new Error('Failed to fetch review report');

      const details = await response.json();
      set({ activeReview: details, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchRules: async () => {
    set({ isLoading: true, error: null });
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/rules/`, { headers });
      
      if (!response.ok) throw new Error('Failed to load analysis rules');

      const data = await response.json();
      const results = data.results !== undefined ? data.results : data;
      set({ rules: results, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  updateRule: async (id, enabled, severity) => {
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/rules/${id}/`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled, severity })
      });

      if (!response.ok) throw new Error('Failed to update rule');

      const updated = await response.json();
      set(state => ({
        rules: state.rules.map(r => r.id === id ? updated : r)
      }));
      return true;
    } catch (err: any) {
      set({ error: err.message });
      return false;
    }
  },

  resolveIssue: async (issueId, status) => {
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/issues/${issueId}/`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) throw new Error('Failed to update issue status');

      const updatedIssue = await response.json();
      
      // Update active review local store if open
      const active = get().activeReview;
      if (active) {
        const updatedIssues = active.issues.map(i => 
          i.id === issueId ? updatedIssue : i
        );
        set({ activeReview: { ...active, issues: updatedIssues } });
      }
      return true;
    } catch (err: any) {
      set({ error: err.message });
      return false;
    }
  },

  postComment: async (reviewId, filepath, line, text) => {
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/comments/`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reviewId, filepath, line, text })
      });

      if (!response.ok) throw new Error('Failed to post comment');

      const newComment = await response.json();
      
      // Add comment locally to active review
      const active = get().activeReview;
      if (active) {
        set({
          activeReview: {
            ...active,
            comments: [...active.comments, newComment]
          }
        });
      }
      return newComment;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    }
  },

  applyAiFix: async (issueId) => {
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/issues/${issueId}/fix/`, {
        method: 'POST',
        headers
      });

      if (!response.ok) throw new Error('Failed to generate AI fix');

      const fixData = await response.json();
      
      // If successful, resolve the issue locally & on db
      await get().resolveIssue(issueId, 'resolved');
      
      return {
        originalCode: fixData.originalCode,
        fixedCode: fixData.fixedCode,
        filepath: fixData.filepath,
        line: fixData.line
      };
    } catch (err: any) {
      set({ error: err.message });
      return null;
    }
  },

  addCommentLocally: (comment) => {
    const active = get().activeReview;
    if (active) {
      // Check if comment already exists locally to avoid duplicates
      if (active.comments.some(c => c.id === comment.id)) return;
      set({
        activeReview: {
          ...active,
          comments: [...active.comments, comment]
        }
      });
    }
  },

  updateIssueLocally: (issue) => {
    const active = get().activeReview;
    if (active) {
      set({
        activeReview: {
          ...active,
          issues: active.issues.map(i => i.id === issue.id ? issue : i)
        }
      });
    }
  },

  socket: null,
  wsListeners: [],
  setSocket: (socket) => set({ socket }),
  addWsListener: (listener) => set(state => ({ wsListeners: [...state.wsListeners, listener] })),
  removeWsListener: (listener) => set(state => ({ wsListeners: state.wsListeners.filter(l => l !== listener) })),
  triggerWsListeners: (data) => {
    const listeners = get().wsListeners;
    listeners.forEach(l => {
      try {
        l(data);
      } catch (err) {
        console.error("Error executing WS listener:", err);
      }
    });
  },
  autoJoinCall: false,
  setAutoJoinCall: (autoJoinCall) => set({ autoJoinCall })
}));
