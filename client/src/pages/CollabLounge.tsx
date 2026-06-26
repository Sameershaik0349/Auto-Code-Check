import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useReviewStore } from '../store/reviewStore';
import { 
  Hash, 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff, 
  Monitor, 
  PhoneOff, 
  Send, 
  Volume2, 
  User, 
  Settings, 
  Compass, 
  Tv
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  avatar: string;
  text: string;
  timestamp: string;
}

interface PeerConnectionMap {
  [username: string]: {
    pc: RTCPeerConnection;
    stream: MediaStream;
  };
}

export const CollabLounge: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const { socket, addWsListener, removeWsListener, autoJoinCall, setAutoJoinCall } = useReviewStore();

  const [activeChannel, setActiveChannel] = useState<'general' | 'code-review'>('general');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'Admin User',
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Admin',
      text: 'Welcome to the Collaboration Lounge! Click "Join Call" in the Lounge Huddle to start a live audio/video session.',
      timestamp: new Date(Date.now() - 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');

  // Call & WebRTC states
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);

  // Ref variables for streams and peer connections
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<PeerConnectionMap>({});
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  
  // Track state for rendering remote videos dynamically
  const [remoteStreams, setRemoteStreams] = useState<{ [username: string]: MediaStream }>({});

  const iceConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // 1. WebSocket listener for chat and WebRTC signaling
  useEffect(() => {
    const handleWsMessage = async (data: any) => {
      if (!currentUser) return;

      if (data.type === 'CHAT_MESSAGE') {
        // Add text message if it matches the current huddle chat
        setMessages(prev => [
          ...prev,
          {
            id: Math.random().toString(),
            sender: data.sender,
            avatar: data.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${data.sender}`,
            text: data.text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } 
      else if (data.type === 'HUDDLE_JOIN') {
        const joinedUser = data.username;
        if (joinedUser === currentUser.username) return;

        // Add to participants list
        setParticipants(prev => prev.includes(joinedUser) ? prev : [...prev, joinedUser]);

        // If we are currently in call, initiate peer connection with the joining user
        if (isInCall && localStreamRef.current) {
          console.log(`User joined: ${joinedUser}. Initiating WebRTC offer...`);
          await initiatePeerConnection(joinedUser, true);
        }
      } 
      else if (data.type === 'HUDDLE_LEAVE') {
        const leftUser = data.username;
        setParticipants(prev => prev.filter(p => p !== leftUser));
        
        // Clean up peer connection for left user
        if (peerConnectionsRef.current[leftUser]) {
          peerConnectionsRef.current[leftUser].pc.close();
          delete peerConnectionsRef.current[leftUser];
          setRemoteStreams(prev => {
            const next = { ...prev };
            delete next[leftUser];
            return next;
          });
        }
      } 
      else if (data.type === 'HUDDLE_SIGNAL') {
        const { sender, target, signal } = data;
        if (target !== currentUser.username) return;

        console.log(`Received WebRTC signal from ${sender}:`, signal.type || 'ICE candidate');
        
        // Retrieve or create peer connection
        let peer = peerConnectionsRef.current[sender];
        if (!peer) {
          peer = await initiatePeerConnection(sender, false);
        }

        if (signal.sdp) {
          const desc = new RTCSessionDescription(signal.sdp);
          await peer.pc.setRemoteDescription(desc);

          if (desc.type === 'offer') {
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            sendSignal(sender, { sdp: answer });
          }
        } 
        else if (signal.candidate) {
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.error('Error adding received ICE candidate', e);
          }
        }
      }
    };

    addWsListener(handleWsMessage);
    return () => {
      removeWsListener(handleWsMessage);
    };
  }, [currentUser, isInCall, addWsListener, removeWsListener]);

  // 2. Helper to send WebSocket signaling details
  const sendSignal = (targetUsername: string, signalData: any) => {
    if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
      socket.send(JSON.stringify({
        type: 'HUDDLE_SIGNAL',
        sender: currentUser.username,
        target: targetUsername,
        signal: signalData
      }));
    }
  };

  // Auto join call huddle if autoJoinCall flag is active in reviewStore
  useEffect(() => {
    if (autoJoinCall) {
      handleJoinCall();
      setAutoJoinCall(false); // Reset store flag
    }
  }, [autoJoinCall]);

  // 3. Initiate WebRTC peer connection (offer side vs answer side)
  const initiatePeerConnection = async (targetUser: string, isInitiator: boolean): Promise<{ pc: RTCPeerConnection; stream: MediaStream }> => {
    console.log(`Setting up RTCPeerConnection for user: ${targetUser} (Initiator: ${isInitiator})`);
    
    const pc = new RTCPeerConnection(iceConfiguration);
    const remoteStream = new MediaStream();

    // Store reference
    peerConnectionsRef.current[targetUser] = { pc, stream: remoteStream };

    // Bind local tracks to connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Capture remote streams
    pc.ontrack = (event) => {
      console.log(`Received remote track from ${targetUser}`);
      event.streams[0].getTracks().forEach(track => {
        remoteStream.addTrack(track);
      });
      setRemoteStreams(prev => ({
        ...prev,
        [targetUser]: remoteStream
      }));
    };

    // Relay local ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(targetUser, { candidate: event.candidate });
      }
    };

    // If initiator, negotiate/create offer
    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(targetUser, { sdp: offer });
    }

    return { pc, stream: remoteStream };
  };

  // 4. Send chat message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !socket || !currentUser) return;

    const payload = {
      type: 'CHAT_MESSAGE',
      sender: currentUser.name || currentUser.username,
      avatar: currentUser.avatar,
      text: inputText.trim()
    };

    socket.send(JSON.stringify(payload));
    setInputText('');
  };

  // 5. Connect to live call huddle
  const handleJoinCall = async () => {
    if (isInCall) return;

    try {
      console.log('Accessing local media capture devices...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setIsInCall(true);

      // Notify others via WebSocket
      if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
        socket.send(JSON.stringify({
          type: 'HUDDLE_JOIN',
          username: currentUser.username
        }));
      }

      // Add self to participant list
      setParticipants([currentUser?.username || 'You']);
    } catch (err) {
      console.error('Failed to capture audio/video devices', err);
      alert('Could not access microphone and camera. Please check browser permissions.');
    }
  };

  // 6. Mute / Toggle camera
  const handleToggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const handleToggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  // 7. Screen Sharing
  const handleToggleScreenShare = async () => {
    if (!isInCall || !localStreamRef.current) return;

    if (isScreenSharing) {
      // Stop screen share, revert to camera
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }

      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = cameraStream.getVideoTracks()[0];
        
        // Replace in local stream ref
        const localVideoTrack = localStreamRef.current.getVideoTracks()[0];
        localStreamRef.current.removeTrack(localVideoTrack);
        localStreamRef.current.addTrack(newVideoTrack);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }

        // Replace track in all active peer connections
        Object.values(peerConnectionsRef.current).forEach(({ pc }) => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack);
          }
        });

        setIsScreenSharing(false);
      } catch (err) {
        console.error('Failed to recover camera track', err);
      }
    } 
    else {
      // Start screen share
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        const screenTrack = stream.getVideoTracks()[0];

        // If user closes screen sharing from browser bar, handle stop trigger
        screenTrack.onended = () => {
          handleToggleScreenShare();
        };

        // Replace track in local video display
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Replace track in all peer connections
        Object.values(peerConnectionsRef.current).forEach(({ pc }) => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        setIsScreenSharing(true);
      } catch (err) {
        console.error('Failed to capture screen stream', err);
      }
    }
  };

  // 8. Leave Voice & Video Huddle
  const handleLeaveCall = () => {
    if (!isInCall) return;

    // Notify other peers
    if (socket && socket.readyState === WebSocket.OPEN && currentUser) {
      socket.send(JSON.stringify({
        type: 'HUDDLE_LEAVE',
        username: currentUser.username
      }));
    }

    // Stop all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    // Close all peer connections
    Object.keys(peerConnectionsRef.current).forEach(user => {
      peerConnectionsRef.current[user].pc.close();
    });
    peerConnectionsRef.current = {};

    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    setRemoteStreams({});
    setParticipants([]);
    setIsInCall(false);
    setIsScreenSharing(false);
    setIsMuted(false);
    setIsCameraOff(false);
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      handleLeaveCall();
    };
  }, []);

  return (
    <div className="flex h-[calc(100vh-80px)] bg-slate-900 overflow-hidden text-slate-100 font-sans">
      {/* Discord Left Panel: Huddle channels */}
      <div className="w-60 bg-slate-950 flex flex-col justify-between border-r border-slate-800 shrink-0">
        <div className="p-4 space-y-6">
          <div className="flex items-center gap-2 px-1 text-slate-300 font-bold text-sm tracking-wide border-b border-slate-900 pb-3">
            <Compass className="h-4 w-4 text-indigo-500" />
            <span>Collab Workspace</span>
          </div>

          {/* Text Channels section */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block px-1">
              Text Channels
            </span>
            <div className="space-y-0.5">
              <button 
                onClick={() => setActiveChannel('general')}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-semibold ${
                  activeChannel === 'general' 
                    ? 'bg-slate-800 text-white' 
                    : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                }`}
              >
                <Hash className="h-4 w-4 shrink-0 text-slate-500" />
                <span>general</span>
              </button>
              <button 
                onClick={() => setActiveChannel('code-review')}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-semibold ${
                  activeChannel === 'code-review' 
                    ? 'bg-slate-800 text-white' 
                    : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                }`}
              >
                <Hash className="h-4 w-4 shrink-0 text-slate-500" />
                <span>code-discussion</span>
              </button>
            </div>
          </div>

          {/* Voice Channels section */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block px-1">
              Voice Channels
            </span>
            <div className="space-y-1.5">
              <div className="bg-slate-900/40 p-2 border border-slate-800/40 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Volume2 className="h-4 w-4 text-indigo-400" /> Lounge Huddle
                  </span>
                  {!isInCall ? (
                    <button
                      onClick={handleJoinCall}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded text-[9px] font-bold tracking-wide"
                    >
                      Join Call
                    </button>
                  ) : (
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </div>
                
                {/* List of active users inside the voice channel */}
                {participants.length > 0 && (
                  <div className="mt-2.5 pl-3 border-l border-slate-800 space-y-1.5">
                    {participants.map(username => (
                      <div key={username} className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                        <User className="h-3 w-3 text-slate-500" />
                        <span>{username}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* User bar */}
        <div className="p-3 bg-slate-950 border-t border-slate-850 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <img 
              src={currentUser?.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=Admin'} 
              alt="Profile" 
              className="w-8 h-8 rounded-full border border-slate-800 bg-slate-900"
            />
            <div className="overflow-hidden leading-tight">
              <p className="text-xs font-bold text-slate-200 truncate">{currentUser?.name}</p>
              <span className="text-[9px] text-slate-500 truncate block">@{currentUser?.username}</span>
            </div>
          </div>
          <Settings className="h-4 w-4 text-slate-500 cursor-pointer hover:text-slate-300 shrink-0" />
        </div>
      </div>

      {/* Center Panel: Large call video huddle screen */}
      <div className="flex-1 flex flex-col bg-slate-900 border-r border-slate-800">
        <div className="p-4 border-b border-slate-850 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-sm tracking-wide text-slate-200 flex items-center gap-1.5">
            <Volume2 className="h-4 w-4 text-indigo-400" />
            <span>Lounge Call Session</span>
          </h2>
          {isInCall && (
            <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded uppercase font-semibold">
              CONNECTED
            </span>
          )}
        </div>

        {/* Video Grid Grid */}
        <div className="flex-1 p-6 overflow-y-auto flex items-center justify-center min-h-[300px]">
          {!isInCall ? (
            <div className="text-center space-y-4 max-w-sm">
              <div className="h-16 w-16 bg-slate-800/80 rounded-full flex items-center justify-center mx-auto text-slate-500 border border-slate-700/60 shadow-lg">
                <VideoIcon className="h-8 w-8 text-indigo-400" />
              </div>
              <h3 className="font-bold text-slate-200">Start Collaborative Huddle</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Connect your camera and mic to host a live audio/video session and share your screen to co-debug or review code live.
              </p>
              <button
                onClick={handleJoinCall}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-6 py-2.5 rounded-lg shadow-md transition-colors"
              >
                Join Call Channel
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl h-full max-h-[500px]">
              {/* Local User Screen */}
              <div className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 group shadow-lg flex items-center justify-center">
                {!isCameraOff ? (
                  <video 
                    ref={localVideoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className="w-full h-full object-cover transform scale-x-[-1]"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2">
                    <img 
                      src={currentUser?.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=Admin'} 
                      alt="Avatar" 
                      className="w-16 h-16 rounded-full border border-slate-800 bg-slate-900"
                    />
                    <span className="text-xs text-slate-500 font-semibold">Camera is Off</span>
                  </div>
                )}
                
                {/* User indicator bar */}
                <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-bold text-slate-300 border border-slate-800/50 flex items-center gap-1.5">
                  <span>{currentUser?.name || 'You'} (You)</span>
                  {isMuted && <MicOff className="h-3 w-3 text-red-500" />}
                </div>
              </div>

              {/* Remote Users Screen */}
              {Object.keys(remoteStreams).length === 0 ? (
                <div className="relative bg-slate-950/40 rounded-xl overflow-hidden border border-slate-800/40 flex items-center justify-center shadow-inner">
                  <div className="text-center p-6 space-y-1 text-slate-500">
                    <User className="h-8 w-8 mx-auto text-slate-600 animate-pulse" />
                    <p className="text-xs font-bold mt-2">Waiting for peers to join...</p>
                    <p className="text-[10px]">Invite collaborators to join the Lounge Huddle to start P2P video stream.</p>
                  </div>
                </div>
              ) : (
                Object.keys(remoteStreams).map((username) => (
                  <div key={username} className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-lg">
                    <video 
                      autoPlay 
                      playsInline
                      ref={(el) => {
                        if (el && remoteStreams[username]) {
                          el.srcObject = remoteStreams[username];
                        }
                      }}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-bold text-slate-300 border border-slate-800/50">
                      <span>{username}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Floating Call Action controls bar */}
        {isInCall && (
          <div className="p-4 border-t border-slate-850 flex justify-center bg-slate-950/50 backdrop-blur-lg shrink-0">
            <div className="bg-slate-900 border border-slate-800/80 rounded-full px-5 py-2 flex items-center gap-3.5 shadow-xl">
              <button
                onClick={handleToggleMute}
                className={`p-3 rounded-full transition-colors ${
                  isMuted 
                    ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
              </button>

              <button
                onClick={handleToggleCamera}
                className={`p-3 rounded-full transition-colors ${
                  isCameraOff 
                    ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
                title={isCameraOff ? 'Turn camera On' : 'Turn camera Off'}
              >
                {isCameraOff ? <VideoOff className="h-4.5 w-4.5" /> : <VideoIcon className="h-4.5 w-4.5" />}
              </button>

              <button
                onClick={handleToggleScreenShare}
                className={`p-3 rounded-full transition-colors ${
                  isScreenSharing 
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
                title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
              >
                {isScreenSharing ? <Tv className="h-4.5 w-4.5" /> : <Monitor className="h-4.5 w-4.5" />}
              </button>

              <div className="w-px h-6 bg-slate-800" />

              <button
                onClick={handleLeaveCall}
                className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors shadow"
                title="Disconnect call huddle"
              >
                <PhoneOff className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: Discord-like Chat Area */}
      <div className="w-80 bg-slate-950 flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-slate-850 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-slate-200">
            <Hash className="h-4 w-4 text-slate-500" />
            <span className="font-bold text-xs">#{activeChannel}</span>
          </div>
          <span className="text-[10px] text-slate-500">Live Chat</span>
        </div>

        {/* Message Logs */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 flex flex-col-reverse">
          <div className="space-y-4">
            {messages.map((m, idx) => (
              <div key={idx} className="flex gap-3 items-start animate-fade-in">
                <img 
                  src={m.avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=Admin'} 
                  alt="Avatar" 
                  className="w-7 h-7 rounded-full shrink-0 bg-slate-900 border border-slate-850"
                />
                <div className="overflow-hidden leading-snug">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-slate-300">{m.sender}</span>
                    <span className="text-[9px] text-slate-500 font-mono">{m.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat input box */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-850 shrink-0">
          <div className="relative flex items-center">
            <input 
              type="text" 
              placeholder={`Message #${activeChannel}...`} 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-slate-200"
            />
            <button 
              type="submit"
              className="absolute right-2 text-slate-500 hover:text-indigo-400 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
