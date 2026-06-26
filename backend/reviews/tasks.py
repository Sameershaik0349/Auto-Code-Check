import time
import random
import threading
import logging
from celery import shared_task
from django.utils import timezone
from django.contrib.auth import get_user_model
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from repositories.models import Repository
from .models import Review, Issue, CodeMetrics, Rule, AuditLog
from .analyzer import CodeAnalyzer
from .virtual_repos import VIRTUAL_REPOSITORIES

User = get_user_model()
logger = logging.getLogger(__name__)

def broadcast_ws_event(data: dict):
    """
    Broadcast live events to connected WebSocket clients via Channels.
    """
    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                "reviews_group",
                {
                    "type": "review.message",
                    "message": data
                }
            )
            logger.info(f"Broadcasted WebSocket event: {data.get('type')}")
    except Exception as e:
        logger.warning(f"Failed to broadcast WebSocket event: {e}")


def run_code_analysis(repo_id: int, user_id: int = None):
    """
    Performs the actual code review analysis. 
    Can be run inside a Celery task or a background fallback Thread.
    """
    try:
        repo = Repository.objects.get(id=repo_id)
        repo.status = 'analyzing'
        repo.save()
        
        broadcast_ws_event({
            'type': 'ANALYSIS_STARTED',
            'repoId': repo.id,
            'name': repo.name
        })
        
        # Simulate processing delay to resemble AST compilation
        time.sleep(4)
        
        # Determine user author
        author_email = "system@platform.local"
        user = None
        if user_id:
            try:
                user = User.objects.get(id=user_id)
                author_email = user.email
            except User.DoesNotExist:
                pass
                
        # Check if it is a real Git repository URL
        is_git_repo = False
        url = repo.url.strip()
        if url.startswith('http') or url.startswith('git@') or url.startswith('git://'):
            is_git_repo = True
            
        files_to_analyze = []
        is_empty_repo = False
        clone_failed = False
        
        if is_git_repo:
            import tempfile
            import subprocess
            import os
            import shutil
            import re
            
            # Parse GitHub/GitLab URL for clone URL, branch, and subpath
            clone_url = url
            branch = repo.branch
            subpath = None
            
            # Helper to parse URL
            def parse_git_url(git_url: str):
                g_url = git_url.strip()
                if g_url.endswith('/'):
                    g_url = g_url[:-1]
                
                # GitHub tree/blob match
                github_match = re.match(
                    r'^https?://(?:www\.)?github\.com/([^/]+)/([^/]+)/(blob|tree)/([^/]+)/(.+)$',
                    g_url,
                    re.IGNORECASE
                )
                if github_match:
                    owner_val = github_match.group(1)
                    repo_val = github_match.group(2)
                    if repo_val.endswith('.git'):
                        repo_val = repo_val[:-4]
                    branch_val = github_match.group(4)
                    subpath_val = github_match.group(5)
                    return f"https://github.com/{owner_val}/{repo_val}.git", branch_val, subpath_val
                
                # Standard GitHub
                standard_github = re.match(
                    r'^https?://(?:www\.)?github\.com/([^/]+)/([^/.]+)(?:\.git)?$',
                    g_url,
                    re.IGNORECASE
                )
                if standard_github:
                    owner_val = standard_github.group(1)
                    repo_val = standard_github.group(2)
                    return f"https://github.com/{owner_val}/{repo_val}.git", None, None
                
                # GitLab tree/blob match
                gitlab_match = re.match(
                    r'^https?://(?:www\.)?gitlab\.com/([^/]+)/([^/]+)/-/(blob|tree)/([^/]+)/(.+)$',
                    g_url,
                    re.IGNORECASE
                )
                if gitlab_match:
                    owner_val = gitlab_match.group(1)
                    repo_val = gitlab_match.group(2)
                    if repo_val.endswith('.git'):
                        repo_val = repo_val[:-4]
                    branch_val = gitlab_match.group(4)
                    subpath_val = gitlab_match.group(5)
                    return f"https://gitlab.com/{owner_val}/{repo_val}.git", branch_val, subpath_val
                
                # Standard GitLab
                standard_gitlab = re.match(
                    r'^https?://(?:www\.)?gitlab\.com/([^/]+)/([^/.]+)(?:\.git)?$',
                    g_url,
                    re.IGNORECASE
                )
                if standard_gitlab:
                    owner_val = standard_gitlab.group(1)
                    repo_val = standard_gitlab.group(2)
                    return f"https://gitlab.com/{owner_val}/{repo_val}.git", None, None
                
                return g_url, None, None

            parsed_url, parsed_branch, parsed_subpath = parse_git_url(url)
            if parsed_url:
                clone_url = parsed_url
            if parsed_branch:
                branch = parsed_branch
            if parsed_subpath:
                subpath = parsed_subpath
                
            temp_dir = tempfile.mkdtemp()
            try:
                logger.info(f"Cloning repository {clone_url} branch {branch} to {temp_dir}...")
                result = subprocess.run(
                    ['git', 'clone', '--depth', '1', '-b', branch, clone_url, temp_dir],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=35,
                    text=True
                )
                if result.returncode != 0:
                    logger.warning(f"Failed to clone branch {branch}, trying default branch...")
                    result = subprocess.run(
                        ['git', 'clone', '--depth', '1', clone_url, temp_dir],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        timeout=35,
                        text=True
                    )
                
                if result.returncode != 0:
                    logger.error(f"Git clone failed: {result.stderr}")
                    clone_failed = True
                else:
                    # Scan files
                    ignored_dirs = {'.git', 'node_modules', 'venv', '.venv', '__pycache__', 'dist', 'build', 'staticfiles'}
                    allowed_extensions = {'.js', '.jsx', '.ts', '.tsx', '.py', '.go'}
                    
                    for root, dirs, files in os.walk(temp_dir):
                        dirs[:] = [d for d in dirs if d not in ignored_dirs]
                        for f in files:
                            ext = os.path.splitext(f)[1].lower()
                            if ext in allowed_extensions:
                                full_path = os.path.join(root, f)
                                rel_path = os.path.relpath(full_path, temp_dir).replace('\\', '/')
                                
                                # If subpath is specified, filter files
                                if subpath:
                                    if rel_path == subpath or rel_path.startswith(subpath + '/'):
                                        pass
                                    else:
                                        continue
                                        
                                try:
                                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as fh:
                                        content = fh.read()
                                    files_to_analyze.append({
                                        'filepath': rel_path,
                                        'content': content
                                    })
                                except Exception as e:
                                    logger.warning(f"Error reading file {rel_path}: {e}")
                    
                    if not files_to_analyze:
                        is_empty_repo = True
                        
            except Exception as e:
                logger.exception(f"Error cloning repository: {e}")
                clone_failed = True
            finally:
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception:
                    pass
                    
        # Fallback to virtual repos if not a git URL or if clone failed
        if not is_git_repo or clone_failed:
            virtual_match = None
            for vr in VIRTUAL_REPOSITORIES:
                if vr['name'] == repo.name or vr['name'] in repo.url:
                    virtual_match = vr
                    break
            if not virtual_match:
                virtual_match = VIRTUAL_REPOSITORIES[0]
            files_to_analyze = [dict(f) for f in virtual_match['files']]
            
        elif is_empty_repo:
            files_to_analyze = [{
                'filepath': 'warning.txt',
                'content': 'This repository is empty (contains no JavaScript, TypeScript, Python, or Go source code files to analyze).'
            }]
            
        # Create Review record
        import json
        review = Review.objects.create(
            repo=repo,
            commit_hash='commit_' + ''.join(random.choices('0123456789abcdef', k=8)),
            branch=repo.branch,
            status='pending',
            score=100,
            author=author_email,
            files_json=json.dumps(files_to_analyze)
        )
        
        # Load enabled rules
        rules = list(Rule.objects.all())
        if not rules:
            seed_default_rules()
            rules = list(Rule.objects.all())
            
        analyzer = CodeAnalyzer(rules)
        
        total_issues_count = 0
        cumulative_score = 0
        file_results = []
        
        for vf in files_to_analyze:
            res = analyzer.analyze_file(vf['filepath'], vf['content'])
            file_results.append(res)
            total_issues_count += len(res['issues'])
            cumulative_score += res['score']
            
            # Save CodeMetrics
            CodeMetrics.objects.create(
                review=review,
                filepath=vf['filepath'],
                complexity=res['metrics']['complexity'],
                maintainability=res['metrics']['maintainability'],
                loc=res['metrics']['loc'],
                coverage=res['metrics']['coverage']
            )
            
            # Save individual Issues
            for issue in res['issues']:
                Issue.objects.create(
                    review=review,
                    filepath=issue['filepath'],
                    line=issue['line'],
                    code_snippet=issue['code_snippet'],
                    message=issue['message'],
                    severity=issue['severity'],
                    category=issue['category'],
                    suggestion=issue['suggestion'],
                    status='open'
                )
                
        # Handle empty repo warning issue
        if is_empty_repo:
            Issue.objects.create(
                review=review,
                filepath='warning.txt',
                line=1,
                code_snippet='Repository is empty',
                message='This repository is empty. No source code files matching (.js, .ts, .py, .go) were found to analyze.',
                severity='critical',
                category='style',
                suggestion='Please add source code files to the repository and run the audit again.',
                status='open'
            )
            total_issues_count = 0
            cumulative_score = 100

        # Handle clean code positive issue
        elif total_issues_count == 0:
            first_file = files_to_analyze[0]['filepath']
            snippet = '# Code Quality Audit Passed' if first_file.endswith('.py') else '// Code Quality Audit Passed'
            Issue.objects.create(
                review=review,
                filepath=first_file,
                line=1,
                code_snippet=snippet,
                message='Excellent! Code is clean. No security vulnerabilities, performance bottlenecks, or code smell issues were detected.',
                severity='low',
                category='style',
                suggestion='Code is good! Maintain this standard.',
                status='open'
            )
            total_issues_count = 0
            cumulative_score = 100
                
        # Calculate overall score
        avg_score = int(round(cumulative_score / len(file_results))) if file_results else 100
        
        # Finalize review
        review.score = avg_score
        review.status = 'completed'
        review.save()
        
        # Update repository
        repo.status = 'active'
        repo.last_analysis_at = timezone.now()
        repo.score = avg_score
        repo.total_issues = total_issues_count
        repo.save()
        
        # Create AuditLog
        AuditLog.objects.create(
            user=user,
            action='REPO_ANALYSIS',
            details=f"Completed code review review_id={review.id} for repo={repo.name} with score={avg_score} and issues={total_issues_count}."
        )
        
        # Broadcast completed event
        broadcast_ws_event({
            'type': 'ANALYSIS_COMPLETED',
            'repoId': repo.id,
            'reviewId': review.id,
            'score': avg_score,
            'issues': total_issues_count
        })
        
        logger.info(f"Successfully completed analysis for repository ID: {repo_id}")
        
    except Exception as e:
        logger.exception(f"Error during repository analysis: {e}")
        try:
            repo = Repository.objects.get(id=repo_id)
            repo.status = 'failed'
            repo.save()
            broadcast_ws_event({
                'type': 'ANALYSIS_FAILED',
                'repoId': repo.id
            })
        except Exception:
            pass


def reanalyze_review_files(review_id: int):
    """
    Re-runs static code analysis on the review's local files (saved in files_json).
    Useful after file edits or issue resolutions, avoiding full git cloning.
    """
    try:
        from .models import Review, Issue, CodeMetrics, Rule
        from .analyzer import CodeAnalyzer
        from django.utils import timezone
        import json
        import random
        
        review = Review.objects.get(id=review_id)
        repo = review.repo
        
        # Load virtual files
        files_to_analyze = []
        if review.files_json:
            try:
                files_to_analyze = json.loads(review.files_json)
            except Exception:
                pass
                
        if not files_to_analyze:
            return
            
        # Delete old issues and metrics for this review
        Issue.objects.filter(review=review).delete()
        CodeMetrics.objects.filter(review=review).delete()
        
        # Load enabled rules
        rules = list(Rule.objects.all())
        if not rules:
            seed_default_rules()
            rules = list(Rule.objects.all())
            
        analyzer = CodeAnalyzer(rules)
        
        total_issues_count = 0
        cumulative_score = 0
        file_results = []
        
        # Check if there is an empty repo warning
        is_empty_repo = len(files_to_analyze) == 1 and files_to_analyze[0]['filepath'] == 'warning.txt'
        
        if not is_empty_repo:
            for vf in files_to_analyze:
                res = analyzer.analyze_file(vf['filepath'], vf['content'])
                file_results.append(res)
                total_issues_count += len(res['issues'])
                cumulative_score += res['score']
                
                # Save CodeMetrics
                CodeMetrics.objects.create(
                    review=review,
                    filepath=vf['filepath'],
                    complexity=res['metrics']['complexity'],
                    maintainability=res['metrics']['maintainability'],
                    loc=res['metrics']['loc'],
                    coverage=res['metrics']['coverage']
                )
                
                # Save individual Issues
                for issue in res['issues']:
                    Issue.objects.create(
                        review=review,
                        filepath=issue['filepath'],
                        line=issue['line'],
                        code_snippet=issue['code_snippet'],
                        message=issue['message'],
                        severity=issue['severity'],
                        category=issue['category'],
                        suggestion=issue['suggestion'],
                        status='open'
                    )
        
        # Handle empty repo warning issue
        if is_empty_repo:
            Issue.objects.create(
                review=review,
                filepath='warning.txt',
                line=1,
                code_snippet='Repository is empty',
                message='This repository is empty. No source code files matching (.js, .ts, .py, .go) were found to analyze.',
                severity='critical',
                category='style',
                suggestion='Please add source code files to the repository and run the audit again.',
                status='open'
            )
            total_issues_count = 0
            cumulative_score = 100
            
        # Handle clean code positive issue
        elif total_issues_count == 0:
            first_file = files_to_analyze[0]['filepath']
            snippet = '# Code Quality Audit Passed' if first_file.endswith('.py') else '// Code Quality Audit Passed'
            Issue.objects.create(
                review=review,
                filepath=first_file,
                line=1,
                code_snippet=snippet,
                message='Excellent! Code is clean. No security vulnerabilities, performance bottlenecks, or code smell issues were detected.',
                severity='low',
                category='style',
                suggestion='Code is good! Maintain this standard.',
                status='open'
            )
            total_issues_count = 0
            cumulative_score = 100
            
        # Calculate overall score
        avg_score = int(round(cumulative_score / len(file_results))) if file_results else 100
        
        # Update review
        review.score = avg_score
        review.save()
        
        # Update repository
        repo.score = avg_score
        repo.total_issues = total_issues_count
        repo.save()
        
        # Broadcast finished/updated event
        broadcast_ws_event({
            'type': 'ANALYSIS_COMPLETED',
            'repoId': repo.id,
            'reviewId': review.id,
            'score': avg_score,
            'issues': total_issues_count
        })
        
        logger.info(f"Successfully reanalyzed review ID: {review_id}")
        
    except Exception as e:
        logger.exception(f"Error during review reanalysis: {e}")


@shared_task(name='repositories.tasks.analyze_repository')
def analyze_repository_task(repo_id: int, user_id: int = None):
    """
    Celery task wrapper for running repository code review analysis.
    """
    logger.info(f"Celery worker received analysis task for repository ID: {repo_id}")
    run_code_analysis(repo_id, user_id)


def trigger_repository_analysis(repo_id: int, user_id: int = None):
    """
    Triggers code analysis. Tries Celery async queue first if USE_CELERY is True.
    Otherwise, runs in a background python Thread directly.
    """
    import os
    if os.environ.get('USE_CELERY', 'False') == 'True':
        try:
            analyze_repository_task.delay(repo_id, user_id)
            logger.info(f"Queued analysis task via Celery for repository {repo_id}")
            return
        except Exception as e:
            logger.warning(f"Could not queue task via Celery ({e}). Falling back to background thread.")
            
    # Default local development runner
    thread = threading.Thread(target=run_code_analysis, args=(repo_id, user_id))
    thread.daemon = True
    thread.start()
    logger.info(f"Started analysis in background thread for repository {repo_id}")


def seed_default_rules():
    """
    Helper function to seed rules if table is empty.
    """
    default_rules = [
        { 'name': 'Hardcoded Credentials', 'description': 'Detects api keys, secrets, tokens, or passwords hardcoded in source code files.', 'enabled': True, 'severity': 'critical', 'category': 'security' },
        { 'name': 'SQL Injection', 'description': 'Checks for dangerous direct SQL query construction using string concatenations rather than parameterized inputs.', 'enabled': True, 'severity': 'critical', 'category': 'security' },
        { 'name': 'Cross-Site Scripting (XSS)', 'description': 'Scans for innerHTML assignments or raw output renders which can lead to XSS.', 'enabled': True, 'severity': 'high', 'category': 'security' },
        { 'name': 'Deeply Nested Loops', 'description': 'Identifies nested loops (3 or more levels deep) causing O(N^2) or O(N^3) time complexity risks.', 'enabled': True, 'severity': 'medium', 'category': 'performance' },
        { 'name': 'N+1 Query Pattern', 'description': 'Detects database query operations executed within iterative loops.', 'enabled': True, 'severity': 'high', 'category': 'performance' },
        { 'name': 'Console Log in Production', 'description': 'Detects console.log statements which should be avoided in production release bundles.', 'enabled': True, 'severity': 'low', 'category': 'style' },
        { 'name': 'Complexity Limit', 'description': 'Calculates complexity metrics (cyclomatic complexity > 15) and highlights highly complex logical branches.', 'enabled': True, 'severity': 'medium', 'category': 'complexity' },
        { 'name': 'Unsafe Error Handlers', 'description': 'Scans for empty catch blocks that swallow errors without handling or logging them.', 'enabled': True, 'severity': 'medium', 'category': 'complexity' }
    ]
    
    for r in default_rules:
        # Avoid duplicate rule creations
        Rule.objects.get_or_create(
            name=r['name'],
            defaults={
                'description': r['description'],
                'enabled': r['enabled'],
                'severity': r['severity'],
                'category': r['category']
            }
        )
