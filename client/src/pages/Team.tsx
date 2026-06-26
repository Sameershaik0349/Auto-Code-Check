import React, { useEffect, useState } from 'react';
import { useAuthStore, API_BASE } from '../store/authStore';
import { useReviewStore } from '../store/reviewStore';
import { UserPlus, CheckCircle, User, Video, UserMinus, UserCheck } from 'lucide-react';

interface TeamMember {
  id: string;
  username: string;
  email: string;
  name: string;
  avatar: string;
  role: 'admin' | 'reviewer' | 'developer';
  date_joined: string;
}

interface FriendRequest {
  id: string;
  sender: string;
  sender_details: {
    id: string;
    username: string;
    email: string;
    name: string;
    avatar: string;
    role: string;
  };
  receiver_details: {
    id: string;
    username: string;
    email: string;
    name: string;
    avatar: string;
    role: string;
  };
  status: string;
  created_at: string;
}

export const Team: React.FC = () => {
  const { user: currentUser, getAuthHeaders } = useAuthStore();
  const { socket } = useReviewStore();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form states
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('developer');
  const [formSuccess, setFormSuccess] = useState('');
  const [formError, setFormError] = useState('');

  const handleInviteToHuddle = (targetUsername: string) => {
    if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
      socket.send(JSON.stringify({
        type: 'HUDDLE_INVITE',
        sender: currentUser.name || currentUser.username,
        senderUsername: currentUser.username,
        target: targetUsername
      }));
      setFormSuccess(`Sent Collaboration invite to @${targetUsername}!`);
      setTimeout(() => setFormSuccess(''), 4000);
    } else {
      setFormError('Real-time connection is currently offline.');
    }
  };

  const handleUnfriend = async (memberId: string, memberUsername: string) => {
    if (!window.confirm(`Are you sure you want to remove @${memberUsername} from your collaborators?`)) {
      return;
    }

    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/members/${memberId}/`, {
        method: 'DELETE',
        headers
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove collaborator');
      }

      setFormSuccess(`Successfully removed @${memberUsername} from collaborators.`);
      setTimeout(() => setFormSuccess(''), 4000);
      fetchMembers();
    } catch (err: any) {
      setFormError(err.message);
      setTimeout(() => setFormError(''), 4000);
    }
  };

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/members/`, { headers });
      const data = await response.json();
      
      const results = data.results !== undefined ? data.results : data;
      setMembers(results);
    } catch (err) {
      console.error('Failed to load team members', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/friend-requests/`, { headers });
      if (!response.ok) throw new Error('Failed to load pending friend requests');
      const data = await response.json();
      const results = data.results !== undefined ? data.results : data;
      setPendingRequests(results);
    } catch (err) {
      console.error('Failed to load pending requests', err);
    }
  };

  const fetchSentRequests = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/friend-requests/sent/`, { headers });
      if (!response.ok) throw new Error('Failed to load sent friend requests');
      const data = await response.json();
      const results = data.results !== undefined ? data.results : data;
      setSentRequests(results);
    } catch (err) {
      console.error('Failed to load sent requests', err);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/friend-requests/${requestId}/accept/`, {
        method: 'POST',
        headers
      });
      if (!response.ok) throw new Error('Failed to accept request');
      
      setFormSuccess('Friend request accepted!');
      setTimeout(() => setFormSuccess(''), 4000);
      fetchMembers();
      fetchPendingRequests();
      fetchSentRequests();
    } catch (err: any) {
      setFormError(err.message);
      setTimeout(() => setFormError(''), 4000);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/friend-requests/${requestId}/decline/`, {
        method: 'POST',
        headers
      });
      if (!response.ok) throw new Error('Failed to decline request');
      
      setFormSuccess('Friend request declined.');
      setTimeout(() => setFormSuccess(''), 4000);
      fetchPendingRequests();
      fetchSentRequests();
    } catch (err: any) {
      setFormError(err.message);
      setTimeout(() => setFormError(''), 4000);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/friend-requests/${requestId}/cancel/`, {
        method: 'POST',
        headers
      });
      if (!response.ok) throw new Error('Failed to cancel request');
      
      setFormSuccess('Friend invitation cancelled.');
      setTimeout(() => setFormSuccess(''), 4000);
      fetchSentRequests();
    } catch (err: any) {
      setFormError(err.message);
      setTimeout(() => setFormError(''), 4000);
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchPendingRequests();
    fetchSentRequests();

    const handleUpdate = () => {
      fetchMembers();
      fetchPendingRequests();
      fetchSentRequests();
    };

    window.addEventListener('friend-list-update', handleUpdate);
    return () => {
      window.removeEventListener('friend-list-update', handleUpdate);
    };
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!username || !username.trim()) {
      setFormError('Please enter a username.');
      return;
    }

    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/team/members/`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: username.trim(), role })
      });

      if (!response.ok) {
        const data = await response.json();
        const errMsg = data.username ? `Username "${username}" is already taken.` : (data.error || 'Failed to add team member');
        throw new Error(errMsg);
      }

      setFormSuccess(`Friend invited successfully! Password set to: "password"`);
      setUsername('');
      setRole('developer');

      // Refresh lists
      fetchMembers();
      fetchSentRequests();
    } catch (err: any) {
      setFormError(err.message);
    }
  };



  if (loading && members.length === 0) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[400px]">
          <div className="h-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Title */}
      <div>
        <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-mono tracking-wider">
          Team Management & Collaboration
        </p>
        <h3 className="text-xl font-bold text-slate-800 dark:text-white mt-1">
          Review developers, roles, and collaborative assignments.
        </h3>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* Left Column: Team list */}
        <div className="bg-white dark:bg-darkCard rounded-xl border border-slate-200 dark:border-darkBorder overflow-hidden xl:col-span-2">
          <div className="p-6 border-b border-slate-200 dark:border-darkBorder flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Collaborators & Friends</h4>
            <span className="text-xs text-slate-400">{members.length} Users</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-darkBorder/40">
            {members.map((m) => (
              <div key={m.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors">
                <div className="flex items-center gap-3">
                  <img
                    src={m.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${m.name}`}
                    alt="Avatar"
                    className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-darkBorder"
                  />
                  <div>
                    <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-none mb-1">
                      @{m.username}
                    </h5>
                    <span className="text-xs text-slate-400 font-mono">{m.email}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {m.username !== currentUser?.username && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleInviteToHuddle(m.username)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-600 text-indigo-600 dark:text-indigo-400 hover:text-white rounded-lg text-[10px] font-bold border border-indigo-200 dark:border-indigo-900/30 transition-colors"
                        title={`Invite ${m.name} to joint call`}
                      >
                        <Video className="h-3 w-3" />
                        <span>Invite to Discord</span>
                      </button>
                      <button
                        onClick={() => handleUnfriend(m.id, m.username)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 dark:bg-red-950/20 hover:bg-red-600 text-red-650 dark:text-red-400 hover:text-white rounded-lg text-[10px] font-bold border border-red-200 dark:border-red-900/30 transition-colors"
                        title={`Remove ${m.name} from collaborators`}
                      >
                        <UserMinus className="h-3 w-3" />
                        <span>Unfriend</span>
                      </button>
                    </div>
                  )}

                  <span className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase font-mono ${
                    m.role === 'admin' 
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/10' 
                      : m.role === 'reviewer' 
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10' 
                        : 'bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400'
                  }`}>
                    {m.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Invite Form & Pending Requests */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-darkCard rounded-xl border border-slate-200 dark:border-darkBorder p-6 space-y-6">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white">
              <UserPlus className="h-5 w-5 text-indigo-500" />
              <h4 className="text-sm font-bold">Invite Friend / Collaborator</h4>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Username / Nickname</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. tobi123"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[#141724] border border-slate-200 dark:border-darkBorder rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Role Type</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#141724] border border-slate-200 dark:border-darkBorder rounded-lg text-xs text-slate-800 dark:text-white focus:outline-none"
                >
                  <option value="developer">Developer</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-xs font-semibold transition-colors"
              >
                Send Collaboration Invite
              </button>
            </form>
          </div>

          {/* Pending Requests List */}
          <div className="bg-white dark:bg-darkCard rounded-xl border border-slate-200 dark:border-darkBorder p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white">
              <UserCheck className="h-5 w-5 text-amber-500" />
              <h4 className="text-sm font-bold">Pending Friend Requests ({pendingRequests.length})</h4>
            </div>

            {pendingRequests.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">No pending invitations.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-darkBorder/40">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={req.sender_details.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${req.sender_details.name}`}
                        alt="Avatar"
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-darkBorder shrink-0"
                      />
                      <div className="min-w-0">
                        <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate leading-none mb-1">
                          @{req.sender_details.username}
                        </h5>
                        <span className="text-[10px] text-slate-400 block truncate">{req.sender_details.email}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleDeclineRequest(req.id)}
                        className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-650 dark:text-slate-400 rounded text-[10px] font-bold transition-colors border border-slate-200 dark:border-slate-700/50"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleAcceptRequest(req.id)}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold transition-colors shadow shadow-indigo-600/10"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sent Friend Requests List */}
          <div className="bg-white dark:bg-darkCard rounded-xl border border-slate-200 dark:border-darkBorder p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white">
              <UserPlus className="h-5 w-5 text-indigo-500" />
              <h4 className="text-sm font-bold">Sent Invitations ({sentRequests.length})</h4>
            </div>

            {sentRequests.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">No sent invitations.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-darkBorder/40">
                {sentRequests.map((req) => (
                  <div key={req.id} className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={req.receiver_details.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${req.receiver_details.name}`}
                        alt="Avatar"
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-darkBorder shrink-0"
                      />
                      <div className="min-w-0">
                        <h5 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate leading-none mb-1">
                          @{req.receiver_details.username}
                        </h5>
                        <span className="text-[10px] text-slate-400 block truncate">{req.receiver_details.email}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleCancelRequest(req.id)}
                        className="px-2 py-1 bg-red-50 dark:bg-red-950/20 hover:bg-red-650 text-red-600 dark:text-red-400 hover:text-white rounded text-[10px] font-bold border border-red-200 dark:border-red-900/30 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
