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
                
        # Retrieve virtual files
        virtual_match = None
        for vr in VIRTUAL_REPOSITORIES:
            if vr['name'] == repo.name or vr['name'] in repo.url:
                virtual_match = vr
                break
        
        if not virtual_match:
            # Fallback to default
            virtual_match = VIRTUAL_REPOSITORIES[0]
            
        # Create Review record
        review = Review.objects.create(
            repo=repo,
            commit_hash='commit_' + ''.join(random.choices('0123456789abcdef', k=8)),
            branch=repo.branch,
            status='pending',
            score=100,
            author=author_email
        )
        
        # Load enabled rules
        rules = list(Rule.objects.all())
        if not rules:
            # Seed default rules if not exist yet
            seed_default_rules()
            rules = list(Rule.objects.all())
            
        analyzer = CodeAnalyzer(rules)
        
        total_issues_count = 0
        cumulative_score = 0
        file_results = []
        
        for vf in virtual_match['files']:
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
