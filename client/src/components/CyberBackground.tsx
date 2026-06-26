import React, { useEffect, useState } from 'react';

interface Particle {
  id: number;
  text: string;
  left: string;
  delay: string;
  duration: string;
  fontSize: string;
}

const TOKENS = [
  "async", "await", "import", "=>", "const", "0xFA", "audit()", 
  "{}", "[]", "10101", "Promise", "status: 200", "auth", 
  "ws://", "git push", "api/auth", "security: OK", "Daphne/ASGI", 
  "WebRTC", "localStream", "ICE"
];

export const CyberBackground: React.FC = () => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    // Generate particles only on the client side to avoid SSR/hydration mismatches
    const generated: Particle[] = Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      text: TOKENS[Math.floor(Math.random() * TOKENS.length)],
      left: `${5 + Math.random() * 90}%`,
      delay: `${Math.random() * 16}s`,
      duration: `${14 + Math.random() * 10}s`,
      fontSize: `${9 + Math.random() * 5}px`
    }));
    setParticles(generated);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* 3D Scrolling Perspective Grid */}
      <div className="absolute inset-0 opacity-40 mix-blend-overlay">
        <div 
          className="absolute w-[200%] h-[200%] top-[-50%] left-[-50%] bg-[linear-gradient(to_right,rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:40px_40px] animate-grid-scroll"
          style={{ transform: 'perspective(450px) rotateX(60deg)' }}
        />
      </div>

      {/* Floating ambient glow orbs */}
      <div className="absolute top-[-15%] left-[-15%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-indigo-600/10 blur-[130px] animate-blob-1" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-emerald-600/10 blur-[130px] animate-blob-2" />

      {/* Floating Code/Binary Particles */}
      <div className="absolute inset-0">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute bottom-[-100px] font-mono text-indigo-400/20 select-none animate-drift-up whitespace-nowrap"
            style={{
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.duration,
              fontSize: p.fontSize,
            }}
          >
            {p.text}
          </div>
        ))}
      </div>
    </div>
  );
};
