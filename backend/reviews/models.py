from django.db import models
from django.conf import settings

class Review(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('completed', 'Completed'),
    )

    repo = models.ForeignKey('repositories.Repository', on_delete=models.CASCADE, related_name='reviews')
    commit_hash = models.CharField(max_length=40)
    branch = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    score = models.IntegerField(default=100)
    author = models.CharField(max_length=255)
    files_json = models.TextField(default='[]', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Review {self.id} for {self.repo.name} ({self.status})"


class Issue(models.Model):
    SEVERITY_CHOICES = (
        ('critical', 'Critical'),
        ('high', 'High'),
        ('medium', 'Medium'),
        ('low', 'Low'),
    )
    CATEGORY_CHOICES = (
        ('security', 'Security'),
        ('performance', 'Performance'),
        ('complexity', 'Complexity'),
        ('style', 'Style'),
    )
    STATUS_CHOICES = (
        ('open', 'Open'),
        ('resolved', 'Resolved'),
        ('false_positive', 'False Positive'),
    )

    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name='issues')
    filepath = models.CharField(max_length=500)
    line = models.IntegerField()
    code_snippet = models.TextField()
    message = models.TextField()
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    suggestion = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.severity} issue in {self.filepath}:{self.line}"


class Comment(models.Model):
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name='comments')
    filepath = models.CharField(max_length=500)
    line = models.IntegerField()
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='comments')
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Comment by {self.user.username} on {self.filepath}:{self.line}"


class Rule(models.Model):
    SEVERITY_CHOICES = (
        ('critical', 'Critical'),
        ('high', 'High'),
        ('medium', 'Medium'),
        ('low', 'Low'),
    )
    CATEGORY_CHOICES = (
        ('security', 'Security'),
        ('performance', 'Performance'),
        ('complexity', 'Complexity'),
        ('style', 'Style'),
    )

    name = models.CharField(max_length=100)
    description = models.TextField()
    enabled = models.BooleanField(default=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='medium')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='style')

    def __str__(self):
        return f"Rule: {self.name} ({self.category})"


class CodeMetrics(models.Model):
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name='metrics')
    filepath = models.CharField(max_length=500)
    complexity = models.IntegerField()
    maintainability = models.IntegerField()
    loc = models.IntegerField()
    coverage = models.IntegerField()

    def __str__(self):
        return f"Metrics for {self.filepath}"


class AuditLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    action = models.CharField(max_length=50)
    details = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.action}] by {self.user} at {self.created_at}"
