import "./styles/main.css";
import { createGameApp } from "./app/createGameApp";

const root = document.querySelector<HTMLElement>("#app");
const canvas = document.querySelector<HTMLCanvasElement>("#scene");

if (!root || !canvas) {
  throw new Error("Missing application root or Three.js canvas.");
}

const app = createGameApp({ root, canvas });
app.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.dispose());
}
