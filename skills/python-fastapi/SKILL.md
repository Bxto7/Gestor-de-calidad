---
name: python-fastapi
description: >
  Activa este skill cuando trabajes con el backend del sistema de intermediación laboral.
  Úsalo para: crear endpoints FastAPI, modelos SQLAlchemy, schemas Pydantic v2,
  tareas Celery, migraciones Alembic, autenticación JWT, o cualquier código Python
  del proyecto. Se activa automáticamente al trabajar en la carpeta backend/.
---

# Python + FastAPI — Sistema de Intermediación Laboral

## Stack exacto obligatorio

- **Python 3.11** — sin excepciones
- **FastAPI** — routers por módulo, prefijo `/api/v1/`
- **Pydantic v2** — `model_config = ConfigDict(...)`, nunca sintaxis v1
- **SQLAlchemy 2.x async** — siempre `AsyncSession`, nunca síncrono
- **Alembic** — toda migración con `--autogenerate`, nunca DDL manual
- **PostgreSQL 15 + pgvector** — columnas `vector(384)`, índice HNSW
- **Redis** — blacklist de tokens + broker Celery
- **Celery** — todas las tareas pesadas son asíncronas
- **structlog** — logging estructurado JSON, nunca `print()`
- **bcrypt** — cost factor mínimo 12
- **JWT RS256** — access 24h, refresh 7d

---

## Estructura de carpetas

```
backend/
  app/
    api/v1/          → routers FastAPI (auth, workers, employers, match, admin)
    core/            → config, security, database, redis
    models/          → SQLAlchemy ORM models
    schemas/         → Pydantic v2 schemas
    services/        → lógica de negocio (sin lógica en routers)
    nlp/             → pipeline NLP
    ml/              → motor de matching
    tasks/           → Celery tasks
    utils/           → helpers, diccionario Huancayo
  migrations/        → Alembic versions
  tests/             → pytest, cobertura ≥ 80%
```

---

## Patrones obligatorios

### Endpoint FastAPI
```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import require_role, UserRole
from app.schemas.worker import WorkerProfileResponse, WorkerProfileCreate
from app.services.worker_service import WorkerService
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/api/v1/workers", tags=["workers"])

@router.post("/", response_model=WorkerProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_worker_profile(
    payload: WorkerProfileCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_role(UserRole.WORKER))
):
    """Crea el perfil laboral de un trabajador de oficios."""
    try:
        worker = await WorkerService.create(db, current_user.id, payload)
        logger.info("worker_profile_created", worker_id=str(worker.id))
        return worker
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
```

### Pydantic v2 Schema
```python
from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID
from typing import Optional

class WorkerProfileCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, use_enum_values=True)

    office: str = Field(..., min_length=2, max_length=100, description="Oficio principal")
    years_experience: int = Field(..., ge=0, le=60)
    bio: str = Field(..., min_length=10, max_length=2000, description="Descripción de competencias")
    zone: str = Field(..., description="Distrito de Huancayo: Huancayo, El Tambo, Chilca")
    hourly_rate: Optional[float] = Field(None, ge=0, description="Tarifa por hora en S/.")

# ❌ NUNCA sintaxis Pydantic v1
# class WorkerProfile(BaseModel):
#     class Config:
#         orm_mode = True
```

### SQLAlchemy 2.x Model
```python
from sqlalchemy import String, Integer, Float, Boolean, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from pgvector.sqlalchemy import Vector
from app.core.database import Base
import uuid

class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    office: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    years_experience: Mapped[int] = mapped_column(Integer, nullable=False)
    bio: Mapped[str] = mapped_column(Text, nullable=True)
    zone: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    hourly_rate: Mapped[float] = mapped_column(Float, nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    avg_rating: Mapped[float] = mapped_column(Float, default=0.0)
    embedding: Mapped[list] = mapped_column(Vector(384), nullable=True)

    # ❌ NUNCA integer autoincrement como PK
    # id = Column(Integer, primary_key=True)
```

### Async DB Session
```python
# core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_size=10, max_overflow=20)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### Celery Task
```python
from celery import shared_task
from app.tasks.celery_app import celery_app
import structlog

logger = structlog.get_logger()

@celery_app.task(bind=True, max_retries=3, time_limit=30)
def generate_worker_embedding(self, worker_id: str):
    """Genera embedding vectorial del perfil del trabajador de forma asíncrona."""
    try:
        import asyncio
        from app.nlp.embeddings import EmbeddingService
        asyncio.run(EmbeddingService.generate_and_store(worker_id))
        logger.info("embedding_task_completed", worker_id=worker_id)
    except Exception as exc:
        logger.error("embedding_task_failed", worker_id=worker_id, error=str(exc))
        raise self.retry(exc=exc, countdown=60)
```

### Migración Alembic
```bash
# ✅ Siempre autogenerate
alembic revision --autogenerate -m "add_embedding_column_workers"
alembic upgrade head

# ✅ Toda migración debe tener downgrade
def downgrade() -> None:
    op.drop_column("workers", "embedding")
```

---

## Seguridad obligatoria

```python
# ✅ RBAC en cada endpoint protegido
from app.core.security import require_role, UserRole

@router.delete("/{worker_id}")
async def delete_worker(
    worker_id: UUID,
    current_user = Depends(require_role(UserRole.ADMIN))  # ← SIEMPRE
):
    ...

# ✅ Nunca exponer datos sensibles en logs
logger.info("user_login", user_id=str(user.id))  # ✅
logger.info("user_login", dni=user.dni)           # ❌ PROHIBIDO

# ✅ Rate limiting en auth
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, ...):
    ...
```

---

## Validaciones peruanas

```python
import re

def validate_dni(dni: str) -> bool:
    """DNI peruano: exactamente 8 dígitos numéricos."""
    return bool(re.match(r'^[0-9]{8}$', dni))

def validate_ruc(ruc: str) -> bool:
    """RUC peruano: exactamente 11 dígitos numéricos."""
    return bool(re.match(r'^[0-9]{11}$', ruc))

def validate_phone(phone: str) -> bool:
    """Teléfono peruano: +51 seguido de 9 dígitos."""
    return bool(re.match(r'^\+51[0-9]{9}$', phone))
```

---

## Comandos de desarrollo

```bash
# Levantar entorno
docker-compose up -d

# Migraciones
alembic upgrade head
alembic revision --autogenerate -m "descripcion"

# Tests con cobertura mínima 80%
pytest tests/ --cov=app --cov-report=term-missing --cov-fail-under=80

# Linting obligatorio antes de commit
ruff check . && ruff format .

# Worker Celery
celery -A app.tasks.celery_app worker --loglevel=info -Q embeddings,reports,emails
```

---

## Prohibiciones absolutas

- ❌ No usar `print()` — solo `structlog`
- ❌ No escribir SQL crudo con f-strings
- ❌ No usar Pydantic v1 (`class Config`)
- ❌ No usar SQLAlchemy síncrono en endpoints
- ❌ No exponer stack traces en producción
- ❌ No commits directos a `main`
- ❌ No instalar librerías sin actualizar `requirements.txt`
