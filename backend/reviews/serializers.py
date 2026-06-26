from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Review, Issue, Comment, Rule, CodeMetrics, AuditLog
from authentication.serializers import CustomUserSerializer

User = get_user_model()

class RuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Rule
        fields = '__all__'


class CodeMetricsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodeMetrics
        fields = '__all__'


class IssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Issue
        fields = '__all__'


class CommentSerializer(serializers.ModelSerializer):
    user_details = CustomUserSerializer(source='user', read_only=True)

    class Meta:
        model = Comment
        fields = ('id', 'review', 'filepath', 'line', 'user', 'user_details', 'text', 'created_at')
        read_only_fields = ('id', 'user', 'created_at')


class ReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = '__all__'


class AuditLogSerializer(serializers.ModelSerializer):
    user_details = CustomUserSerializer(source='user', read_only=True)

    class Meta:
        model = AuditLog
        fields = ('id', 'user', 'user_details', 'action', 'details', 'created_at')
