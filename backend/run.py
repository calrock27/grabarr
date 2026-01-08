import os
import uvicorn

if __name__ == "__main__":
    # Use 0.0.0.0 to allow connections from outside container
    host = os.environ.get("GRABARR_HOST", "0.0.0.0")
    port = int(os.environ.get("GRABARR_BACKEND_PORT", "8001"))
    reload = os.environ.get("GRABARR_DEV_MODE", "false").lower() == "true"
    
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)
