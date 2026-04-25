"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getMe, getToken, removeToken, type AuthUser } from "@/lib/api";

export function AuthNav() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    getMe().then(setUser).catch(() => {}).finally(() => setReady(true));
  }, []);

  function logout() {
    removeToken();
    router.push("/auth/login");
  }

  if (!ready) return null;

  if (!user) {
    return (
      <div className="flex gap-4 text-sm">
        <Link href="/auth/login" className="text-gray-400 hover:text-white transition-colors">Entrar</Link>
        <Link href="/auth/register" className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg font-medium transition-colors">Criar conta</Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="text-gray-500">{user.email}</span>
      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 capitalize">{user.plan}</span>
      <button onClick={logout} className="text-gray-400 hover:text-white transition-colors">Sair</button>
    </div>
  );
}
