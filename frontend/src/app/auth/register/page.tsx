"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register, setToken } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await register(email, password);
      setToken(token);
      router.push("/");
    } catch (err) {
      const msg = String(err);
      setError(msg.includes("409") || msg.includes("já registado") ? "Este email já está registado." : "Erro ao criar conta.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center pt-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-8 text-center">Criar conta</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-green-600"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Palavra-passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-green-600"
            />
            <p className="text-xs text-gray-600 mt-1">Mínimo 8 caracteres</p>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold transition-colors"
          >
            {loading ? "A criar conta…" : "Criar conta"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          Já tens conta?{" "}
          <Link href="/auth/login" className="text-green-500 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
