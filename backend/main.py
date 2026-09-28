from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes import auth, eccd, sections, students, settings, analytics, teachers, messages, backup, eccd_config, chairman, parents
from backend.config.database import Base, engine

# Automatically create all database tables based on models
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AMES System")

# Configure CORS for the Vite/React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Wildcard for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(auth.router)
app.include_router(eccd.router)
app.include_router(sections.router)
app.include_router(students.router)
app.include_router(settings.router)
app.include_router(analytics.router)
app.include_router(teachers.router)
app.include_router(messages.router)
app.include_router(backup.router)
app.include_router(eccd_config.router)
app.include_router(chairman.router)
app.include_router(parents.router)

@app.get("/")
def root():
    return {"message": "Welcome to the AMES System API"}
