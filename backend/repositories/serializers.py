from rest_framework import serializers
from .models import Repository

class RepositorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Repository
        fields = '__all__'
        read_only_fields = ('id', 'created_at', 'last_analysis_at', 'score', 'total_issues', 'status')
