import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DarkroomApp } from "@/components/darkroom/app";
import "../apk/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DarkroomApp />
  </StrictMode>,
);
