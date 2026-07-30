'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { loginAdmin } from '@/lib/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ShardLogo } from '@/components/ui/ShardLogo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      await loginAdmin(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05161e] flex flex-col items-center justify-center p-4 relative overflow-hidden select-none"
         style={{
           background: 'radial-gradient(circle at 50% 30%, #0d3244 0%, #05161e 70%)'
         }}>
      {/* Background Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00f0ff]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Header */}
        <div className="text-center mb-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <ShardLogo size={42} />
            <span className="text-3xl font-extrabold tracking-wider brand-gradient-text">
              CLOGIN STUDIO
            </span>
          </div>
          <p className="text-xs text-[#6b9eb3]">Hệ thống Quản trị & Điều hành Portal Admin</p>
        </div>

        {/* Card */}
        <div className="clogin-card p-8">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <span>🛡️</span>
            <span>Đăng nhập tài khoản Admin</span>
          </h2>

          {error && (
            <div className="mb-6 p-3.5 rounded-lg bg-[#ff2a6d]/15 border border-[#ff2a6d]/30 flex items-start gap-3 text-[#ff2a6d] text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email quản trị"
              type="email"
              placeholder="admin@clogin.nghemmo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail className="w-4 h-4 text-[#6b9eb3]" />}
              required
            />

            <Input
              label="Mật khẩu"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="w-4 h-4 text-[#6b9eb3]" />}
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2 clogin-btn-primary h-11 text-sm font-extrabold"
              isLoading={loading}
              icon={<ArrowRight className="w-4 h-4 text-[#05161e]" />}
            >
              Đăng nhập Portal
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[#487385] mt-8">
          © {new Date().getFullYear()} Clogin Studio. Tất cả quyền được bảo lưu.
        </p>
      </div>
    </div>
  );
}
