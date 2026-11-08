// WordLetter V1.1: help users save the website to their phone home screen.
// Deliberately informational: never attempts an automatic install or changes user data.
(() => {
  "use strict";
  const dialog = document.getElementById("installGuideDialog");
  const opener = document.getElementById("openInstallGuide");
  const closeButton = document.getElementById("installGuideClose");
  const tabs = {
    iphone: document.getElementById("installGuideIphoneTab"),
    android: document.getElementById("installGuideAndroidTab")
  };
  const panels = {
    iphone: document.getElementById("installGuideIphone"),
    android: document.getElementById("installGuideAndroid")
  };
  if (!dialog || !opener || !closeButton || !tabs.iphone || !tabs.android || !panels.iphone || !panels.android) return;

  let lastFocus = null;
  function selectDevice(device, focus = false) {
    if (!Object.prototype.hasOwnProperty.call(tabs, device)) return;
    for (const name of ["iphone", "android"]) {
      const active = name === device;
      tabs[name].setAttribute("aria-selected", String(active));
      tabs[name].tabIndex = active ? 0 : -1;
      panels[name].hidden = !active;
    }
    if (focus) tabs[device].focus();
  }
  function openGuide() {
    if (dialog.open) return;
    lastFocus = document.activeElement;
    selectDevice("iphone");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    closeButton.focus();
  }
  function closeGuide() {
    if (!dialog.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else {
      dialog.removeAttribute("open");
      restoreFocus();
    }
  }
  function restoreFocus() {
    if (lastFocus && lastFocus.isConnected && typeof lastFocus.focus === "function") lastFocus.focus();
    lastFocus = null;
  }
  opener.addEventListener("click", openGuide);
  closeButton.addEventListener("click", closeGuide);
  dialog.addEventListener("close", restoreFocus);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeGuide();
  });
  for (const name of ["iphone", "android"]) {
    tabs[name].addEventListener("click", () => selectDevice(name));
    tabs[name].addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      selectDevice(name === "iphone" ? "android" : "iphone", true);
    });
  }
  selectDevice("iphone");
  // The future three-card onboarding can offer an optional link via this helper.
  window.MiaowuInstallGuide = Object.freeze({ open: openGuide });
})();