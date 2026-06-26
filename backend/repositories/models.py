from django.db import models

class Repository(models.Model):
    STATUS_CHOICES = (
        ('active', 'Active'),
        ('analyzing', 'Analyzing'),
        ('failed', 'Failed'),
    )

    name = models.CharField(max_length=255)
    owner = models.CharField(max_length=255, default='external')
    url = models.URLField(max_length=500)
    branch = models.CharField(max_length=100, default='main')
    language = models.CharField(max_length=100, default='JavaScript')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    last_analysis_at = models.DateTimeField(null=True, blank=True)
    score = models.IntegerField(null=True, blank=True)
    total_issues = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.owner}/{self.name} ({self.language})"
