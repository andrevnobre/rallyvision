from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket: str = "rallyvision-videos"
    secret_key: str
    environment: str = "development"

    class Config:
        env_file = ".env"


settings = Settings()
