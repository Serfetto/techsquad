from fastapi import Depends, Request
from dbmodels.crud import get_user_by_id, get_user_by_email
from datetime import datetime, timedelta, timezone
from configs.config import settings
from passlib.context import CryptContext
import jwt
from jwt.exceptions import InvalidTokenError
from dbmodels.database import db_dependency

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_token(data: dict, expire_time: timedelta):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expire_time
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

async def authenticate_user(email: str, password: str, db: db_dependency):
    user = await get_user_by_email(email, db)
    if not user or verify_password(plain_password=password, hashed_password=user.hashed_password) is False:
        return None
    return user

def get_access_token(request: Request):
    return request.cookies.get('at') 

def get_decode_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except InvalidTokenError as e:
        print(f"{e}")
        return None
    return payload

def check_valid_token(token = Depends(get_access_token)):
    if token is None:
        return token
    
    decode_token: dict = get_decode_token(token)
    if decode_token is None:
        return decode_token
    
    expire = decode_token.get('exp')
    expire_time = datetime.fromtimestamp(int(expire), tz=timezone.utc)

    if (not expire) or (expire_time < datetime.now(timezone.utc)):
        return None
    return decode_token

async def get_current_user(payload: dict = Depends(check_valid_token), db: db_dependency = db_dependency):
    if payload is None:
        return None

    user_id = payload.get('sub')

    if not user_id:
        return None

    user = await get_user_by_id(id=user_id, db=db)

    if user is None:
        return None

    return user