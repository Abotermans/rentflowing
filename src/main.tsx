import { createRoot } from "react-dom/client";
import { installReplayGuard } from "./security/replayGuard";
import App from "./App.tsx";
import "./index.css";

installReplayGuard();

// Mount app
createRoot(document.getElementById("root")!).render(<App />);
