from rest_framework import generics, permissions, viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import FriendRequest
from .serializers import (
    RegisterSerializer, CustomUserSerializer, CustomTokenObtainPairSerializer, FriendRequestSerializer
)
from reviews.models import AuditLog

User = get_user_model()

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = RegisterSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Log signup
        AuditLog.objects.create(
            user=user,
            action='SIGNUP',
            details=f"User {user.name} ({user.email}) registered as role: {user.role}."
        )

        return Response({
            "user": CustomUserSerializer(user, context=self.get_serializer_context()).data,
            "message": "User registered successfully."
        }, status=201)


class TeamMemberViewSet(viewsets.ModelViewSet):
    serializer_class = CustomUserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Return only the friends/collaborators of the current logged-in user
        if self.request.user.is_authenticated:
            return self.request.user.friends.all().order_by('-date_joined')
        return User.objects.none()

    def get_permissions(self):
        # Allow retrieval, creation, deletion, and update - custom permission rules are checked within methods
        return [permissions.IsAuthenticated()]

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        # Allow editing own profile or admin modification
        if instance != request.user and request.user.role != 'admin' and not request.user.is_staff:
            return Response({"error": "You do not have permission to edit this profile."}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        # Allow editing own profile or admin modification
        if instance != request.user and request.user.role != 'admin' and not request.user.is_staff:
            return Response({"error": "You do not have permission to edit this profile."}, status=status.HTTP_403_FORBIDDEN)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # 1. Self-deletion: Permanently delete their own profile from DB
        if instance == request.user:
            self.perform_destroy(instance)
            AuditLog.objects.create(
                user=None, # user is deleted
                action='PROFILE_DELETED',
                details=f"User {instance.email} has permanently deleted their own profile account."
            )
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        # 2. Unfriending: Just remove friendship relation (DO NOT delete the other user profile from DB!)
        request.user.friends.remove(instance)
        AuditLog.objects.create(
            user=request.user,
            action='COLLABORATOR_UNFRIENDED',
            details=f"User {request.user.email} unfriended {instance.email}."
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def create(self, request, *args, **kwargs):
        username = request.data.get('username', '').strip()
        if not username:
            return Response({'error': 'Username is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Check if the user already exists in the database
        user = User.objects.filter(username__iexact=username).first()
        created = False
        
        if not user:
            # Custom registration flow for inviting team members with only username
            data = request.data.copy()
            if 'name' not in data or not data['name']:
                data['name'] = username
            if 'email' not in data or not data['email']:
                data['email'] = f"{username.lower()}@platform.local"
            if 'password' not in data or not data['password']:
                data['password'] = "password"  # Default password
                
            serializer = RegisterSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            user = serializer.save()
            created = True
            
        from django.db.models import Q
        
        # Check if they are already friends
        if user in request.user.friends.all() or user == request.user:
            return Response({'error': 'You are already collaborators/friends or cannot add yourself.'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if a request is already pending
        existing_request = FriendRequest.objects.filter(
            Q(sender=request.user, receiver=user, status='pending') |
            Q(sender=user, receiver=request.user, status='pending')
        ).first()
        if existing_request:
            return Response({'error': 'Friend request is already pending.'}, status=status.HTTP_400_BAD_REQUEST)

        # Create a pending FriendRequest (do NOT add to friends list yet!)
        friend_request = FriendRequest.objects.create(
            sender=request.user,
            receiver=user,
            status='pending'
        )
        
        # Log action
        AuditLog.objects.create(
            user=request.user,
            action='FRIEND_REQUEST_SENT',
            details=f"User {request.user.email} sent a friend request to {user.username} ({user.email})."
        )

        # Broadcast WebSocket event in real-time to the target receiver
        try:
            from reviews.tasks import broadcast_ws_event
            broadcast_ws_event({
                'type': 'FRIEND_REQUEST',
                'id': str(friend_request.id),
                'sender': request.user.name or request.user.username,
                'senderUsername': request.user.username,
                'target': user.username
            })
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not broadcast friend request event: {e}")

        return Response(
            CustomUserSerializer(user).data, 
            status=status.HTTP_201_CREATED
        )


class FriendRequestViewSet(viewsets.ModelViewSet):
    serializer_class = FriendRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Return only pending received friend requests for the current user
        return FriendRequest.objects.filter(receiver=self.request.user, status='pending').order_by('-created_at')

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        friend_request = self.get_object()
        if friend_request.receiver != request.user:
            return Response({"error": "You cannot accept this request."}, status=status.HTTP_403_FORBIDDEN)
            
        friend_request.status = 'accepted'
        friend_request.save()

        # Add to friends list (symmetrical ManyToMany adds it on both sides)
        friend_request.sender.friends.add(friend_request.receiver)

        # Log action
        AuditLog.objects.create(
            user=request.user,
            action='FRIEND_REQUEST_ACCEPTED',
            details=f"User {request.user.email} accepted friend request from {friend_request.sender.email}."
        )

        # Broadcast real-time WebSocket event back to the sender
        try:
            from reviews.tasks import broadcast_ws_event
            broadcast_ws_event({
                'type': 'FRIEND_REQUEST_ACCEPTED',
                'sender': request.user.name or request.user.username,
                'senderUsername': request.user.username,
                'target': friend_request.sender.username
            })
        except Exception as e:
            pass

        return Response({"message": "Friend request accepted."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        friend_request = self.get_object()
        if friend_request.receiver != request.user:
            return Response({"error": "You cannot decline this request."}, status=status.HTTP_403_FORBIDDEN)

        # Delete the request to allow sending a new one in the future
        sender_username = friend_request.sender.username
        friend_request.delete()

        # Log action
        AuditLog.objects.create(
            user=request.user,
            action='FRIEND_REQUEST_DECLINED',
            details=f"User {request.user.email} declined friend request from {sender_username}."
        )

        # Broadcast real-time WebSocket event to the sender
        try:
            from reviews.tasks import broadcast_ws_event
            broadcast_ws_event({
                'type': 'FRIEND_REQUEST_DECLINED',
                'sender': request.user.name or request.user.username,
                'senderUsername': request.user.username,
                'target': sender_username
            })
        except Exception as e:
            pass

        return Response({"message": "Friend request declined."}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def sent(self, request):
        queryset = FriendRequest.objects.filter(sender=request.user, status='pending').order_by('-created_at')
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        friend_request = FriendRequest.objects.filter(pk=pk, sender=request.user, status='pending').first()
        if not friend_request:
            return Response({"error": "Friend request not found."}, status=status.HTTP_404_NOT_FOUND)

        receiver_username = friend_request.receiver.username
        friend_request.delete()

        # Log action
        AuditLog.objects.create(
            user=request.user,
            action='FRIEND_REQUEST_CANCELLED',
            details=f"User {request.user.email} cancelled friend request sent to {receiver_username}."
        )

        return Response({"message": "Friend request cancelled."}, status=status.HTTP_200_OK)
