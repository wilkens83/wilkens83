import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LotteryPage from './components/LotteryPage';
import './App.css';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LotteryPage />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
