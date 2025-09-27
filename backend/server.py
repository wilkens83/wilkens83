from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, validator
from typing import List, Optional
import uuid
from datetime import datetime
import random

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class LotteryTicket(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    game_type: str  # "lotto3", "lotto4", "lotto5", "maryaj"
    location: str
    numbers: List[int]
    bet_amount: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    status: str = "active"  # "active", "drawn", "won", "lost"
    
    @validator('numbers')
    def validate_numbers(cls, v, values):
        game_type = values.get('game_type')
        if game_type == 'lotto3' and len(v) != 3:
            raise ValueError('Lotto 3 requires exactly 3 numbers')
        elif game_type == 'lotto4' and len(v) != 4:
            raise ValueError('Lotto 4 requires exactly 4 numbers')
        elif game_type == 'lotto5' and len(v) != 5:
            raise ValueError('Lotto 5 requires exactly 5 numbers')
        elif game_type == 'maryaj' and len(v) != 2:
            raise ValueError('Maryaj requires exactly 2 numbers')
        
        # Validate number range (0-99 for each position)
        for num in v:
            if not (0 <= num <= 99):
                raise ValueError('Numbers must be between 0 and 99')
        return v
    
    @validator('bet_amount')
    def validate_bet_amount(cls, v):
        if v <= 0:
            raise ValueError('Bet amount must be positive')
        if v > 1000:
            raise ValueError('Maximum bet amount is $1000')
        return v

class LotteryTicketCreate(BaseModel):
    game_type: str
    location: str
    numbers: List[int]
    bet_amount: float

class QuickPickRequest(BaseModel):
    game_type: str
    count: Optional[int] = 1

class DrawResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    game_type: str
    location: str
    winning_numbers: List[int]
    draw_date: datetime = Field(default_factory=datetime.utcnow)
    prize_pool: float = 0.0

class DrawResultCreate(BaseModel):
    game_type: str
    location: str
    prize_pool: Optional[float] = 0.0

# Existing routes
@api_router.get("/")
async def root():
    return {"message": "Lottery API Ready"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Lottery Routes
@api_router.post("/lottery/tickets", response_model=LotteryTicket)
async def create_lottery_ticket(ticket_data: LotteryTicketCreate):
    """Create a new lottery ticket"""
    try:
        ticket_dict = ticket_data.dict()
        ticket_obj = LotteryTicket(**ticket_dict)
        await db.lottery_tickets.insert_one(ticket_obj.dict())
        return ticket_obj
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/lottery/tickets", response_model=List[LotteryTicket])
async def get_lottery_tickets():
    """Get all lottery tickets"""
    tickets = await db.lottery_tickets.find().sort("timestamp", -1).to_list(1000)
    return [LotteryTicket(**ticket) for ticket in tickets]

@api_router.get("/lottery/tickets/{ticket_id}", response_model=LotteryTicket)
async def get_lottery_ticket(ticket_id: str):
    """Get a specific lottery ticket"""
    ticket = await db.lottery_tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return LotteryTicket(**ticket)

@api_router.post("/lottery/quick-pick")
async def generate_quick_pick(request: QuickPickRequest):
    """Generate random numbers for quick pick"""
    game_type = request.game_type.lower()
    
    number_counts = {
        'lotto3': 3,
        'lotto4': 4, 
        'lotto5': 5,
        'maryaj': 2
    }
    
    if game_type not in number_counts:
        raise HTTPException(status_code=400, detail="Invalid game type")
    
    count = number_counts[game_type]
    quick_picks = []
    
    for _ in range(request.count):
        # Generate random numbers (0-99 for each position)
        numbers = [random.randint(0, 99) for _ in range(count)]
        quick_picks.append(numbers)
    
    return {
        "game_type": game_type,
        "quick_picks": quick_picks
    }

@api_router.post("/lottery/draws", response_model=DrawResult)
async def create_draw(draw_data: DrawResultCreate):
    """Create a new lottery draw with random winning numbers"""
    game_type = draw_data.game_type.lower()
    
    number_counts = {
        'lotto3': 3,
        'lotto4': 4,
        'lotto5': 5, 
        'maryaj': 2
    }
    
    if game_type not in number_counts:
        raise HTTPException(status_code=400, detail="Invalid game type")
    
    count = number_counts[game_type]
    winning_numbers = [random.randint(0, 99) for _ in range(count)]
    
    draw_dict = draw_data.dict()
    draw_obj = DrawResult(**draw_dict, winning_numbers=winning_numbers)
    
    await db.draw_results.insert_one(draw_obj.dict())
    
    # Update ticket statuses based on winning numbers
    await update_ticket_results(game_type, draw_data.location, winning_numbers)
    
    return draw_obj

@api_router.get("/lottery/draws", response_model=List[DrawResult])
async def get_draws():
    """Get all lottery draws"""
    draws = await db.draw_results.find().sort("draw_date", -1).to_list(1000)
    return [DrawResult(**draw) for draw in draws]

@api_router.get("/lottery/draws/{game_type}/{location}")
async def get_latest_draw(game_type: str, location: str):
    """Get the latest draw for a specific game type and location"""
    draw = await db.draw_results.find_one(
        {"game_type": game_type.lower(), "location": location},
        sort=[("draw_date", -1)]
    )
    if not draw:
        return {"message": "No draws found"}
    return DrawResult(**draw)

@api_router.get("/lottery/draws-schedule")
async def get_draws_schedule():
    """Get available draws with schedule and status"""
    from datetime import datetime, time
    import pytz
    
    # Get current time in EST
    est = pytz.timezone('US/Eastern')
    current_time = datetime.now(est).time()
    
    def get_draw_status(draw_time_str):
        """Determine if draw is Open, Closed, or In Progress"""
        draw_time = datetime.strptime(draw_time_str, "%H:%M").time()
        
        # Create time ranges for "In Progress" (15 minutes before to 15 minutes after)
        import datetime as dt
        draw_datetime = dt.datetime.combine(dt.date.today(), draw_time)
        start_progress = (draw_datetime - dt.timedelta(minutes=15)).time()
        end_progress = (draw_datetime + dt.timedelta(minutes=15)).time()
        
        if start_progress <= current_time <= end_progress:
            return "In Progress"
        elif current_time < draw_time:
            return "Open"
        else:
            return "Closed"
    
    draws = [
        {
            "id": "ny_midday",
            "name": "New York Midday",
            "location": "NY",
            "time": "12:00",
            "status": get_draw_status("12:00"),
            "timezone": "EST"
        },
        {
            "id": "ny_evening", 
            "name": "New York Evening",
            "location": "NY",
            "time": "19:00",
            "status": get_draw_status("19:00"),
            "timezone": "EST"
        },
        {
            "id": "fl_midday",
            "name": "Florida Midday", 
            "location": "FL",
            "time": "12:30",
            "status": get_draw_status("12:30"),
            "timezone": "EST"
        },
        {
            "id": "fl_evening",
            "name": "Florida Evening",
            "location": "FL", 
            "time": "19:30",
            "status": get_draw_status("19:30"),
            "timezone": "EST"
        },
        {
            "id": "ct_daily",
            "name": "Connecticut",
            "location": "CT",
            "time": "18:45",
            "status": get_draw_status("18:45"),
            "timezone": "EST"
        },
        {
            "id": "ar_daily",
            "name": "Arkansas", 
            "location": "AR",
            "time": "20:00",
            "status": get_draw_status("20:00"),
            "timezone": "CST"
        }
    ]
    
    return {"draws": draws}

@api_router.get("/lottery/game-types")
async def get_game_types():
    """Get available game types with payouts"""
    return {
        "game_types": [
            {
                "id": "loto2", 
                "name": "Loto 2 Digits",
                "description": "Classic borlette 00–99",
                "numbers_required": 2,
                "number_range": "00-99",
                "payout": "x50",
                "color": "bg-red-500"
            },
            {
                "id": "loto3", 
                "name": "Loto 3 Digits", 
                "description": "000–999",
                "numbers_required": 3,
                "number_range": "000-999", 
                "payout": "x500",
                "color": "bg-blue-500"
            },
            {
                "id": "loto4", 
                "name": "Loto 4 Digits",
                "description": "0000–9999", 
                "numbers_required": 4,
                "number_range": "0000-9999",
                "payout": "x5000", 
                "color": "bg-green-500"
            },
            {
                "id": "loto5", 
                "name": "Loto 5 Digits",
                "description": "00000–99999",
                "numbers_required": 5, 
                "number_range": "00000-99999",
                "payout": "x50000",
                "color": "bg-purple-500"
            },
            {
                "id": "mariage", 
                "name": "Mariage",
                "description": "Combination of 2 numbers", 
                "numbers_required": 2,
                "number_range": "00-99 pairs",
                "payout": "x25",
                "color": "bg-pink-500"
            }
        ]
    }

async def update_ticket_results(game_type: str, location: str, winning_numbers: List[int]):
    """Update lottery ticket results based on winning numbers"""
    # Find all active tickets for this game type and location
    tickets = await db.lottery_tickets.find({
        "game_type": game_type,
        "location": location,
        "status": "active"
    }).to_list(1000)
    
    for ticket in tickets:
        ticket_numbers = ticket["numbers"]
        
        # Check if ticket numbers match winning numbers
        if ticket_numbers == winning_numbers:
            # Exact match - winner!
            await db.lottery_tickets.update_one(
                {"id": ticket["id"]},
                {"$set": {"status": "won"}}
            )
        else:
            # No match - loser
            await db.lottery_tickets.update_one(
                {"id": ticket["id"]},
                {"$set": {"status": "lost"}}
            )

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
