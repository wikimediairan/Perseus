import "./i18n";
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";

import App from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("index.html - Root element not found!");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Toaster dir="ltr" position="top-center" />
    <App />
  </React.StrictMode>,
);
