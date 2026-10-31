"""HTTP Server for AI Customer Support Avatar Demo.

Serves the frontend demo website and issues scoped LiveKit tokens for browser clients.

How to Run:
    python server.py
    Then open http://localhost:8080 in your browser.
"""

import os
import uuid
from datetime import timedelta
from pathlib import Path

from aiohttp import web
from dotenv import load_dotenv
from livekit import api

# Load environment configuration
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

# Agent name must match AGENT_NAME in agent.py
AGENT_NAME = "avatar-support-agent"
STATIC_DIR = Path(__file__).parent


async def token_handler(request: web.Request) -> web.Response:
    """Generate a scoped, temporary LiveKit token for the browser client.
    
    Dispatches the customer support agent into the generated room.
    """
    livekit_url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    # Guard: Check for missing LiveKit credentials
    if not livekit_url or not api_key or not api_secret:
        return web.json_response(
            {
                "error": "Missing LiveKit credentials. Please configure LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET in your .env file."
            },
            status=500,
        )

    # Unique room and identity per browser visitor session
    room_name = f"apex-support-{uuid.uuid4().hex[:8]}"
    identity = f"customer-{uuid.uuid4().hex[:8]}"

    # Room configuration with explicit agent dispatch
    # sync_streams aligns the avatar's audio and video rendering in the browser
    room_config = api.RoomConfiguration(
        sync_streams=True,
        agents=[api.RoomAgentDispatch(agent_name=AGENT_NAME)],
    )

    try:
        jwt = (
            api.AccessToken(api_key, api_secret)
            .with_identity(identity)
            .with_name("Customer Guest")
            .with_ttl(timedelta(minutes=15))
            .with_grants(api.VideoGrants(room_join=True, room=room_name))
            .with_room_config(room_config)
            .to_jwt()
        )
        return web.json_response({"url": livekit_url, "token": jwt, "room": room_name})
    except Exception as e:
        return web.json_response(
            {"error": f"Failed to generate LiveKit token: {str(e)}"},
            status=500,
        )


async def index_handler(request: web.Request) -> web.FileResponse:
    """Serve the demo website HTML page."""
    html_path = STATIC_DIR / "index.html"
    return web.FileResponse(html_path, headers={"Cache-Control": "no-store"})


def create_app() -> web.Application:
    """Initialize and configure the aiohttp application."""
    app = web.Application()
    app.router.add_get("/", index_handler)
    app.router.add_get("/token", token_handler)
    
    # Serve static assets (site.js, style.css, knowledge.json)
    app.router.add_static("/static/", path=STATIC_DIR, show_index=False)
    
    # Also support direct root asset requests for style.css and site.js
    async def serve_file(request: web.Request) -> web.FileResponse:
        filename = request.match_info["filename"]
        target = STATIC_DIR / filename
        if target.is_file() and filename in {"style.css", "site.js", "avatar3d.js", "knowledge.json"}:
            return web.FileResponse(target, headers={"Cache-Control": "no-store"})
        raise web.HTTPNotFound()

    app.router.add_get("/{filename:.*\\.(?:css|js|json)}", serve_file)
    return app


if __name__ == "__main__":
    app = create_app()
    print("Apex Cloud Solutions Support Avatar Server running at http://127.0.0.1:8080")
    web.run_app(app, host="127.0.0.1", port=8080)
