import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/db';
import { CodeAnalyzer } from '../engine/analyzer';
import { VIRTUAL_REPOSITORIES } from '../engine/virtualRepos';
import { User, Repository, Review, Issue, Comment, Rule, CodeMetrics } from '../types';
import { broadcast } from '../server';

export const apiRouter = Router();
const db = getDatabase();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-2026';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'super-secret-refresh-key-2026';

// ==========================================
// AUTH MIDDLEWARE
// ==========================================
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'admin' | 'reviewer' | 'developer';
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired access token' });
    }
    req.user = user as AuthenticatedRequest['user'];
    next();
  });
};

// Admin role check middleware
const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator permissions required' });
  }
  next();
};

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================
apiRouter.post('/auth/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = 'user_' + Math.random().toString(36).substring(2, 11);
    
    // Seed a simple avatar based on name
    const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`;

    const newUser: User = {
      id: userId,
      email,
      passwordHash,
      name,
      avatar,
      role: role || 'developer',
      createdAt: new Date().toISOString()
    };

    await db.createUser(newUser);
    await db.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 11),
      userId,
      action: 'SIGNUP',
      details: `User ${name} (${email}) signed up as ${role || 'developer'}.`,
      createdAt: new Date().toISOString()
    });

    res.status(201).json({ message: 'User created successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Signup failed' });
  }
});

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
      { id: user.id },
      REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    await db.updateUserRefreshToken(user.id, refreshToken);

    await db.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 11),
      userId: user.id,
      action: 'LOGIN',
      details: `User ${user.name} logged in.`,
      createdAt: new Date().toISOString()
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

apiRouter.post('/auth/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  try {
    let payload: any;
    try {
      payload = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch {
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await db.getUserById(payload.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ accessToken });
  } catch (error: any) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

apiRouter.post('/auth/logout', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    await db.updateUserRefreshToken(userId, undefined);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ==========================================
// REPOSITORY ENDPOINTS
// ==========================================
apiRouter.get('/repos', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const repos = await db.getRepos();
  res.json(repos);
});

apiRouter.post('/repos', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, name, owner, branch } = req.body;
    if (!url || !name) {
      return res.status(400).json({ error: 'Repository name and clone URL are required' });
    }

    // Determine language by querying virtual templates, or default to JavaScript
    const virtualMatch = VIRTUAL_REPOSITORIES.find(r => r.name === name || url.includes(r.name));
    const language = virtualMatch ? virtualMatch.language : 'JavaScript';
    
    const repoId = 'repo_' + Math.random().toString(36).substring(2, 11);
    const newRepo: Repository = {
      id: repoId,
      name,
      owner: owner || 'external',
      url,
      branch: branch || 'main',
      language,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const saved = await db.createRepo(newRepo);

    await db.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 11),
      userId: req.user!.id,
      action: 'REPO_CONNECT',
      details: `Connected repository ${name} (${url}).`,
      createdAt: new Date().toISOString()
    });

    res.status(201).json(saved);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/repos/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const repo = await db.getRepoById(req.params.id);
  if (!repo) return res.status(404).json({ error: 'Repository not found' });
  res.json(repo);
});

apiRouter.delete('/repos/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repo = await db.getRepoById(req.params.id);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    await db.deleteRepo(req.params.id);
    await db.createAuditLog({
      id: 'log_' + Math.random().toString(36).substring(2, 11),
      userId: req.user!.id,
      action: 'REPO_DELETE',
      details: `Deleted repository ${repo.name}.`,
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Repository deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Run analysis on a repository
apiRouter.post('/repos/:id/analyze', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repoId = req.params.id;
    const repo = await db.getRepoById(repoId);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    // Set repository status to analyzing
    await db.updateRepo(repoId, { status: 'analyzing' });
    
    // Broadcast status change immediately
    broadcast({ type: 'ANALYSIS_STARTED', repoId });

    // Async analysis simulation
    setTimeout(async () => {
      try {
        const rules = await db.getRules();
        const analyzer = new CodeAnalyzer(rules);

        // Fetch mock files for analysis
        const virtualMatch = VIRTUAL_REPOSITORIES.find(vr => vr.name === repo.name || repo.url.includes(vr.name)) 
                              || VIRTUAL_REPOSITORIES[0]; // fallback to first repo template

        // Create Review record
        const reviewId = 'review_' + Math.random().toString(36).substring(2, 11);
        const review: Review = {
          id: reviewId,
          repoId,
          commitHash: 'commit_' + Math.random().toString(16).substring(2, 10),
          branch: repo.branch,
          status: 'completed',
          score: 100,
          author: req.user!.email,
          createdAt: new Date().toISOString()
        };

        const fileResults = virtualMatch.files.map(vf => analyzer.analyzeFile(vf.filepath, vf.content));

        // Save issues
        let totalIssues = 0;
        let cumulativeScore = 0;

        for (const fileRes of fileResults) {
          totalIssues += fileRes.issues.length;
          cumulativeScore += fileRes.score;

          // Save Metrics
          await db.createMetrics({
            id: 'metric_' + Math.random().toString(36).substring(2, 11),
            reviewId,
            filepath: fileRes.metrics.filepath,
            complexity: fileRes.metrics.complexity,
            maintainability: fileRes.metrics.maintainability,
            loc: fileRes.metrics.loc,
            coverage: fileRes.metrics.coverage
          });

          // Save individual Issues
          for (const issue of fileRes.issues) {
            // Find code snippet or fill template
            const fileContent = virtualMatch.files.find(f => f.filepath === issue.filepath)?.content || '';
            const fileLines = fileContent.split('\n');
            const codeSnippet = fileLines[issue.line - 1] || issue.codeSnippet;

            await db.createIssue({
              id: 'issue_' + Math.random().toString(36).substring(2, 11),
              reviewId,
              filepath: issue.filepath,
              line: issue.line,
              codeSnippet,
              message: issue.message,
              severity: issue.severity,
              category: issue.category,
              suggestion: issue.suggestion,
              status: 'open',
              createdAt: new Date().toISOString()
            });
          }
        }

        // Calculate average score
        const averageScore = fileResults.length > 0 ? Math.round(cumulativeScore / fileResults.length) : 100;
        review.score = averageScore;
        await db.createReview(review);

        // Update repository
        const updatedRepo = await db.updateRepo(repoId, {
          status: 'active',
          lastAnalysisAt: new Date().toISOString(),
          score: averageScore,
          totalIssues
        });

        await db.createAuditLog({
          id: 'log_' + Math.random().toString(36).substring(2, 11),
          userId: req.user!.id,
          action: 'REPO_ANALYSIS',
          details: `Completed review ${reviewId} on repository ${repo.name} with score ${averageScore}.`,
          createdAt: new Date().toISOString()
        });

        // Broadcast review completion via WebSockets
        broadcast({
          type: 'ANALYSIS_COMPLETED',
          repoId,
          repo: updatedRepo,
          reviewId
        });

      } catch (err: any) {
        console.error('Async analysis failed:', err);
        await db.updateRepo(repoId, { status: 'failed' });
        broadcast({ type: 'ANALYSIS_FAILED', repoId });
      }
    }, 4000); // 4-second processing delay to simulate AST processing

    res.json({ message: 'Analysis started successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// REVIEWS ENDPOINTS
// ==========================================
apiRouter.get('/reviews', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const repoId = req.query.repoId as string;
  const reviews = await db.getReviews(repoId);
  res.json(reviews);
});

apiRouter.get('/reviews/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const review = await db.getReviewById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const issues = await db.getIssues(review.id);
    const metrics = await db.getMetrics(review.id);
    const comments = await db.getComments(review.id);

    // Retrieve file contents for the review diff
    const repo = await db.getRepoById(review.repoId);
    let files: { filepath: string; content: string }[] = [];
    if (repo) {
      const virtualMatch = VIRTUAL_REPOSITORIES.find(r => r.name === repo.name || repo.url.includes(r.name));
      if (virtualMatch) {
        files = virtualMatch.files;
      }
    }

    res.json({
      review,
      issues,
      metrics,
      comments,
      files
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ISSUES & COMMENTS
// ==========================================
apiRouter.patch('/issues/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['open', 'resolved', 'false_positive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid issue status' });
    }

    const updated = await db.updateIssue(req.params.id, { status });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Apply AI-powered fix suggestion preview
apiRouter.post('/issues/:id/fix', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const issue = await db.getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    // Generate diff preview
    const original = issue.codeSnippet;
    const replacement = issue.suggestion;

    res.json({
      success: true,
      issueId: issue.id,
      filepath: issue.filepath,
      line: issue.line,
      originalCode: original,
      fixedCode: replacement
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Post review comments
apiRouter.post('/comments', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reviewId, filepath, line, text } = req.body;
    if (!reviewId || !filepath || line === undefined || !text) {
      return res.status(400).json({ error: 'Missing required comment fields' });
    }

    const user = await db.getUserById(req.user!.id);
    if (!user) return res.status(404).json({ error: 'User profile not found' });

    const newComment: Comment = {
      id: 'comment_' + Math.random().toString(36).substring(2, 11),
      reviewId,
      filepath,
      line,
      userId: user.id,
      userName: user.name,
      avatar: user.avatar,
      text,
      createdAt: new Date().toISOString()
    };

    const saved = await db.createComment(newComment);
    res.status(201).json(saved);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/comments/:reviewId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const comments = await db.getComments(req.params.reviewId);
  res.json(comments);
});

// ==========================================
// ANALYTICS & STATS
// ==========================================
apiRouter.get('/analytics/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repos = await db.getRepos();
    const reviews = await db.getReviews();

    let totalCodeFilesAnalyzed = 0;
    let totalLinesOfCode = 0;
    let criticalIssuesCount = 0;
    let highIssuesCount = 0;
    let mediumIssuesCount = 0;
    let lowIssuesCount = 0;

    // Sum issues and LOCs across reviews
    for (const r of reviews) {
      const issues = await db.getIssues(r.id);
      const metrics = await db.getMetrics(r.id);

      totalCodeFilesAnalyzed += metrics.length;
      metrics.forEach(m => totalLinesOfCode += m.loc);

      issues.forEach(i => {
        if (i.status === 'open') {
          if (i.severity === 'critical') criticalIssuesCount++;
          else if (i.severity === 'high') highIssuesCount++;
          else if (i.severity === 'medium') mediumIssuesCount++;
          else if (i.severity === 'low') lowIssuesCount++;
        }
      });
    }

    const averageMaintainability = reviews.length > 0 ? 82 : 100; // static demo average

    res.json({
      repositoriesCount: repos.length,
      reviewsCount: reviews.length,
      filesAnalyzed: totalCodeFilesAnalyzed || 12,
      linesOfCode: totalLinesOfCode || 4350,
      averageMaintainability,
      issuesBreakdown: {
        critical: criticalIssuesCount,
        high: highIssuesCount,
        medium: mediumIssuesCount,
        low: lowIssuesCount
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/analytics/trends', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  // Return daily code quality trends for Recharts
  res.json([
    { date: 'Jun 19', score: 76, complexity: 12, issues: 18 },
    { date: 'Jun 20', score: 78, complexity: 12, issues: 15 },
    { date: 'Jun 21', score: 82, complexity: 10, issues: 11 },
    { date: 'Jun 22', score: 81, complexity: 11, issues: 12 },
    { date: 'Jun 23', score: 85, complexity: 9,  issues: 8  },
    { date: 'Jun 24', score: 87, complexity: 8,  issues: 6  },
    { date: 'Jun 25', score: 92, complexity: 7,  issues: 3  }
  ]);
});

// ==========================================
// RULES
// ==========================================
apiRouter.get('/rules', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const rules = await db.getRules();
  res.json(rules);
});

apiRouter.patch('/rules/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled, severity } = req.body;
    const updated = await db.updateRule(req.params.id, { enabled, severity });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// TEAM MEMBERS
// ==========================================
apiRouter.get('/team/members', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const users = await db.getAllUsers();
  // Filter out password hashes for security
  const safeUsers = users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    avatar: u.avatar,
    role: u.role,
    createdAt: u.createdAt
  }));
  res.json(safeUsers);
});

apiRouter.post('/team/members', [authenticateToken, requireAdmin], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = 'user_' + Math.random().toString(36).substring(2, 11);
    const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`;

    const newUser: User = {
      id,
      email,
      passwordHash,
      name,
      avatar,
      role: role || 'developer',
      createdAt: new Date().toISOString()
    };

    await db.createUser(newUser);
    res.status(201).json({ id, email, name, avatar, role: newUser.role });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
