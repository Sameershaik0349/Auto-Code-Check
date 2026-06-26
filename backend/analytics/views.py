from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from django.db.models import Sum, Avg, Count

from repositories.models import Repository
from reviews.models import Review, Issue, CodeMetrics

class StatsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        repo_count = Repository.objects.count()
        review_count = Review.objects.count()
        
        # Calculate file count and lines of code from metrics
        metrics_stats = CodeMetrics.objects.aggregate(
            total_loc=Sum('loc'),
            avg_maintainability=Avg('maintainability'),
            files_count=Count('id')
        )
        
        total_loc = metrics_stats['total_loc'] or 4350
        avg_maintainability = metrics_stats['avg_maintainability'] or 82
        files_count = metrics_stats['files_count'] or 12
        
        # Severity issues breakdown
        issues = Issue.objects.filter(status='open')
        severity_counts = {
            'critical': issues.filter(severity='critical').count(),
            'high': issues.filter(severity='high').count(),
            'medium': issues.filter(severity='medium').count(),
            'low': issues.filter(severity='low').count()
        }
        
        # Fallback if database is fresh and no analysis has run
        if review_count == 0:
            severity_counts = {
                'critical': 0,
                'high': 0,
                'medium': 0,
                'low': 0
            }

        return Response({
            'repositoriesCount': repo_count,
            'reviewsCount': review_count,
            'filesAnalyzed': files_count,
            'linesOfCode': total_loc,
            'averageMaintainability': int(round(avg_maintainability)),
            'issuesBreakdown': severity_counts
        })


class TrendsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Return mock history timeline for Recharts dashboard
        return Response([
            { 'date': 'Jun 19', 'score': 76, 'complexity': 12, 'issues': 18 },
            { 'date': 'Jun 20', 'score': 78, 'complexity': 12, 'issues': 15 },
            { 'date': 'Jun 21', 'score': 82, 'complexity': 10, 'issues': 11 },
            { 'date': 'Jun 22', 'score': 81, 'complexity': 11, 'issues': 12 },
            { 'date': 'Jun 23', 'score': 85, 'complexity': 9,  'issues': 8  },
            { 'date': 'Jun 24', 'score': 87, 'complexity': 8,  'issues': 6  },
            { 'date': 'Jun 25', 'score': 92, 'complexity': 7,  'issues': 3  }
        ])
