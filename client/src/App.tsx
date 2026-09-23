import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import HostPage from "./pages/HostPage";
import JoinPage from "./pages/JoinPage";
import DrawPage from "./pages/DrawPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/draw" element={<DrawPage />} />
      </Routes>
    </BrowserRouter>
  );
}
