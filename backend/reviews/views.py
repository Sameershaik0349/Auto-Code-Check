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
        
        # Load file contents
        virtual_files = []
        if instance.files_json and instance.files_json != '[]':
            try:
                import json
                virtual_files = json.loads(instance.files_json)
            except Exception:
                pass
                
        if not virtual_files:
            # Fallback to virtual repos matching
            repo = instance.repo
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

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def update_file(self, request, pk=None):
        instance = self.get_object()
        filepath = request.data.get('filepath')
        content = request.data.get('content')
        
        if not filepath or content is None:
            return Response({'error': 'Missing filepath or content'}, status=status.HTTP_400_BAD_REQUEST)
            
        import json
        virtual_files = []
        if instance.files_json:
            try:
                virtual_files = json.loads(instance.files_json)
            except Exception:
                pass
                
        # If empty, pre-populate it from fallbacks so we can edit it
        if not virtual_files:
            repo = instance.repo
            for vr in VIRTUAL_REPOSITORIES:
                if vr['name'] == repo.name or vr['name'] in repo.url:
                    virtual_files = [dict(f) for f in vr['files']]
                    break
            if not virtual_files:
                virtual_files = [dict(f) for f in VIRTUAL_REPOSITORIES[0]['files']]
                
        file_found = False
        for f in virtual_files:
            if f['filepath'] == filepath:
                f['content'] = content
                file_found = True
                break
                
        if not file_found:
            virtual_files.append({'filepath': filepath, 'content': content})
            
        instance.files_json = json.dumps(virtual_files)
        instance.save()
        
        # Broadcast file update to other clients via WebSockets
        try:
            from .tasks import broadcast_ws_event
            broadcast_ws_event({
                'type': 'FILE_UPDATED',
                'reviewId': instance.id,
                'filepath': filepath,
                'content': content
            })
        except Exception:
            pass
            
        # Re-run static analysis on updated files
        try:
            from .tasks import reanalyze_review_files
            reanalyze_review_files(instance.id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to reanalyze review: {e}")
            
        return Response({'success': True, 'message': 'File content updated successfully.'})


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
        
        # Auto-apply resolution if status is set to resolved
        if issue.status == 'resolved':
            review = issue.review
            filepath = issue.filepath
            line_number = issue.line
            
            # Load files_json
            import json
            files = []
            if review.files_json:
                try:
                    files = json.loads(review.files_json)
                except Exception:
                    pass
                    
            file_found = False
            for f in files:
                if f['filepath'] == filepath:
                    lines = f['content'].splitlines()
                    if 1 <= line_number <= len(lines):
                        orig_line = lines[line_number - 1]
                        
                        # Apply fix for Python syntax colon error or direct suggestion
                        if 'expected \':\'' in issue.message.lower() or 'colon' in issue.message.lower():
                            stripped = orig_line.rstrip()
                            if not stripped.endswith(':'):
                                lines[line_number - 1] = orig_line.rstrip('\r\n') + ':'
                                file_found = True
                        elif issue.suggestion and not any(kw in issue.suggestion.lower() for kw in ['fix the', 'ensure', 'recommended', 'refactor', 'replace']):
                            # Simple single-line replacement
                            lines[line_number - 1] = issue.suggestion
                            file_found = True
                            
                    if file_found:
                        f['content'] = '\n'.join(lines)
                        review.files_json = json.dumps(files)
                        review.save()
                        
                        # Broadcast file update to clients
                        try:
                            from .tasks import broadcast_ws_event
                            broadcast_ws_event({
                                'type': 'FILE_UPDATED',
                                'reviewId': review.id,
                                'filepath': filepath,
                                'content': f['content']
                            })
                        except Exception:
                            pass
                        
                        # Re-run static analysis on updated files
                        try:
                            from .tasks import reanalyze_review_files
                            reanalyze_review_files(review.id)
                        except Exception as e:
                            import logging
                            logging.getLogger(__name__).warning(f"Failed to reanalyze review: {e}")
                            
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
