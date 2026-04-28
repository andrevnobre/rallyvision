#!/usr/bin/env python3
"""Utilitário local para redefinir a senha de um utilizador.

Uso:
    python reset_password.py <email> <nova_senha>

Exemplo (via docker compose):
    docker compose exec api python reset_password.py andre@andrenobre.pt NovaSenha123
"""
import sys

def main():
    if len(sys.argv) != 3:
        print("Uso: python reset_password.py <email> <nova_senha>")
        sys.exit(1)

    email, new_password = sys.argv[1], sys.argv[2]

    import bcrypt
    from sqlalchemy import create_engine, text
    import os

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        # Tenta carregar do .env local
        env_file = os.path.join(os.path.dirname(__file__), ".env")
        if os.path.exists(env_file):
            for line in open(env_file):
                k, _, v = line.strip().partition("=")
                if k == "DATABASE_URL":
                    db_url = v
                    break

    if not db_url:
        print("Erro: DATABASE_URL não encontrado. Defina a variável de ambiente ou use via docker compose exec.")
        sys.exit(1)

    hashed = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    engine = create_engine(db_url)
    with engine.connect() as conn:
        result = conn.execute(
            text("UPDATE users SET password_hash = :h WHERE email = :e"),
            {"h": hashed, "e": email},
        )
        conn.commit()
        if result.rowcount == 0:
            print(f"Utilizador '{email}' não encontrado.")
            sys.exit(1)
        print(f"Senha de '{email}' redefinida com sucesso.")

if __name__ == "__main__":
    main()
