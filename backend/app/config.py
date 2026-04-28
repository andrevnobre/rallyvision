from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "eu-west-1"
    s3_bucket: str = "rallyvision-videos"
    secret_key: str
    environment: str = "development"
    cors_origins: str = "http://localhost:3000"
    # GPU spot worker
    sqs_url: str = ""
    worker_api_key: str = ""
    launch_template_id: str = ""
    internal_api_url: str = ""  # public URL of this API, used by GPU worker to report results
    admin_email: str = ""

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
