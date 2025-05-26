import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Search from './pages/Search';

function App() {
  return (
    <Router basename={process.env.PUBLIC_URL}>
      <Routes>
        <Route path="/" element={<Search />} />
      </Routes>
    </Router>
  );
}

export default App;
