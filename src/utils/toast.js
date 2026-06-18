export function toast(message, isError = false) {
    document.querySelector(".toast")?.remove();
    const element = document.createElement("div");
    element.className = `toast${isError ? " error" : ""}`;
    element.textContent = message;
    document.body.appendChild(element);
    setTimeout(() => element.remove(), 3400);
}
