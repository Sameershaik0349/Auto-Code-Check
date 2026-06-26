import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { ShieldCheck, ArrowRight, Lock, Mail, User, Code } from 'lucide-react';
import { CyberBackground } from '../components/CyberBackground';

export const Auth: React.FC = () => {
  const { login, signup, isLoading, error, clearError } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('developer');
  const [validationError, setValidationError] = useState('');

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setValidationError('');
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!email || !password) {
      setValidationError('Please enter email and password.');
      return;
    }

    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters long.');
      return;
    }

    if (!isLogin) {
      if (!username || !name) {
        setValidationError('Please complete all signup fields.');
        return;
      }
      const success = await signup(username, email, password, name, role);
      if (success) {
        // Automatically switch to login on success
        setIsLogin(true);
        clearError();
      }
    } else {
      await login(email, password);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080d] flex items-center justify-center px-4 relative overflow-hidden font-sans">
      {/* Cyber ambient background */}
      <CyberBackground />

      <div className="w-full max-w-md bg-[#0f111a] border border-[#1f2235] p-8 rounded-2xl shadow-2xl relative z-10">
        {/* Brand logo banner */}
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-indigo-600 rounded-2xl text-white mb-3 shadow-lg shadow-indigo-600/20">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white font-sans text-center">
            Automated Code Review
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            AUTOMATED CODE AUDITS & QUALITY ANALYTICS
          </p>
        </div>

        {/* Form alerts */}
        {(error || validationError) && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold leading-relaxed">
            {validationError || error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#141724] border border-[#1f2235] rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Username</label>
                <div className="relative">
                  <Code className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="janedoe1"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#141724] border border-[#1f2235] rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Team Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#141724] border border-[#1f2235] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="developer">Developer</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </>
          )}

          {/* Email Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                placeholder="developer@platform.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#141724] border border-[#1f2235] rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#141724] border border-[#1f2235] rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg text-sm font-semibold shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? (
              <span>Processing...</span>
            ) : (
              <>
                <span>{isLogin ? 'Login Account' : 'Register Account'}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Toggle between register and login */}
        <div className="mt-6 text-center">
          <button
            onClick={toggleMode}
            className="text-xs font-semibold text-slate-400 hover:text-indigo-400 transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already registered? Log in'}
          </button>
        </div>
      </div>
    </div>
  );
};
