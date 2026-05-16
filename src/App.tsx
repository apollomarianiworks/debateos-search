import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Home } from "./pages/Home";
import { Results } from "./pages/Results";
import { Settings } from "./pages/Settings";
import { Sources } from "./pages/Sources";
import { Viewer } from "./pages/Viewer";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results" element={<Results />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/viewer" element={<Viewer />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
