from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenBlacklistView,
)

from authentication.views import RegisterView, TeamMemberViewSet, CustomTokenObtainPairView, FriendRequestViewSet
from repositories.views import RepositoryViewSet
from reviews.views import ReviewViewSet, IssueViewSet, CommentViewSet, RuleViewSet
from analytics.views import StatsView, TrendsView

router = DefaultRouter()
router.register(r'repos', RepositoryViewSet, basename='repository')
router.register(r'reviews', ReviewViewSet, basename='review')
router.register(r'issues', IssueViewSet, basename='issue')
router.register(r'comments', CommentViewSet, basename='comment')
router.register(r'rules', RuleViewSet, basename='rule')
router.register(r'team/members', TeamMemberViewSet, basename='team-member')
router.register(r'team/friend-requests', FriendRequestViewSet, basename='friend-request')

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Auth routing
    path('api/auth/signup/', RegisterView.as_view(), name='auth_signup'),
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/logout/', TokenBlacklistView.as_view(), name='token_blacklist'),
    
    # Analytics routing
    path('api/analytics/stats/', StatsView.as_view(), name='analytics_stats'),
    path('api/analytics/trends/', TrendsView.as_view(), name='analytics_trends'),
    
    # Resource routing
    path('api/', include(router.urls)),
    
    # Catch-all route to serve the React SPA index.html for any client-side routes
    re_path(r'^.*$', TemplateView.as_view(template_name='index.html'), name='index'),
]
