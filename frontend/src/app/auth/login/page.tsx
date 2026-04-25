"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = await login(email, password);
      setToken(token);
      router.push("/");
    } catch {
      setError("Email ou palavra-passe incorretos.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center pt-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-8 text-center">Entrar</h1>
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
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-green-600"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold transition-colors"
          >
            {loading ? "A entrar…" : "Entrar"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">
          Ainda não tens conta?{" "}
          <Link href="/auth/register" className="text-green-500 hover:underline">
            Registar
          </Link>
        </p>
      </div>
    </div>
  );
}
