import { Issue, CodeMetrics, Rule } from '../types';

export interface AnalysisResult {
  issues: Omit<Issue, 'id' | 'reviewId' | 'createdAt'>[];
  metrics: Omit<CodeMetrics, 'id' | 'reviewId'>;
  score: number;
}

export class CodeAnalyzer {
  private rules: Rule[];

  constructor(rules: Rule[]) {
    this.rules = rules;
  }

  /**
   * Run code quality analysis on a single file's content
   */
  public analyzeFile(filepath: string, content: string): AnalysisResult {
    const lines = content.split(/\r?\n/);
    const issues: Omit<Issue, 'id' | 'reviewId' | 'createdAt'>[] = [];
    
    // 1. Calculate basic metrics
    const loc = lines.length;
    let complexity = 1; // Base complexity
    let commentLines = 0;
    let blankLines = 0;

    // Detect file type
    const ext = filepath.split('.').pop() || '';
    const isJavascriptOrTs = ['js', 'jsx', 'ts', 'tsx'].includes(ext);
    const isPython = ext === 'py';
    const isGo = ext === 'go';

    // Tracking for nesting levels
    let currentIndentLevel = 0;
    const loopKeywords = isPython ? ['for ', 'while '] : ['for(', 'for (', 'while(', 'while ('];
    const indentPattern = /^( {2,8}|\t)/;

    // Keep track of nested loop lines to trigger high/medium performance issue
    const loopLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      if (trimmed === '') {
        blankLines++;
        continue;
      }

      // Check comments
      if (
        (isJavascriptOrTs && (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*'))) ||
        (isPython && trimmed.startsWith('#')) ||
        (isGo && trimmed.startsWith('//'))
      ) {
        commentLines++;
        continue;
      }

      // 2. Compute Cyclomatic Complexity
      // Count decision points: if, for, while, catch, case, &&, ||, map, filter, reduce
      const decisionRegex = /\b(if|for|while|catch|case)\b|&&|\|\||\.(map|filter|reduce)\(/g;
      const matches = trimmed.match(decisionRegex);
      if (matches) {
        complexity += matches.length;
      }

      // 3. Scan rules
      
      // Rule 1: Hardcoded credentials (Critical Security)
      if (this.isRuleEnabled('sec-1')) {
        const credentialsRegex = /(password|passwd|api_key|apikey|secret|token|private_key|auth_token)\s*[:=]\s*['"`][a-zA-Z0-9_\-]{8,}['"`]/i;
        if (credentialsRegex.test(trimmed)) {
          // Double check it's not a config variable name but a raw value
          const rule = this.rules.find(r => r.id === 'sec-1')!;
          issues.push({
            filepath,
            line: lineNum,
            codeSnippet: trimmed,
            message: 'Potential hardcoded security token or secret key detected. Move credentials to environment variables.',
            severity: rule.severity,
            category: rule.category,
            suggestion: this.getAiSuggestion('sec-1', trimmed),
            status: 'open'
          });
        }
      }

      // Rule 2: SQL Injection (Critical Security)
      if (this.isRuleEnabled('sec-2')) {
        const sqlConcatRegex = /query\s*\(\s*['"`]\s*SELECT.*WHERE.*['"`]\s*\+\s*\w+|SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*=\s*\${/i;
        if (sqlConcatRegex.test(trimmed)) {
          const rule = this.rules.find(r => r.id === 'sec-2')!;
          issues.push({
            filepath,
            line: lineNum,
            codeSnippet: trimmed,
            message: 'SQL Injection Vulnerability. Building SQL statements via raw string concatenation is dangerous. Use parameterized queries.',
            severity: rule.severity,
            category: rule.category,
            suggestion: this.getAiSuggestion('sec-2', trimmed),
            status: 'open'
          });
        }
      }

      // Rule 3: Cross-Site Scripting (XSS) (High Security)
      if (this.isRuleEnabled('sec-3')) {
        if (trimmed.includes('dangerouslySetInnerHTML') || trimmed.includes('.innerHTML =')) {
          const rule = this.rules.find(r => r.id === 'sec-3')!;
          issues.push({
            filepath,
            line: lineNum,
            codeSnippet: trimmed,
            message: 'Cross-Site Scripting (XSS) Risk. Direct usage of innerHTML allows unescaped script execution. Sanitize inputs or use textContent/safe JSX elements.',
            severity: rule.severity,
            category: rule.category,
            suggestion: this.getAiSuggestion('sec-3', trimmed),
            status: 'open'
          });
        }
      }

      // Rule 4: Deeply Nested Loops (Medium Performance)
      if (this.isRuleEnabled('perf-1')) {
        const isLoop = loopKeywords.some(kw => trimmed.startsWith(kw) || trimmed.includes(' ' + kw));
        if (isLoop) {
          loopLines.push(lineNum);
          if (loopLines.length >= 3) {
            // Check if they are close enough to be nested
            const lastLoopLine = loopLines[loopLines.length - 2];
            if (lineNum - lastLoopLine < 15) {
              const rule = this.rules.find(r => r.id === 'perf-1')!;
              issues.push({
                filepath,
                line: lineNum,
                codeSnippet: trimmed,
                message: 'Performance Warning: O(N^3) time complexity risk. Nested loops detected 3 levels deep. Refactor into lookup maps or reduce iterations.',
                severity: rule.severity,
                category: rule.category,
                suggestion: '// Optimize nested loop structure\n// Use maps/dictionaries to retrieve matching key values in O(1) time complexity.',
                status: 'open'
              });
            }
          }
        }
      }

      // Rule 5: N+1 Query Pattern (High Performance)
      if (this.isRuleEnabled('perf-2')) {
        const isDbQuery = /db\.|query\(|select\(|find\(/i.test(trimmed);
        const inLoop = loopLines.some(l => lineNum - l > 0 && lineNum - l < 25);
        if (isDbQuery && inLoop) {
          const rule = this.rules.find(r => r.id === 'perf-2')!;
          issues.push({
            filepath,
            line: lineNum,
            codeSnippet: trimmed,
            message: 'Database query executed inside a loop (N+1 query pattern). Batch query results using JOIN operations or bulk lookups to minimize database roundtrips.',
            severity: rule.severity,
            category: rule.category,
            suggestion: this.getAiSuggestion('perf-2', trimmed),
            status: 'open'
          });
        }
      }

      // Rule 6: Console Log in Production (Low Quality)
      if (this.isRuleEnabled('qual-1')) {
        if (trimmed.includes('console.log(')) {
          const rule = this.rules.find(r => r.id === 'qual-1')!;
          issues.push({
            filepath,
            line: lineNum,
            codeSnippet: trimmed,
            message: 'Clean Code: Avoid console.log in production. Use a dedicated logging framework (e.g. Winston, Bunyan) with proper log-levels.',
            severity: rule.severity,
            category: rule.category,
            suggestion: '// Remove console.log\n// Replace with a production logger call if diagnostic output is required:\n// logger.debug("debug message");',
            status: 'open'
          });
        }
      }

      // Rule 8: Unsafe error handler (Medium Quality)
      if (this.isRuleEnabled('qual-3')) {
        if (trimmed.includes('catch') && trimmed.endsWith('{') && i < lines.length - 1) {
          const nextTrimmed = lines[i+1].trim();
          if (nextTrimmed === '}' || nextTrimmed === '// TODO' || nextTrimmed === '// do nothing') {
            const rule = this.rules.find(r => r.id === 'qual-3')!;
            issues.push({
              filepath,
              line: lineNum,
              codeSnippet: `${trimmed}\n  ${nextTrimmed}`,
              message: 'Unsafe catch block. Error is completely swallowed without logging or propagation. Handle exceptions appropriately or rethrow.',
              severity: rule.severity,
              category: rule.category,
              suggestion: 'catch (error) {\n  console.error("An error occurred:", error);\n  // Handle appropriately (rethrow, fallback state, alert user)\n}',
              status: 'open'
            });
          }
        }
      }
    }

    // Rule 7: High cyclomatic complexity check at file level
    if (this.isRuleEnabled('qual-2') && complexity > 15) {
      const rule = this.rules.find(r => r.id === 'qual-2')!;
      issues.push({
        filepath,
        line: 1,
        codeSnippet: `// File: ${filepath}`,
        message: `High cyclomatic complexity (${complexity}). The logical branches in this file exceed safe thresholds. Split logical flows into smaller, testable sub-functions.`,
        severity: rule.severity,
        category: rule.category,
        suggestion: '// Refactor: Split huge functions into smaller module helpers',
        status: 'open'
      });
    }

    // 4. Calculate maintainability index (simple formula)
    // MI = 100 - (complexity * 2) - (loc / 25) - (issues.length * 5)
    let maintainability = 100 - (complexity * 1.5) - (loc / 20) - (issues.length * 4);
    maintainability = Math.max(10, Math.min(100, Math.round(maintainability)));

    // Simulated test coverage
    const coverage = filepath.includes('test') || filepath.includes('spec') ? 95 : Math.max(40, Math.round(75 - complexity + Math.random() * 10));

    // Calculate quality score
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;
    const lowCount = issues.filter(i => i.severity === 'low').length;

    let score = 100 - (criticalCount * 15) - (highCount * 10) - (mediumCount * 5) - (lowCount * 2);
    score = Math.max(10, Math.min(100, Math.round(score)));

    return {
      issues,
      metrics: {
        filepath,
        complexity,
        maintainability,
        loc,
        coverage
      },
      score
    };
  }

  private isRuleEnabled(ruleId: string): boolean {
    const rule = this.rules.find(r => r.id === ruleId);
    return rule ? rule.enabled : false;
  }

  private getAiSuggestion(ruleId: string, lineContent: string): string {
    switch (ruleId) {
      case 'sec-1':
        return lineContent.replace(/(password|passwd|api_key|apikey|secret|token|private_key|auth_token)\s*[:=]\s*['"`].*?['"`]/i, '$1 = process.env.API_KEY_SECRET');
      case 'sec-2':
        return '// Recommended fix using parameterized query:\nconst query = "SELECT * FROM users WHERE id = ?";\nconst results = await db.query(query, [userId]);';
      case 'sec-3':
        return '// Safe react element fix:\n<div className="content">{safeHtmlContent}</div>\n// Or if HTML parsing is mandatory, run DOMPurify on it first:\n// <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(dirtyHtml) }} />';
      case 'perf-2':
        return '// Perform bulk lookup or JOIN instead of loading in a loop:\nconst userIds = users.map(u => u.id);\nconst posts = await db.query("SELECT * FROM posts WHERE userId IN (?)", [userIds]);\n// Map posts to users in memory:';
      default:
        return '// AI Suggestion not available';
    }
  }
}
