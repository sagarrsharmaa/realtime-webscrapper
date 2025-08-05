
# main.py - FastAPI Application
from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import asyncio
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional
import uuid
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup
import random
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ScrapeMaster API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data Models
class ScrapeJobCreate(BaseModel):
    name: str
    url: str
    selectors: Dict[str, str]
    max_pages: int = 10
    delay: float = 1.0
    use_proxy: bool = True

class ScrapeJob(BaseModel):
    id: str
    name: str
    url: str
    status: str
    progress: float
    items_scraped: int
    target_items: int
    requests_per_min: int
    created_at: datetime
    updated_at: datetime
    
class ProxyServer(BaseModel):
    id: str
    ip: str
    port: int
    country: str
    status: str
    response_time: int
    success_rate: float

# In-memory storage (replace with Redis/Database in production)
active_jobs: Dict[str, Dict] = {}
proxy_servers: List[Dict] = [
    {"id": "1", "ip": "192.168.1.100", "port": 8080, "country": "US", "status": "active", "response_time": 120, "success_rate": 98.5},
    {"id": "2", "ip": "10.0.0.50", "port": 3128, "country": "UK", "status": "active", "response_time": 95, "success_rate": 97.2},
    {"id": "3", "ip": "172.16.0.25", "port": 8888, "country": "DE", "status": "error", "response_time": 0, "success_rate": 0},
    {"id": "4", "ip": "203.0.113.45", "port": 8080, "country": "JP", "status": "active", "response_time": 180, "success_rate": 95.8},
    {"id": "5", "ip": "198.51.100.30", "port": 3128, "country": "CA", "status": "active", "response_time": 140, "success_rate": 96.4}
]

connected_websockets: List[WebSocket] = []

# WebSocket Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()

# Scraping Engine
class ScrapingEngine:
    def __init__(self):
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/91.0.4472.124",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/91.0.4472.124"
        ]
    
    def serialize_job(self, job: dict) -> dict:
        # Convert datetime fields to isoformat for JSON serialization
        job_copy = job.copy()
        for key in ["created_at", "updated_at"]:
            if key in job_copy and isinstance(job_copy[key], datetime):
                job_copy[key] = job_copy[key].isoformat()
        return job_copy

    async def scrape_website(self, job_id: str, url: str, selectors: Dict[str, str], max_pages: int = 10):
        """Main scraping function"""
        job = active_jobs[job_id]
        scraped_items = []
        
        try:
            async with httpx.AsyncClient() as client:
                for page in range(1, max_pages + 1):
                    if job["status"] != "running":
                        break
                        
                    # Update progress
                    progress = (page / max_pages) * 100
                    job["progress"] = progress
                    job["updated_at"] = datetime.now()
                    
                    # Simulate different URLs for pagination
                    page_url = f"{url}?page={page}" if page > 1 else url
                    
                    try:
                        # Random delay to avoid being detected
                        await asyncio.sleep(random.uniform(1, 3))
                        
                        # Make request with random user agent
                        headers = {"User-Agent": random.choice(self.user_agents)}
                        response = await client.get(page_url, headers=headers, timeout=10)
                        
                        if response.status_code == 200:
                            soup = BeautifulSoup(response.content, 'html.parser')
                            
                            # Extract data based on selectors
                            page_items = self.extract_data(soup, selectors)
                            scraped_items.extend(page_items)
                            
                            job["items_scraped"] = len(scraped_items)
                            job["requests_per_min"] = random.randint(30, 60)
                            
                            # Broadcast update via WebSocket
                            await manager.broadcast(json.dumps({
                                "type": "job_update",
                                "job": self.serialize_job(job)
                            }))

                            # Broadcast newly scraped items in real time
                            if page_items:
                                await manager.broadcast(json.dumps({
                                    "type": "scraped_items",
                                    "job_id": job_id,
                                    "items": page_items,
                                    "page": page,
                                    "timestamp": datetime.now().isoformat()
                                }))

                            # Log progress
                            await manager.broadcast(json.dumps({
                                "type": "log",
                                "message": f"Scraped page {page} from {job['name']} - {len(page_items)} items found",
                                "level": "info",
                                "timestamp": datetime.now().isoformat()
                            }))
                            
                        else:
                            logger.warning(f"Failed to scrape {page_url} - Status: {response.status_code}")
                            
                    except Exception as e:
                        logger.error(f"Error scraping page {page}: {str(e)}")
                        await manager.broadcast(json.dumps({
                            "type": "log",
                            "message": f"Error scraping page {page}: {str(e)}",
                            "level": "error",
                            "timestamp": datetime.now().isoformat()
                        }))
                        
            # Job completed
            job["status"] = "completed"
            job["progress"] = 100
            job["requests_per_min"] = 0
            job["updated_at"] = datetime.now()
            # job["scraped_items"] = scraped_items  # Removed: do not store scraped items in job dict
            await manager.broadcast(json.dumps({
                "type": "job_complete",
                "job": self.serialize_job(job),
                "total_items": len(scraped_items)
            }))
# Removed endpoint: /api/jobs/{job_id}/items
            
        except Exception as e:
            job["status"] = "error"
            job["updated_at"] = datetime.now()
            logger.error(f"Scraping job {job_id} failed: {str(e)}")
            
    def extract_data(self, soup: BeautifulSoup, selectors: Dict[str, str]) -> List[Dict]:
        """Extract data from HTML using CSS selectors"""
        items = []
        
        # Find all container elements (assuming there's a container selector)
        containers = soup.select(selectors.get("container", "div"))
        
        for container in containers[:10]:  # Limit to 10 items per page
            item = {}
            
            for field, selector in selectors.items():
                if field == "container":
                    continue
                    
                element = container.select_one(selector)
                if element:
                    item[field] = element.get_text(strip=True)
                else:
                    item[field] = None
                    
            if any(item.values()):  # Only add if we found some data
                items.append(item)
                
        return items

scraping_engine = ScrapingEngine()

# API Routes
@app.get("/")
async def root():
    return {"message": "ScrapeMaster API is running", "version": "1.0.0"}

@app.get("/api/jobs")
async def get_jobs():
    """Get all scraping jobs"""
    return {"jobs": list(active_jobs.values())}

@app.post("/api/jobs")
async def create_job(job_data: ScrapeJobCreate, background_tasks: BackgroundTasks):
    """Create a new scraping job"""
    job_id = str(uuid.uuid4())
    
    job = {
        "id": job_id,
        "name": job_data.name,
        "url": job_data.url,
        "status": "created",
        "progress": 0,
        "items_scraped": 0,
        "target_items": job_data.max_pages * 10,  # Estimate
        "requests_per_min": 0,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "selectors": job_data.selectors,
        "max_pages": job_data.max_pages
    }
    
    active_jobs[job_id] = job
    
    # Start scraping in background
    background_tasks.add_task(
        scraping_engine.scrape_website,
        job_id,
        job_data.url,
        job_data.selectors,
        job_data.max_pages
    )
    
    job["status"] = "running"
    
    return {"message": "Job created successfully", "job_id": job_id, "job": job}

@app.post("/api/jobs/{job_id}/start")
async def start_job(job_id: str, background_tasks: BackgroundTasks):
    """Start a paused job"""
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = active_jobs[job_id]
    if job["status"] in ["completed", "error"]:
        raise HTTPException(status_code=400, detail="Cannot start completed or failed job")
    
    job["status"] = "running"
    job["updated_at"] = datetime.now()
    
    # Resume scraping
    background_tasks.add_task(
        scraping_engine.scrape_website,
        job_id,
        job["url"],
        job["selectors"],
        job["max_pages"]
    )
    
    return {"message": "Job started", "job": job}

@app.post("/api/jobs/{job_id}/pause")
async def pause_job(job_id: str):
    """Pause a running job"""
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = active_jobs[job_id]
    job["status"] = "paused"
    job["requests_per_min"] = 0
    job["updated_at"] = datetime.now()
    
    return {"message": "Job paused", "job": job}

@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete a job"""
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    del active_jobs[job_id]
    return {"message": "Job deleted"}

@app.get("/api/proxies")
async def get_proxies():
    """Get all proxy servers"""
    return {"proxies": proxy_servers}

@app.get("/api/analytics")
async def get_analytics():
    """Get scraping analytics"""
    total_jobs = len(active_jobs)
    completed_jobs = len([job for job in active_jobs.values() if job["status"] == "completed"])
    success_rate = (completed_jobs / total_jobs * 100) if total_jobs > 0 else 0
    
    total_items = sum(job["items_scraped"] for job in active_jobs.values())
    active_sessions = len([job for job in active_jobs.values() if job["status"] == "running"])
    
    return {
        "success_rate": round(success_rate, 1),
        "total_requests": sum(job.get("total_requests", 0) for job in active_jobs.values()),
        "data_points": total_items,
        "active_sessions": active_sessions,
        "total_jobs": total_jobs,
        "completed_jobs": completed_jobs
    }

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back for now, can add more functionality
            await manager.send_personal_message(f"Echo: {data}", websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_jobs": len(active_jobs),
        "active_connections": len(manager.active_connections)
    }

# Example scraping job creation endpoint
@app.post("/api/jobs/quick-start")
async def quick_start_demo(background_tasks: BackgroundTasks):
    """Create a random demo scraping job for testing"""
    demo_sites = [
        {
            "name": "HttpBin HTML Demo",
            "url": "https://httpbin.org/html",
            "selectors": {
                "container": "div",
                "title": "h1",
                "description": "p"
            }
        },
        {
            "name": "Books to Scrape",
            "url": "https://books.toscrape.com/",
            "selectors": {
                "container": "article.product_pod",
                "title": "h3 a",
                "price": ".price_color",
                "availability": ".availability"
            }
        },
        {
            "name": "Quotes to Scrape",
            "url": "https://quotes.toscrape.com/",
            "selectors": {
                "container": "div.quote",
                "text": "span.text",
                "author": "small.author"
            }
        },
        {
            "name": "Random User",
            "url": "https://randomuser.me/",
            "selectors": {
                "container": "div#app",
                "title": "h1",
                "description": "p"
            }
        }
    ]
    site = random.choice(demo_sites)
    demo_job = ScrapeJobCreate(
        name=site["name"],
        url=site["url"],
        selectors=site["selectors"],
        max_pages=5,
        delay=1.0,
        use_proxy=False
    )
    return await create_job(demo_job, background_tasks)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)