from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()

class CustomUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'name', 'role', 'avatar', 'date_joined')
        read_only_fields = ('id', 'date_joined')


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    name = serializers.CharField(required=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'name', 'role')

    def create(self, validated_data):
        name = validated_data.pop('name')
        password = validated_data.pop('password')
        role = validated_data.get('role', 'developer')
        
        avatar = f"https://api.dicebear.com/7.x/adventurer/svg?seed={name}"
        
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=password,
            role=role,
            avatar=avatar
        )
        user.name = name
        user.save()
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        
        # Rename default keys to match frontend Zustand expectations
        data['accessToken'] = data.pop('access')
        data['refreshToken'] = data.pop('refresh')
        
        data['user'] = {
            'id': str(self.user.id),
            'username': self.user.username,
            'email': self.user.email,
            'name': self.user.name or self.user.username,
            'avatar': self.user.avatar or f"https://api.dicebear.com/7.x/adventurer/svg?seed={self.user.username}",
            'role': self.user.role
        }
        
        return data


from .models import FriendRequest

class FriendRequestSerializer(serializers.ModelSerializer):
    sender_details = CustomUserSerializer(source='sender', read_only=True)
    receiver_details = CustomUserSerializer(source='receiver', read_only=True)

    class Meta:
        model = FriendRequest
        fields = ('id', 'sender', 'receiver', 'sender_details', 'receiver_details', 'status', 'created_at')
        read_only_fields = ('id', 'sender', 'status', 'created_at')
