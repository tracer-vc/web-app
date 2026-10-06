// Scroll to an element on this page and flash it (e.g. a CR# tag pointing at
// its row in the Conflict Register). Returns false when it isn't on the page.
export function flashTo(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("flash-highlight");
  void el.offsetWidth; // restart the animation
  el.classList.add("flash-highlight");
  return true;
}
