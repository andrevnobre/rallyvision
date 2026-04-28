from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status as http_status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User

_bearer = HTTPBearer()

_ALGORITHM = "HS256"
_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=_EXPIRE_DAYS)
    return jwt.encode({"sub": user_id, "exp": expire}, settings.secret_key, algorithm=_ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[_ALGORITHM])
        user_id: str | None = payload.get("sub")
    except JWTError:
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "Token inválido")
    if not user_id:
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "Token inválido")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "Utilizador não encontrado")
    if user.is_suspended:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Conta suspensa")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Acesso reservado a administradores")
    return current_user
