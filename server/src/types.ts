export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatar: string;
  role: 'admin' | 'reviewer' | 'developer';
  refreshToken?: string;
  createdAt: string;
}

export interface Repository {
  id: string;
  name: string;
  owner: string;
  url: string;
  branch: string;
  language: string;
  status: 'active' | 'analyzing' | 'failed';
  lastAnalysisAt?: string;
  score?: number;
  totalIssues?: number;
  createdAt: string;
}

export interface Review {
  id: string;
  repoId: string;
  commitHash: string;
  branch: string;
  status: 'pending' | 'completed';
  score: number;
  author: string;
  createdAt: string;
}

export interface Issue {
  id: string;
  reviewId: string;
  filepath: string;
  line: number;
  codeSnippet: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'performance' | 'complexity' | 'style';
  suggestion: string;
  status: 'open' | 'resolved' | 'false_positive';
  createdAt: string;
}

export interface Comment {
  id: string;
  reviewId: string;
  filepath: string;
  line: number;
  userId: string;
  userName: string;
  avatar: string;
  text: string;
  createdAt: string;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'performance' | 'complexity' | 'style';
}

export interface CodeMetrics {
  id: string;
  reviewId: string;
  filepath: string;
  complexity: number;
  maintainability: number;
  loc: number;
  coverage: number;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  details: string;
  createdAt: string;
}
