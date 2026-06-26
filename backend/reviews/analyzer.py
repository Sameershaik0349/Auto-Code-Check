import re
import math
import random
from typing import Dict, List, Any

class CodeAnalyzer:
    def __init__(self, rules: List[Any]):
        """
        rules is a list of Rule model instances
        """
        self.rules = {r.name if hasattr(r, 'id') else r['name']: r for r in rules}
        self.rule_list = rules

    def is_rule_enabled(self, rule_id: str) -> bool:
        for r in self.rule_list:
            # support both model objects and dicts
            r_id = getattr(r, 'id', None) or (r.get('id') if isinstance(r, dict) else None)
            if r_id == rule_id:
                return getattr(r, 'enabled', True) or (r.get('enabled', True) if isinstance(r, dict) else True)
        return False

    def get_rule_details(self, rule_id: str) -> Dict[str, Any]:
        for r in self.rule_list:
            r_id = getattr(r, 'id', None) or (r.get('id') if isinstance(r, dict) else None)
            if r_id == rule_id:
                return {
                    'severity': getattr(r, 'severity', 'medium') or (r.get('severity', 'medium') if isinstance(r, dict) else 'medium'),
                    'category': getattr(r, 'category', 'style') or (r.get('category', 'style') if isinstance(r, dict) else 'style')
                }
        return {'severity': 'medium', 'category': 'style'}

    def get_ai_suggestion(self, rule_id: str, line_content: str) -> str:
        if rule_id == 'sec-1':
            # mask/hide the API key
            replaced = re.sub(
                r"(['\"`])[a-zA-Z0-9_\-/+=]{8,}(['\"`])", 
                r"\1process.env.API_KEY_SECRET\2", 
                line_content
            )
            return f"# Recommended fix: load secrets from environment variables\n# {replaced}"
        elif rule_id == 'sec-2':
            return (
                "// Recommended fix using parameterized query:\n"
                "const query = 'SELECT * FROM users WHERE username = ?';\n"
                "db.execute(query, [username], callback);"
            )
        elif rule_id == 'sec-3':
            return (
                "// Recommended fix for React/DOM elements:\n"
                "<div className='content'>{safeHtmlContent}</div>\n"
                "// Or sanitize using DOMPurify before rendering innerHTML:\n"
                "// <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(dirtyHtml) }} />"
            )
        elif rule_id == 'perf-2':
            return (
                "// Recommended batch lookup or SQL JOIN:\n"
                "const userIds = todos.map(t => t.userId);\n"
                "db.all('SELECT id, name, avatar FROM users WHERE id IN (' + userIds.join(',') + ')', (err, users) => {\n"
                "  // Map users in memory to avoid N+1 queries\n"
                "});"
            )
        return "# AI Suggestion not available for this issue"

    def analyze_file(self, filepath: str, content: str) -> Dict[str, Any]:
        lines = content.splitlines()
        issues = []
        
        loc = len(lines)
        complexity = 1
        comment_lines = 0
        blank_lines = 0
        
        ext = filepath.split('.')[-1].lower() if '.' in filepath else ''
        is_js_ts = ext in ['js', 'jsx', 'ts', 'tsx']
        is_python = ext == 'py'
        is_go = ext == 'go'
        
        # Check Python syntax errors
        if is_python:
            import ast
            try:
                ast.parse(content)
            except SyntaxError as e:
                # Try to auto-resolve missing colon
                orig_text = e.text or ''
                fixed_suggestion = orig_text.rstrip('\r\n')
                if 'expected \':\'' in e.msg:
                    if not fixed_suggestion.endswith(':'):
                        fixed_suggestion += ':'
                else:
                    # Generic suggestion
                    fixed_suggestion = orig_text.strip() or "Syntax Error Fix"
                    
                issues.append({
                    'filepath': filepath,
                    'line': e.lineno or 1,
                    'code_snippet': orig_text.strip() if orig_text else 'Syntax Error',
                    'message': f"Syntax Error: {e.msg}",
                    'severity': 'critical',
                    'category': 'style',
                    'suggestion': fixed_suggestion.strip(),
                    'status': 'open'
                })
        
        loop_keywords = ['for ', 'while '] if is_python else ['for(', 'for (', 'while(', 'while (']
        loop_lines = []

        for i, line in enumerate(lines):
            line_num = i + 1
            trimmed = line.strip()
            
            if not trimmed:
                blank_lines += 1
                continue
                
            # Check comment lines
            if (is_js_ts and (trimmed.startswith('//') or trimmed.startswith('/*') or trimmed.startswith('*'))) or \
               (is_python and trimmed.startswith('#')) or \
               (is_go and trimmed.startswith('//')):
                comment_lines += 1
                continue
                
            # Compute complexity (count logical branches)
            decisions = re.findall(r'\b(if|for|while|catch|case)\b|&&|\|\||\.(map|filter|reduce)\(', trimmed)
            complexity += len(decisions)
            
            # --- Rule 1: Hardcoded credentials ---
            if self.is_rule_enabled('sec-1'):
                credentials_pattern = r"(password|passwd|api_key|apikey|secret|token|private_key|auth_token)\s*[:=]\s*['\"`][a-zA-Z0-9_\-/+=]{8,}['\"`]"
                if re.search(credentials_pattern, trimmed, re.IGNORECASE):
                    rule_info = self.get_rule_details('sec-1')
                    issues.append({
                        'filepath': filepath,
                        'line': line_num,
                        'code_snippet': trimmed,
                        'message': 'Potential hardcoded security token or secret key detected. Move credentials to environment variables.',
                        'severity': rule_info['severity'],
                        'category': rule_info['category'],
                        'suggestion': self.get_ai_suggestion('sec-1', trimmed),
                        'status': 'open'
                    })

            # --- Rule 2: SQL Injection ---
            if self.is_rule_enabled('sec-2'):
                sql_concat_pattern = r"query\s*\(\s*['\"`]\s*SELECT.*WHERE.*['\"`]\s*\+\s*\w+|SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*=\s*\${"
                if re.search(sql_concat_pattern, trimmed, re.IGNORECASE) or \
                   ("SELECT" in trimmed and ("+ username" in trimmed or "+ userId" in trimmed or "+ user_id" in trimmed)):
                    rule_info = self.get_rule_details('sec-2')
                    issues.append({
                        'filepath': filepath,
                        'line': line_num,
                        'code_snippet': trimmed,
                        'message': 'SQL Injection Vulnerability. Building SQL statements via raw string concatenation is dangerous. Use parameterized queries.',
                        'severity': rule_info['severity'],
                        'category': rule_info['category'],
                        'suggestion': self.get_ai_suggestion('sec-2', trimmed),
                        'status': 'open'
                    })

            # --- Rule 3: Cross-Site Scripting (XSS) ---
            if self.is_rule_enabled('sec-3'):
                if 'dangerouslySetInnerHTML' in trimmed or '.innerHTML =' in trimmed or 'fmt.Sprintf("<h1>' in trimmed:
                    rule_info = self.get_rule_details('sec-3')
                    issues.append({
                        'filepath': filepath,
                        'line': line_num,
                        'code_snippet': trimmed,
                        'message': 'Cross-Site Scripting (XSS) Risk. Direct usage of HTML output or innerHTML allows unescaped script execution. Use safe rendering bindings.',
                        'severity': rule_info['severity'],
                        'category': rule_info['category'],
                        'suggestion': self.get_ai_suggestion('sec-3', trimmed),
                        'status': 'open'
                    })

            # --- Rule 4: Deeply Nested Loops ---
            if self.is_rule_enabled('perf-1'):
                is_loop = any(kw in trimmed for kw in loop_keywords)
                if is_loop:
                    loop_lines.append(line_num)
                    if len(loop_lines) >= 3:
                        last_loop = loop_lines[-2]
                        if line_num - last_loop < 15:
                            rule_info = self.get_rule_details('perf-1')
                            issues.append({
                                'filepath': filepath,
                                'line': line_num,
                                'code_snippet': trimmed,
                                'message': 'Performance Warning: O(N^3) complexity risk. Nested loops detected 3 levels deep. Refactor into lookup maps.',
                                'severity': rule_info['severity'],
                                'category': rule_info['category'],
                                'suggestion': '// Refactor nested loops:\n// Map child items to parent dictionary and retrieve in O(1) loop.',
                                'status': 'open'
                            })

            # --- Rule 5: N+1 Query Pattern ---
            if self.is_rule_enabled('perf-2'):
                is_query = any(term in trimmed.lower() for term in ['db.', 'query(', 'select(', 'find('])
                in_loop = any(line_num - l > 0 and line_num - l < 25 for l in loop_lines)
                if is_query and in_loop:
                    rule_info = self.get_rule_details('perf-2')
                    issues.append({
                        'filepath': filepath,
                        'line': line_num,
                        'code_snippet': trimmed,
                        'message': 'Database query executed inside a loop (N+1 query pattern). Batch query results using JOIN operations or bulk lookups.',
                        'severity': rule_info['severity'],
                        'category': rule_info['category'],
                        'suggestion': self.get_ai_suggestion('perf-2', trimmed),
                        'status': 'open'
                    })

            # --- Rule 6: Console Log ---
            if self.is_rule_enabled('qual-1'):
                if 'console.log(' in trimmed:
                    rule_info = self.get_rule_details('qual-1')
                    issues.append({
                        'filepath': filepath,
                        'line': line_num,
                        'code_snippet': trimmed,
                        'message': 'Clean Code: Avoid console.log in production. Use a dedicated logging framework with logging levels.',
                        'severity': rule_info['severity'],
                        'category': rule_info['category'],
                        'suggestion': '// Remove console.log\n// logger.debug("User action");',
                        'status': 'open'
                    })

            # --- Rule 8: Unsafe catch block ---
            if self.is_rule_enabled('qual-3'):
                if 'catch' in trimmed and trimmed.endswith('{') and i < len(lines) - 1:
                    next_trimmed = lines[i+1].strip()
                    if next_trimmed in ['}', '// TODO', '// do nothing', 'pass']:
                        rule_info = self.get_rule_details('qual-3')
                        issues.append({
                            'filepath': filepath,
                            'line': line_num,
                            'code_snippet': f"{trimmed}\n  {next_trimmed}",
                            'message': 'Unsafe empty catch block. Exceptions are swallowed without logging. Log the exception or rethrow.',
                            'severity': rule_info['severity'],
                            'category': rule_info['category'],
                            'suggestion': 'catch (error) {\n  console.error("An error occurred:", error);\n}',
                            'status': 'open'
                        })

        # File Level Rule 7: High cyclomatic complexity check
        if self.is_rule_enabled('qual-2') and complexity > 15:
            rule_info = self.get_rule_details('qual-2')
            issues.append({
                'filepath': filepath,
                'line': 1,
                'code_snippet': f"// File: {filepath}",
                'message': f"High cyclomatic complexity ({complexity}). The logical branches in this file exceed safe thresholds. Split logical flows into smaller helper functions.",
                'severity': rule_info['severity'],
                'category': rule_info['category'],
                'suggestion': '// Refactor: Split file into smaller module classes or helpers.',
                'status': 'open'
            })

        # Calculate maintainability index
        maintainability = 100 - (complexity * 1.5) - (loc / 20.0) - (len(issues) * 4.0)
        maintainability = max(10, min(100, int(round(maintainability))))
        
        # Test coverage simulation
        coverage = 95 if ('test' in filepath or 'spec' in filepath) else max(40, int(round(75 - complexity + random.random() * 10)))

        # Score calculation
        critical_count = len([i for i in issues if i['severity'] == 'critical'])
        high_count = len([i for i in issues if i['severity'] == 'high'])
        medium_count = len([i for i in issues if i['severity'] == 'medium'])
        low_count = len([i for i in issues if i['severity'] == 'low'])
        
        score = 100 - (critical_count * 15) - (high_count * 10) - (medium_count * 5) - (low_count * 2)
        score = max(10, min(100, int(round(score))))

        return {
            'issues': issues,
            'metrics': {
                'filepath': filepath,
                'complexity': complexity,
                'maintainability': maintainability,
                'loc': loc,
                'coverage': coverage
            },
            'score': score
        }
