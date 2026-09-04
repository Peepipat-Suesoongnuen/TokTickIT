import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/lab2-theme.css";
import App from "./App";
import { RequesterProvider } from "./contexts/RequesterContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RequesterProvider>
        <App />
      </RequesterProvider>
    </BrowserRouter>
  </React.StrictMode>
);
