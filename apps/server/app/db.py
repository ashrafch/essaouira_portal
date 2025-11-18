from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 🔗 Connessione a Postgres (Docker)
DATABASE_URL = "postgresql+psycopg2://essa:essa@localhost:5432/essa"

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
