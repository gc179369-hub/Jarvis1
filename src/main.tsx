import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// StrictMode omitido intencionalmente: o motor de áudio/voz é um singleton
// e não deve ser inicializado duas vezes.
createRoot(document.getElementById("root")!).render(<App />);
