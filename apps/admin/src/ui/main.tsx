import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./globals.css";

const container = document.getElementById("root");
if (container === null) throw new Error("apps/admin: index.html is missing #root — cannot mount the UI");

createRoot(container).render(<App />);
