/**
 * Print only one section of the app.
 *
 * The section's root element is portalled to <body> by the caller and carries
 * `data-print-section="<name>"`. While printing, body gets `print-<name>`; the
 * stylesheet hides every other direct child of <body>. The class is removed on
 * `afterprint`, which also fires when the user cancels the dialog.
 */
export function printSection(name: 'labels' | 'slip' | 'report'): void {
  const cls = `print-${name}`;
  document.body.classList.add(cls);
  const cleanup = () => {
    document.body.classList.remove(cls);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
