from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Repository
from .serializers import RepositorySerializer
from reviews.tasks import trigger_repository_analysis
from reviews.models import AuditLog

class RepositoryViewSet(viewsets.ModelViewSet):
    queryset = Repository.objects.all().order_by('-created_at')
    serializer_class = RepositorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        # Infer language from name or URL
        url = self.request.data.get('url', '')
        name = self.request.data.get('name', '')
        
        language = 'JavaScript'
        if '.py' in url or 'python' in name.lower() or 'py-' in name.lower():
            language = 'Python'
        elif '.go' in url or 'go-' in name.lower() or 'golang' in name.lower():
            language = 'Go'
            
        repo = serializer.save(
            owner=self.request.data.get('owner', 'external'),
            language=language
        )
        
        AuditLog.objects.create(
            user=self.request.user,
            action='REPO_CONNECT',
            details=f"Connected repository {repo.name} ({repo.url}) with branch {repo.branch}."
        )

    def perform_destroy(self, instance):
        AuditLog.objects.create(
            user=self.request.user,
            action='REPO_DELETE',
            details=f"Deleted repository {instance.name}."
        )
        instance.delete()

    @action(detail=True, methods=['post'])
    def analyze(self, request, pk=None):
        repo = self.get_object()
        
        # Check if already analyzing
        if repo.status == 'analyzing':
            return Response({'error': 'Repository is already undergoing analysis.'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Update status
        repo.status = 'analyzing'
        repo.save()
        
        # Trigger Celery or Thread fallback
        trigger_repository_analysis(repo.id, request.user.id)
        
        return Response({'status': 'Analysis scheduled', 'message': 'Code quality audit has been queued.'})
