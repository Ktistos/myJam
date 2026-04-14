from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import users, jams, songs, uploads, events, spotify

app = FastAPI(title="myJam API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(jams.router)
app.include_router(songs.router)
app.include_router(uploads.router)
app.include_router(events.router)
app.include_router(spotify.router)


@app.get("/health")
def health():
    return {"status": "ok"}
