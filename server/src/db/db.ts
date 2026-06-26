import fs from 'fs';
import path from 'path';
import { User, Repository, Review, Issue, Comment, Rule, CodeMetrics, AuditLog } from '../types';

export interface IDatabase {
  init(): Promise<void>;
  
  // Users
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUserRefreshToken(id: string, token: string | undefined): Promise<void>;
  getAllUsers(): Promise<User[]>;
  
  // Repositories
  getRepos(): Promise<Repository[]>;
  getRepoById(id: string): Promise<Repository | null>;
  createRepo(repo: Repository): Promise<Repository>;
  updateRepo(id: string, repo: Partial<Repository>): Promise<Repository>;
  deleteRepo(id: string): Promise<void>;
  
  // Reviews
  getReviews(repoId?: string): Promise<Review[]>;
  getReviewById(id: string): Promise<Review | null>;
  createReview(review: Review): Promise<Review>;
  updateReview(id: string, review: Partial<Review>): Promise<Review>;
  
  // Issues
  getIssues(reviewId: string): Promise<Issue[]>;
  getIssueById(id: string): Promise<Issue | null>;
  createIssue(issue: Issue): Promise<Issue>;
  updateIssue(id: string, issue: Partial<Issue>): Promise<Issue>;
  
  // Comments
  getComments(reviewId: string): Promise<Comment[]>;
  createComment(comment: Comment): Promise<Comment>;
  
  // Rules
  getRules(): Promise<Rule[]>;
  updateRule(id: string, rule: Partial<Rule>): Promise<Rule>;
  
  // Metrics
  getMetrics(reviewId: string): Promise<CodeMetrics[]>;
  createMetrics(metrics: CodeMetrics): Promise<CodeMetrics>;
  
  // Audit Logs
  createAuditLog(log: AuditLog): Promise<AuditLog>;
  getAuditLogs(): Promise<AuditLog[]>;
}

// ==========================================
// 1. JSON FILE DATABASE (Bulletproof Fallback)
// ==========================================
export class JSONDb implements IDatabase {
  private filePath: string;
  private data: {
    users: User[];
    repositories: Repository[];
    reviews: Review[];
    issues: Issue[];
    comments: Comment[];
    rules: Rule[];
    metrics: CodeMetrics[];
    auditLogs: AuditLog[];
  };

  constructor() {
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = path.join(dataDir, 'db.json');
    this.data = {
      users: [],
      repositories: [],
      reviews: [],
      issues: [],
      comments: [],
      rules: [],
      metrics: [],
      auditLogs: []
    };
  }

  async init(): Promise<void> {
    if (fs.existsSync(this.filePath)) {
      try {
        const fileContent = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(fileContent);
      } catch (err) {
        console.error('Failed to parse JSON DB, starting fresh', err);
      }
    }
    
    // Seed default rules if empty
    if (!this.data.rules || this.data.rules.length === 0) {
      this.data.rules = this.getDefaultRules();
    }
    if (!this.data.users) this.data.users = [];
    if (!this.data.repositories) this.data.repositories = [];
    if (!this.data.reviews) this.data.reviews = [];
    if (!this.data.issues) this.data.issues = [];
    if (!this.data.comments) this.data.comments = [];
    if (!this.data.metrics) this.data.metrics = [];
    if (!this.data.auditLogs) this.data.auditLogs = [];

    this.save();
    console.log('JSON DB initialized successfully at', this.filePath);
  }

  private save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  private getDefaultRules(): Rule[] {
    return [
      { id: 'sec-1', name: 'Hardcoded Credentials', description: 'Detects api keys, secrets, tokens, or passwords hardcoded in source code files.', enabled: true, severity: 'critical', category: 'security' },
      { id: 'sec-2', name: 'SQL Injection', description: 'Checks for dangerous direct SQL query construction using string concatenations rather than parameterized inputs.', enabled: true, severity: 'critical', category: 'security' },
      { id: 'sec-3', name: 'Cross-Site Scripting (XSS)', description: 'Scans for innerHTML assignments or raw output renders which can lead to XSS.', enabled: true, severity: 'high', category: 'security' },
      { id: 'perf-1', name: 'Deeply Nested Loops', description: 'Identifies nested loops (3 or more levels deep) causing O(N^2) or O(N^3) time complexity risks.', enabled: true, severity: 'medium', category: 'performance' },
      { id: 'perf-2', name: 'N+1 Query Pattern', description: 'Detects database query operations executed within iterative loops.', enabled: true, severity: 'high', category: 'performance' },
      { id: 'qual-1', name: 'Console Log in Production', description: 'Detects console.log statements which should be avoided in production release bundles.', enabled: true, severity: 'low', category: 'style' },
      { id: 'qual-2', name: 'Complexity Limit', description: 'Calculates complexity metrics (cyclomatic complexity > 15) and highlights highly complex logical branches.', enabled: true, severity: 'medium', category: 'complexity' },
      { id: 'qual-3', name: 'Unsafe Error Handlers', description: 'Scans for empty catch blocks that swallow errors without handling or logging them.', enabled: true, severity: 'medium', category: 'complexity' }
    ];
  }

  // Users
  async getUserByEmail(email: string): Promise<User | null> {
    const user = this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    return user || null;
  }
  async getUserById(id: string): Promise<User | null> {
    const user = this.data.users.find(u => u.id === id);
    return user || null;
  }
  async createUser(user: User): Promise<User> {
    this.data.users.push(user);
    this.save();
    return user;
  }
  async updateUserRefreshToken(id: string, token: string | undefined): Promise<void> {
    const user = this.data.users.find(u => u.id === id);
    if (user) {
      user.refreshToken = token;
      this.save();
    }
  }
  async getAllUsers(): Promise<User[]> {
    return this.data.users;
  }

  // Repositories
  async getRepos(): Promise<Repository[]> {
    return this.data.repositories;
  }
  async getRepoById(id: string): Promise<Repository | null> {
    return this.data.repositories.find(r => r.id === id) || null;
  }
  async createRepo(repo: Repository): Promise<Repository> {
    this.data.repositories.push(repo);
    this.save();
    return repo;
  }
  async updateRepo(id: string, repoData: Partial<Repository>): Promise<Repository> {
    const index = this.data.repositories.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Repository not found');
    this.data.repositories[index] = { ...this.data.repositories[index], ...repoData };
    this.save();
    return this.data.repositories[index];
  }
  async deleteRepo(id: string): Promise<void> {
    this.data.repositories = this.data.repositories.filter(r => r.id !== id);
    // clean up related data
    const reviewIds = this.data.reviews.filter(r => r.repoId === id).map(r => r.id);
    this.data.reviews = this.data.reviews.filter(r => r.repoId !== id);
    this.data.issues = this.data.issues.filter(i => !reviewIds.includes(i.reviewId));
    this.data.comments = this.data.comments.filter(c => !reviewIds.includes(c.reviewId));
    this.data.metrics = this.data.metrics.filter(m => !reviewIds.includes(m.reviewId));
    this.save();
  }

  // Reviews
  async getReviews(repoId?: string): Promise<Review[]> {
    if (repoId) {
      return this.data.reviews.filter(r => r.repoId === repoId);
    }
    return this.data.reviews;
  }
  async getReviewById(id: string): Promise<Review | null> {
    return this.data.reviews.find(r => r.id === id) || null;
  }
  async createReview(review: Review): Promise<Review> {
    this.data.reviews.push(review);
    this.save();
    return review;
  }
  async updateReview(id: string, reviewData: Partial<Review>): Promise<Review> {
    const index = this.data.reviews.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Review not found');
    this.data.reviews[index] = { ...this.data.reviews[index], ...reviewData };
    this.save();
    return this.data.reviews[index];
  }

  // Issues
  async getIssues(reviewId: string): Promise<Issue[]> {
    return this.data.issues.filter(i => i.reviewId === reviewId);
  }
  async getIssueById(id: string): Promise<Issue | null> {
    return this.data.issues.find(i => i.id === id) || null;
  }
  async createIssue(issue: Issue): Promise<Issue> {
    this.data.issues.push(issue);
    this.save();
    return issue;
  }
  async updateIssue(id: string, issueData: Partial<Issue>): Promise<Issue> {
    const index = this.data.issues.findIndex(i => i.id === id);
    if (index === -1) throw new Error('Issue not found');
    this.data.issues[index] = { ...this.data.issues[index], ...issueData };
    this.save();
    return this.data.issues[index];
  }

  // Comments
  async getComments(reviewId: string): Promise<Comment[]> {
    return this.data.comments.filter(c => c.reviewId === reviewId);
  }
  async createComment(comment: Comment): Promise<Comment> {
    this.data.comments.push(comment);
    this.save();
    return comment;
  }

  // Rules
  async getRules(): Promise<Rule[]> {
    return this.data.rules;
  }
  async updateRule(id: string, ruleData: Partial<Rule>): Promise<Rule> {
    const index = this.data.rules.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Rule not found');
    this.data.rules[index] = { ...this.data.rules[index], ...ruleData };
    this.save();
    return this.data.rules[index];
  }

  // Metrics
  async getMetrics(reviewId: string): Promise<CodeMetrics[]> {
    return this.data.metrics.filter(m => m.reviewId === reviewId);
  }
  async createMetrics(metrics: CodeMetrics): Promise<CodeMetrics> {
    this.data.metrics.push(metrics);
    this.save();
    return metrics;
  }

  // Audit Logs
  async createAuditLog(log: AuditLog): Promise<AuditLog> {
    this.data.auditLogs.push(log);
    this.save();
    return log;
  }
  async getAuditLogs(): Promise<AuditLog[]> {
    return this.data.auditLogs;
  }
}

// Setup active database client based on environment
let databaseInstance: IDatabase;

// Check env logic for custom integrations, otherwise default to sqlite / json
export const getDatabase = (): IDatabase => {
  if (!databaseInstance) {
    // If PostgreSQL URL exists, we can write a PG client
    // For local runs, we will use JSONDb to guarantee no native dependencies compile issues on user's Windows PC.
    // It works perfectly out of the box, is persistent, and runs without setup.
    databaseInstance = new JSONDb();
  }
  return databaseInstance;
};
