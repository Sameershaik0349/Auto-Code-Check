import React, { useEffect, useState, useRef } from 'react';
import { PhoneCall, PhoneOff, X, UserPlus } from 'lucide-react';
import { useAuthStore, API_BASE } from './store/authStore';
import { useRepoStore } from './store/repoStore';
import { useReviewStore } from './store/reviewStore';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { CodeLoaderSplash } from './components/CodeLoaderSplash';

import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { Repositories } from './pages/Repositories';
import { CodeReview } from './pages/CodeReview';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';
import { CollabLounge } from './pages/CollabLounge';

export const App: React.FC = () => {
  const { isAuthenticated, initialize } = useAuthStore();
  const { updateRepoStatus, fetchRepos } = useRepoStore();
  const { 
    fetchReviews, 
    addCommentLocally, 
    updateIssueLocally, 
    setSocket, 
    triggerWsListeners, 
    setAutoJoinCall,
    socket
  } = useReviewStore();
  
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('splash_shown'));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
  
  // Real-time states
  const [wsConnected, setWsConnected] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [huddleInvite, setHuddleInvite] = useState<{ sender: string; senderUsername: string } | null>(null);
  const [huddleDecline, setHuddleDecline] = useState<{ sender: string; senderUsername: string } | null>(null);
  const [friendRequestInvite, setFriendRequestInvite] = useState<{ id: string; sender: string; senderUsername: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Initialize auth credentials
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Auto-dismiss huddle decline toasts
  useEffect(() => {
    if (huddleDecline) {
      const timer = setTimeout(() => {
        setHuddleDecline(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [huddleDecline]);

  // Establish WebSockets connections once authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      if (wsRef.current) {
        wsRef.current.close();
      }
      return;
    }

    const connectWebSocket = () => {
      // Connect to Django Daphne channels server dynamically
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/reviews/`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setSocket(ws);
        console.log('Django Channels WebSocket connected successfully.');
      };

      ws.onclose = () => {
        setWsConnected(false);
        setSocket(null);
        console.log('WebSocket connection lost. Retrying in 5 seconds...');
        setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket connection error:', err);
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);
          triggerWsListeners(data);
          
          if (data.type === 'ANALYSIS_STARTED') {
            const notifMsg = `Code audit started for repository: ${data.name || 'project'}`;
            setNotifications(prev => [notifMsg, ...prev]);
            updateRepoStatus(data.repoId, 'analyzing');
          } 
          else if (data.type === 'ANALYSIS_COMPLETED') {
            const notifMsg = `Audit completed successfully. Repository score: ${data.score}% with ${data.issues} issues.`;
            setNotifications(prev => [notifMsg, ...prev]);
            
            // Update repository state details locally
            updateRepoStatus(data.repoId, 'active', {
              score: data.score,
              total_issues: data.issues,
              last_analysis_at: new Date().toISOString()
            });
            
            // Refresh reviews & repos list caches
            fetchReviews();
            fetchRepos();
          }
          else if (data.type === 'ANALYSIS_FAILED') {
            const notifMsg = `Repository analysis failed. Please verify source files.`;
            setNotifications(prev => [notifMsg, ...prev]);
            updateRepoStatus(data.repoId, 'failed');
          }
          else if (data.type === 'NEW_COMMENT') {
            addCommentLocally(data.comment);
            const notifMsg = `[Comment] ${data.comment.user_details.name} commented on line ${data.comment.line}: "${data.comment.text.substring(0, 30)}${data.comment.text.length > 30 ? '...' : ''}"`;
            setNotifications(prev => [notifMsg, ...prev]);
          }
          else if (data.type === 'ISSUE_UPDATED') {
            updateIssueLocally(data.issue);
            const notifMsg = `[Issue Resolved] Issue on line ${data.issue.line} in ${data.issue.filepath.split('/').pop()} marked as ${data.issue.status}.`;
            setNotifications(prev => [notifMsg, ...prev]);
          }
          else if (data.type === 'TEAM_MEMBER_INVITED') {
            const notifMsg = `🎉 Friend ${data.user.name} (@${data.user.username}) invited to collaborate!`;
            setNotifications(prev => [notifMsg, ...prev]);
          }
          else if (data.type === 'HUDDLE_INVITE') {
            const { sender, senderUsername, target } = data;
            const currentUserObj = useAuthStore.getState().user;
            console.log("Processing HUDDLE_INVITE. Target:", target, "CurrentUser:", currentUserObj?.username);
            if (currentUserObj && target && currentUserObj.username && target.toLowerCase() === currentUserObj.username.toLowerCase()) {
              const notifMsg = `🔔 Huddle invitation from ${sender} (@${senderUsername})`;
              setNotifications(prev => [notifMsg, ...prev]);
              setHuddleInvite({ sender, senderUsername });
            }
          }
          else if (data.type === 'HUDDLE_ACCEPT') {
            const { sender, senderUsername, target } = data;
            const currentUserObj = useAuthStore.getState().user;
            console.log("Processing HUDDLE_ACCEPT. Target:", target, "CurrentUser:", currentUserObj?.username);
            if (currentUserObj && target && currentUserObj.username && target.toLowerCase() === currentUserObj.username.toLowerCase()) {
              const notifMsg = `✅ ${sender} (@${senderUsername}) accepted your call invite!`;
              setNotifications(prev => [notifMsg, ...prev]);
              setAutoJoinCall(true);
              setActiveTab('lounge');
            }
          }
          else if (data.type === 'HUDDLE_DECLINE') {
            const { sender, senderUsername, target } = data;
            const currentUserObj = useAuthStore.getState().user;
            console.log("Processing HUDDLE_DECLINE. Target:", target, "CurrentUser:", currentUserObj?.username);
            if (currentUserObj && target && currentUserObj.username && target.toLowerCase() === currentUserObj.username.toLowerCase()) {
              const notifMsg = `❌ ${sender} (@${senderUsername}) declined your call invite.`;
              setNotifications(prev => [notifMsg, ...prev]);
              setHuddleDecline({ sender, senderUsername });
            }
          }
          else if (data.type === 'FRIEND_REQUEST') {
            const { id, sender, senderUsername, target } = data;
            const currentUserObj = useAuthStore.getState().user;
            if (currentUserObj && target && currentUserObj.username && target.toLowerCase() === currentUserObj.username.toLowerCase()) {
              const notifMsg = `🔔 Friend request from ${sender} (@${senderUsername})`;
              setNotifications(prev => [notifMsg, ...prev]);
              setFriendRequestInvite({ id, sender, senderUsername });
            }
          }
          else if (data.type === 'FRIEND_REQUEST_ACCEPTED') {
            const { sender, senderUsername, target } = data;
            const currentUserObj = useAuthStore.getState().user;
            if (currentUserObj && target && currentUserObj.username && target.toLowerCase() === currentUserObj.username.toLowerCase()) {
              const notifMsg = `🎉 ${sender} (@${senderUsername}) accepted your friend request!`;
              setNotifications(prev => [notifMsg, ...prev]);
              window.dispatchEvent(new CustomEvent('friend-list-update'));
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message data', err);
        }
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isAuthenticated, updateRepoStatus, fetchReviews, fetchRepos]);

  const handleAcceptFriendRequest = async (id: string) => {
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/friend-requests/${id}/accept/`, {
        method: 'POST',
        headers
      });
      if (!response.ok) throw new Error('Failed to accept friend request');
      
      setFriendRequestInvite(null);
      window.dispatchEvent(new CustomEvent('friend-list-update'));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeclineFriendRequest = async (id: string) => {
    try {
      const headers = useAuthStore.getState().getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/friend-requests/${id}/decline/`, {
        method: 'POST',
        headers
      });
      if (!response.ok) throw new Error('Failed to decline friend request');
      
      setFriendRequestInvite(null);
      window.dispatchEvent(new CustomEvent('friend-list-update'));
    } catch (err) {
      console.error(err);
    }
  };

  if (showSplash) {
    return (
      <CodeLoaderSplash 
        onComplete={() => {
          sessionStorage.setItem('splash_shown', 'true');
          setShowSplash(false);
        }} 
      />
    );
  }

  if (!isAuthenticated) {
    return <Auth />;
  }

  // View router
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard 
            onViewReview={(id) => {
              setSelectedReviewId(id);
              setActiveTab('review-details');
            }} 
          />
        );
      case 'repos':
        return (
          <Repositories 
            onViewReview={(id) => {
              setSelectedReviewId(id);
              setActiveTab('review-details');
            }} 
          />
        );
      case 'review-details':
        return selectedReviewId ? (
          <CodeReview 
            reviewId={selectedReviewId} 
            onBack={() => setActiveTab('repos')} 
          />
        ) : (
          <div className="p-8 text-center text-slate-400">Select a repository review to view details.</div>
        );
      case 'analytics':
        return <Analytics />;
      case 'settings':
        return <Settings />;
      case 'team':
        return <Team />;
      case 'lounge':
        return <CollabLounge />;
      default:
        return <Dashboard onViewReview={(id) => { setSelectedReviewId(id); setActiveTab('review-details'); }} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-darkBg text-slate-800 dark:text-slate-100 flex transition-colors duration-200">
      {/* Sidebar navigation */}
      <Sidebar activeTab={activeTab === 'review-details' ? 'repos' : activeTab} setActiveTab={setActiveTab} />
      
      {/* Main panel layout */}
      <div className="flex-1 pl-64 flex flex-col min-h-screen overflow-hidden">
        <Header 
          title={activeTab} 
          wsConnected={wsConnected} 
          notifications={notifications}
          clearNotifications={() => setNotifications([])}
        />
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      {/* Floating notifications container on bottom right (stacked cleanly, non-blocking viewport) */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none items-end">
        {huddleInvite && (
          <div className="pointer-events-auto animate-slide-in w-80 bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-2xl overflow-hidden flex items-start gap-4">
            {/* Pulsing call icon */}
            <div className="relative h-12 w-12 shrink-0 bg-indigo-600/10 border border-indigo-500/30 rounded-full flex items-center justify-center text-indigo-400">
              <span className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
              <PhoneCall className="h-5 w-5" />
            </div>

            <div className="flex-1 space-y-3">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-100">Incoming Huddle Call</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  <strong>{huddleInvite.sender}</strong> (@{huddleInvite.senderUsername}) has invited you to a call.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const currentUserObj = useAuthStore.getState().user;
                    if (socket && socket.readyState === WebSocket.OPEN && currentUserObj) {
                      socket.send(JSON.stringify({
                        type: 'HUDDLE_DECLINE',
                        sender: currentUserObj.name || currentUserObj.username,
                        senderUsername: currentUserObj.username,
                        target: huddleInvite.senderUsername
                      }));
                    }
                    setHuddleInvite(null);
                  }}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold border border-slate-750 transition-all"
                >
                  Decline
                </button>
                <button
                  onClick={() => {
                    const currentUserObj = useAuthStore.getState().user;
                    if (socket && socket.readyState === WebSocket.OPEN && currentUserObj) {
                      socket.send(JSON.stringify({
                        type: 'HUDDLE_ACCEPT',
                        sender: currentUserObj.name || currentUserObj.username,
                        senderUsername: currentUserObj.username,
                        target: huddleInvite.senderUsername
                      }));
                    }
                    setAutoJoinCall(true);
                    setActiveTab('lounge');
                    setHuddleInvite(null);
                  }}
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-all shadow shadow-indigo-600/20"
                >
                  Accept & Join
                </button>
              </div>
            </div>
          </div>
        )}

        {huddleDecline && (
          <div className="pointer-events-auto animate-slide-in w-80 bg-slate-900 border border-red-500/30 rounded-2xl p-5 shadow-2xl overflow-hidden flex items-start gap-4 relative">
            <button 
              onClick={() => setHuddleDecline(null)}
              className="absolute top-3 right-3 text-slate-500 hover:text-slate-350 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {/* Pulsing decline icon */}
            <div className="relative h-12 w-12 shrink-0 bg-red-650/10 border border-red-500/30 rounded-full flex items-center justify-center text-red-400">
              <span className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
              <PhoneOff className="h-5 w-5" />
            </div>

            <div className="flex-1 space-y-1 pr-4">
              <h4 className="text-sm font-bold text-slate-100">Huddle Declined</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <strong>{huddleDecline.sender}</strong> (@{huddleDecline.senderUsername}) declined your call invite.
              </p>
            </div>
          </div>
        )}

        {friendRequestInvite && (
          <div className="pointer-events-auto animate-slide-in w-80 bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-2xl overflow-hidden flex items-start gap-4">
            <div className="relative h-12 w-12 shrink-0 bg-indigo-600/10 border border-indigo-500/30 rounded-full flex items-center justify-center text-indigo-400">
              <span className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
              <UserPlus className="h-5 w-5" />
            </div>

            <div className="flex-1 space-y-3">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-100">Friend Request</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  <strong>{friendRequestInvite.sender}</strong> (@{friendRequestInvite.senderUsername}) wants to be friends.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleDeclineFriendRequest(friendRequestInvite.id)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold border border-slate-750 transition-all"
                >
                  Decline
                </button>
                <button
                  onClick={() => handleAcceptFriendRequest(friendRequestInvite.id)}
                  className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-all shadow shadow-indigo-600/20"
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default App;
