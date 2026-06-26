from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Review, Issue, Comment, Rule, CodeMetrics, AuditLog
from .serializers import (
    ReviewSerializer, IssueSerializer, CommentSerializer, 
    RuleSerializer, CodeMetricsSerializer
)
from .virtual_repos import VIRTUAL_REPOSITORIES

class ReviewViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Review.objects.all().order_by('-created_at')
    serializer_class = ReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Review.objects.all().order_by('-created_at')
        repo_id = self.request.query_params.get('repoId')
        if repo_id is not None:
            queryset = queryset.filter(repo_id=repo_id)
        return queryset

    def retrieve(self, request, *args, **kwargs):
        """
        Custom retrieve method returning review meta along with issues, metrics, 
        comments, and virtual files source code.
        """
        instance = self.get_object()
        
        issues = Issue.objects.filter(review=instance)
        metrics = CodeMetrics.objects.filter(review=instance)
        comments = Comment.objects.filter(review=instance)
        
        # Load virtual file contents to show code in diff editor
        repo = instance.repo
        virtual_files = []
        for vr in VIRTUAL_REPOSITORIES:
            if vr['name'] == repo.name or vr['name'] in repo.url:
                virtual_files = vr['files']
                break
        if not virtual_files:
            virtual_files = VIRTUAL_REPOSITORIES[0]['files']

        return Response({
            'review': self.get_serializer(instance).data,
            'issues': IssueSerializer(issues, many=True).data,
            'metrics': CodeMetricsSerializer(metrics, many=True).data,
            'comments': CommentSerializer(comments, many=True).data,
            'files': virtual_files
        })


class IssueViewSet(viewsets.ModelViewSet):
    queryset = Issue.objects.all().order_by('-id')
    serializer_class = IssueSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Issue.objects.all().order_by('-id')
        review_id = self.request.query_params.get('reviewId')
        if review_id is not None:
            queryset = queryset.filter(review_id=review_id)
        return queryset

    def perform_update(self, serializer):
        issue = serializer.save()
        try:
            from .tasks import broadcast_ws_event
            broadcast_ws_event({
                'type': 'ISSUE_UPDATED',
                'reviewId': issue.review.id,
                'issue': IssueSerializer(issue).data
            })
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not broadcast issue update event: {e}")

    @action(detail=True, methods=['post'])
    def fix(self, request, pk=None):
        """
        Simulate AI patch generation, returning replacement code snippet
        """
        issue = self.get_object()
        return Response({
            'success': True,
            'issueId': issue.id,
            'filepath': issue.filepath,
            'line': issue.line,
            'originalCode': issue.code_snippet,
            'fixedCode': issue.suggestion
        })


class CommentViewSet(viewsets.ModelViewSet):
    queryset = Comment.objects.all().order_by('created_at')
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Comment.objects.all().order_by('created_at')
        review_id = self.request.query_params.get('reviewId')
        if review_id is not None:
            queryset = queryset.filter(review=review_id)
        return queryset

    def perform_create(self, serializer):
        # Retrieve reviewId from request data
        review_id = self.request.data.get('reviewId') or self.request.data.get('review')
        review = Review.objects.get(id=review_id)
        
        comment = serializer.save(
            user=self.request.user,
            review=review
        )
        
        # Save audit log for collaborative comments
        AuditLog.objects.create(
            user=self.request.user,
            action='ISSUE_COMMENT',
            details=f"Comment posted on {comment.filepath}:{comment.line} for review {review.id}."
        )

        # Broadcast comment in real-time
        try:
            from .tasks import broadcast_ws_event
            broadcast_ws_event({
                'type': 'NEW_COMMENT',
                'reviewId': review.id,
                'comment': CommentSerializer(comment).data
            })
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not broadcast comment event: {e}")


class RuleViewSet(viewsets.ModelViewSet):
    queryset = Rule.objects.all().order_by('name')
    serializer_class = RuleSerializer
    permission_classes = [permissions.IsAuthenticated]
