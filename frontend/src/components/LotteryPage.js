import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent } from './ui/card';
import { Minus, Plus, Sparkles, RotateCcw, X } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LotteryPage = () => {
  const [selectedDraw, setSelectedDraw] = useState('ny_midday');
  const [selectedGameType, setSelectedGameType] = useState('loto3');
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [betAmount, setBetAmount] = useState(5.00);
  const [drawsSchedule, setDrawsSchedule] = useState([]);
  const [gameTypes, setGameTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [latestDraw, setLatestDraw] = useState(null);

  useEffect(() => {
    fetchDrawsSchedule();
    fetchGameTypes();
    fetchTickets();
  }, []);

  useEffect(() => {
    fetchLatestDraw();
  }, [selectedGameType, selectedDraw]);

  const fetchDrawsSchedule = async () => {
    try {
      const response = await axios.get(`${API}/lottery/draws-schedule`);
      setDrawsSchedule(response.data.draws);
    } catch (error) {
      console.error('Error fetching draws schedule:', error);
    }
  };

  const fetchGameTypes = async () => {
    try {
      const response = await axios.get(`${API}/lottery/game-types`);
      setGameTypes(response.data.game_types);
    } catch (error) {
      console.error('Error fetching game types:', error);
    }
  };

  const fetchTickets = async () => {
    try {
      const response = await axios.get(`${API}/lottery/tickets`);
      setTickets(response.data.slice(0, 5)); // Show last 5 tickets
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  };

  const fetchLatestDraw = async () => {
    try {
      const currentDraw = drawsSchedule.find(draw => draw.id === selectedDraw);
      if (currentDraw) {
        const response = await axios.get(`${API}/lottery/draws/${selectedGameType}/${currentDraw.location}`);
        if (response.data.id) {
          setLatestDraw(response.data);
        }
      }
    } catch (error) {
      console.error('Error fetching latest draw:', error);
    }
  };

  const getRequiredNumbers = () => {
    const gameType = gameTypes.find(gt => gt.id === selectedGameType);
    return gameType ? gameType.numbers_required : 3;
  };

  const handleNumberSelect = (number) => {
    const requiredNumbers = getRequiredNumbers();
    
    if (selectedNumbers.includes(number)) {
      // Remove number if already selected
      setSelectedNumbers(selectedNumbers.filter(n => n !== number));
    } else if (selectedNumbers.length < requiredNumbers) {
      // Add number if under limit
      setSelectedNumbers([...selectedNumbers, number]);
    } else {
      // Replace last number if at limit
      const newNumbers = [...selectedNumbers];
      newNumbers[requiredNumbers - 1] = number;
      setSelectedNumbers(newNumbers);
    }
  };

  const handleClear = () => {
    setSelectedNumbers([]);
  };

  const handleRemoveLast = () => {
    if (selectedNumbers.length > 0) {
      setSelectedNumbers(selectedNumbers.slice(0, -1));
    }
  };

  const handleQuickPick = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/lottery/quick-pick`, {
        game_type: selectedGameType,
        count: 1
      });
      
      if (response.data.quick_picks && response.data.quick_picks.length > 0) {
        setSelectedNumbers(response.data.quick_picks[0]);
        showAlert('success', 'Numbers generated with Quick Pick!');
      }
    } catch (error) {
      showAlert('error', 'Failed to generate Quick Pick numbers');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBetAmountChange = (change) => {
    const newAmount = Math.max(1, Math.min(1000, betAmount + change));
    setBetAmount(parseFloat(newAmount.toFixed(2)));
  };

  const handlePlayNow = async () => {
    const requiredNumbers = getRequiredNumbers();
    
    if (selectedNumbers.length !== requiredNumbers) {
      showAlert('error', `Please select exactly ${requiredNumbers} numbers for ${selectedGameType.toUpperCase()}`);
      return;
    }

    const currentDraw = drawsSchedule.find(draw => draw.id === selectedDraw);
    if (!currentDraw) {
      showAlert('error', 'Please select a valid draw');
      return;
    }

    if (currentDraw.status === 'Closed') {
      showAlert('error', 'This draw is closed. Please select another draw.');
      return;
    }

    setIsLoading(true);
    try {
      const ticketData = {
        game_type: selectedGameType,
        location: currentDraw.location,
        numbers: selectedNumbers,
        bet_amount: betAmount
      };

      const response = await axios.post(`${API}/lottery/tickets`, ticketData);
      
      if (response.data) {
        showAlert('success', `Lottery ticket created successfully! Ticket ID: ${response.data.id.slice(0, 8)}...`);
        setSelectedNumbers([]);
        fetchTickets();
      }
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to create lottery ticket';
      showAlert('error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const formatNumbers = (numbers) => {
    return numbers.map(n => n.toString().padStart(2, '0')).join(' - ');
  };

  const renderNumberGrid = () => {
    return (
      <div className="grid grid-cols-3 gap-3 mb-6">
        {/* First row: 1, 2, 3 */}
        {[1, 2, 3].map(num => (
          <Button
            key={num}
            onClick={() => handleNumberSelect(num)}
            className={`number-button h-16 text-2xl font-bold rounded-xl transition-all ${
              selectedNumbers.includes(num)
                ? 'bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-400'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
            data-testid={`number-${num}`}
          >
            {num}
          </Button>
        ))}
        
        {/* Second row: 4, 5, 6 */}
        {[4, 5, 6].map(num => (
          <Button
            key={num}
            onClick={() => handleNumberSelect(num)}
            className={`number-button h-16 text-2xl font-bold rounded-xl transition-all ${
              selectedNumbers.includes(num)
                ? 'bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-400'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
            data-testid={`number-${num}`}
          >
            {num}
          </Button>
        ))}
        
        {/* Third row: 7, 8, 9 */}
        {[7, 8, 9].map(num => (
          <Button
            key={num}
            onClick={() => handleNumberSelect(num)}
            className={`number-button h-16 text-2xl font-bold rounded-xl transition-all ${
              selectedNumbers.includes(num)
                ? 'bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-400'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
            data-testid={`number-${num}`}
          >
            {num}
          </Button>
        ))}
        
        {/* Fourth row: X, 0, Clear */}
        <Button
          onClick={handleRemoveLast}
          className="number-button h-16 text-xl font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white"
          data-testid="remove-last-btn"
        >
          <X size={24} />
        </Button>
        
        <Button
          onClick={() => handleNumberSelect(0)}
          className={`number-button h-16 text-2xl font-bold rounded-xl transition-all ${
            selectedNumbers.includes(0)
              ? 'bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-400'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}
          data-testid="number-0"
        >
          0
        </Button>
        
        <Button
          onClick={handleClear}
          className="number-button h-16 text-sm font-bold rounded-xl bg-gray-600 hover:bg-gray-500 text-white"
          data-testid="clear-btn"
        >
          Clear
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 p-4">
      <div className="max-w-md mx-auto bg-slate-800/50 backdrop-blur-sm rounded-3xl shadow-2xl border border-slate-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 rounded-t-3xl">
          <div className="flex justify-between items-center mb-4">
            <Button variant="ghost" size="sm" className="text-white p-2">
              <RotateCcw size={20} />
            </Button>
            <h1 className="text-xl font-bold text-center text-white flex-1">
              Jwe Bòlèt / Play Lottery
            </h1>
            <Button variant="ghost" size="sm" className="text-white p-2">
              <X size={20} />
            </Button>
          </div>
          
          <div className="w-full h-1 bg-blue-300 rounded mb-1"></div>
          <div className="w-3/4 h-1 bg-red-500 rounded"></div>
        </div>

        <div className="p-6">
          {/* Alert */}
          {alert && (
            <Alert className={`mb-4 ${alert.type === 'error' ? 'border-red-500 bg-red-50' : 'border-green-500 bg-green-50'}`}>
              <AlertDescription className={alert.type === 'error' ? 'text-red-700' : 'text-green-700'}>
                {alert.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Location Selection */}
          <div className="mb-6">
            <label className="block text-sm text-gray-300 mb-2">Chwazi Tiraj / Select Draw</label>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="w-full bg-slate-700 border-slate-600 text-white" data-testid="location-selector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                {locations.map(location => (
                  <SelectItem key={location.code} value={location.code} className="text-white">
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Game Type Tabs */}
          <Tabs value={selectedGameType} onValueChange={setSelectedGameType} className="mb-6">
            <TabsList className="grid w-full grid-cols-4 bg-slate-700">
              {gameTypes.map(gameType => (
                <TabsTrigger 
                  key={gameType.id} 
                  value={gameType.id}
                  className="data-[state=active]:bg-blue-600 text-white"
                  data-testid={`game-type-${gameType.id}`}
                >
                  {gameType.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Selected Numbers Display */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm text-gray-300">Antre Nimewo / Enter Numbers</label>
              <Button
                onClick={handleQuickPick}
                disabled={isLoading}
                className="bg-yellow-600 hover:bg-yellow-700 text-black text-xs px-3 py-1"
                data-testid="quick-pick-btn"
              >
                <Sparkles size={16} className="mr-1" />
                Quick Pick
              </Button>
            </div>
            
            <div className="grid grid-cols-3 gap-3 mb-4">
              {Array.from({ length: getRequiredNumbers() }).map((_, index) => (
                <div
                  key={index}
                  className={`selected-number h-16 bg-slate-700 rounded-xl border-2 border-slate-600 flex items-center justify-center text-2xl font-bold ${
                    selectedNumbers[index] !== undefined ? 'bg-blue-600 border-blue-400' : ''
                  }`}
                  data-testid={`selected-number-${index}`}
                >
                  {selectedNumbers[index] !== undefined ? selectedNumbers[index].toString().padStart(2, '0') : ''}
                </div>
              ))}
            </div>
          </div>

          {/* Number Grid */}
          {renderNumberGrid()}

          {/* Bet Amount */}
          <div className="mb-6">
            <label className="block text-sm text-gray-300 mb-3">Kantite Lajan / Bet Amount</label>
            <div className="flex items-center justify-center space-x-4">
              <Button
                onClick={() => handleBetAmountChange(-1)}
                className="w-12 h-12 rounded-full bg-slate-600 hover:bg-slate-500"
                data-testid="decrease-bet-btn"
              >
                <Minus size={20} />
              </Button>
              
              <div className="text-3xl font-bold text-yellow-400" data-testid="bet-amount">
                ${betAmount.toFixed(2)}
              </div>
              
              <Button
                onClick={() => handleBetAmountChange(1)}
                className="w-12 h-12 rounded-full bg-slate-600 hover:bg-slate-500"
                data-testid="increase-bet-btn"
              >
                <Plus size={20} />
              </Button>
            </div>
          </div>

          {/* Play Button */}
          <Button
            onClick={handlePlayNow}
            disabled={isLoading || selectedNumbers.length !== getRequiredNumbers()}
            className="play-button w-full h-14 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black text-lg font-bold rounded-2xl disabled:opacity-50"
            data-testid="play-now-btn"
          >
            {isLoading ? (
              <div className="spinner"></div>
            ) : (
              <>Jwe Kounye a / Play Now 🎲</>
            )}
          </Button>

          {/* Recent Tickets & Latest Draw */}
          <div className="mt-8 space-y-4">
            {latestDraw && (
              <Card className="bg-slate-700/50 border-slate-600">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">Latest Draw - {selectedGameType.toUpperCase()}</h3>
                  <div className="text-lg font-bold text-yellow-400">
                    {formatNumbers(latestDraw.winning_numbers)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(latestDraw.draw_date).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            )}

            {tickets.length > 0 && (
              <Card className="bg-slate-700/50 border-slate-600">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Tickets</h3>
                  <div className="space-y-2">
                    {tickets.slice(0, 3).map(ticket => (
                      <div key={ticket.id} className="flex justify-between items-center text-sm">
                        <span className="text-white">
                          {ticket.game_type.toUpperCase()}: {formatNumbers(ticket.numbers)}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          ticket.status === 'won' ? 'bg-green-600' :
                          ticket.status === 'lost' ? 'bg-red-600' :
                          'bg-yellow-600 text-black'
                        }`}>
                          {ticket.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LotteryPage;