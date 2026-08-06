import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Editor from './pages/Editor';

function App() {
  return (
    // BrowserRouter is the engine that watches your browser's URL bar
    <BrowserRouter>
      {/* Routes is the switch() statement */}
      <Routes>
        
        {/* If the URL is exactly "/", draw the Home scene */}
        <Route path="/" element={<Home />} />
        
        {/* If the URL is "/editor/anything", draw the Editor scene */}
        <Route path="/editor/:id" element={<Editor />} />
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;