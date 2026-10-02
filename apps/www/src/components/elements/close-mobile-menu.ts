/** Close the Tailwind Plus mobile nav dialog after navigation. */
export function closeMobileMenu(): void {
  const dialog = document.getElementById('mobile-menu')
  if (dialog instanceof HTMLDialogElement && dialog.open) {
    dialog.close()
  }
}
