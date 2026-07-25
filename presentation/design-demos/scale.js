function fitSlide() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  document.documentElement.style.setProperty("--scale", String(scale));
}

window.addEventListener("resize", fitSlide);
fitSlide();

