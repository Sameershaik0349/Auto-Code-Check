import React, { useEffect, useState } from 'react';
import cyberShieldLogo from '../assets/cyber_shield_logo.png';
import { CyberBackground } from './CyberBackground';

interface CodeLoaderSplashProps {
  onComplete: () => void;
}

export const CodeLoaderSplash: React.FC<CodeLoaderSplashProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("ESTABLISHING SECURE HANDSHAKE...");
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Fast loading progress bar (0 to 100 in 1.2 seconds)
    const startTime = Date.now();
    const duration = 1200; // 1.2 seconds

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);

      if (pct < 35) {
        setStatusText("DECRYPTING CLIENT INTEGRITY...");
      } else if (pct < 70) {
        setStatusText("AUDITING ENVIRONMENT VARIABLES...");
      } else if (pct < 100) {
        setStatusText("AUTHORIZING SESSION...");
      } else {
        setStatusText("SECURE ACCESS GRANTED");
      }

      if (elapsed < duration) {
        requestAnimationFrame(updateProgress);
      } else {
        // Complete the splash screen after a short delay (300ms) for verified state
        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(onComplete, 400); // Wait for fadeout animation
        }, 300);
      }
    };

    requestAnimationFrame(updateProgress);
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#05060b] select-none transition-all duration-500 ${isFadingOut ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
      <style>{`
        @keyframes scan-line {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.85); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 0.2; }
          100% { transform: scale(1.2); opacity: 0; }
        }
        @keyframes rotate-hologram {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .laser-scanner {
          animation: scan-line 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .pulse-halo {
          animation: pulse-ring 2.5s cubic-bezier(0.215, 0.610, 0.355, 1.000) infinite;
        }
        .holo-ring {
          animation: rotate-hologram 10s linear infinite;
        }
      `}</style>

      {/* Cyber ambient grid */}
      <CyberBackground />

      {/* Futuristic CRT Scanline overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%)] bg-[size:100%_4px] pointer-events-none opacity-20" />

      <div className="w-full max-w-sm px-6 flex flex-col items-center text-center space-y-8 relative">
        {/* Hologram Scanner Area */}
        <div className="relative w-44 h-44 flex items-center justify-center">
          {/* Pulsing Halos */}
          <div className="absolute inset-0 rounded-full border border-indigo-500/20 pulse-halo" />
          <div className="absolute inset-0 rounded-full border border-emerald-500/10 pulse-halo" style={{ animationDelay: '1.25s' }} />

          {/* Hologram Rotating Tech Rings */}
          <div className="absolute w-[110%] h-[110%] rounded-full border border-dashed border-indigo-500/30 holo-ring" />
          <div className="absolute w-[120%] h-[120%] rounded-full border border-dotted border-emerald-500/20 holo-ring" style={{ animationDirection: 'reverse', animationDuration: '15s' }} />

          {/* Central Logo Container */}
          <div className="relative w-32 h-32 rounded-3xl bg-slate-950/80 border border-indigo-500/30 p-2.5 shadow-[0_0_50px_rgba(99,102,241,0.15)] flex items-center justify-center overflow-hidden">
            {/* The laser scanner bar */}
            <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_#34d399] laser-scanner pointer-events-none" />
            <img 
              src={cyberShieldLogo} 
              alt="Cyber Shield Logo" 
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Text Area */}
        <div className="space-y-2">
          <h1 className="text-lg font-black tracking-[0.25em] text-slate-100 uppercase">
            SECURE PORTAL
          </h1>
          <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
            AUTOMATED AUDIT ENGINE
          </p>
        </div>

        {/* Sleek Progress Loader */}
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between text-[9px] font-mono tracking-widest text-slate-400">
            <span className={progress >= 100 ? "text-emerald-400 font-bold transition-colors" : ""}>
              {statusText}
            </span>
            <span className="text-indigo-400 font-bold">{Math.round(progress)}%</span>
          </div>

          {/* Progress Bar Container */}
          <div className="h-1 bg-slate-950 border border-slate-900 rounded-full overflow-hidden relative">
            <div 
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-75 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
