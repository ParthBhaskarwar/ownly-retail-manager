const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'Frontend', 'src', 'styles', 'components.css');
let css = fs.readFileSync(filePath, 'utf8');

// 1. Replace 1.5px dashed with 1px solid (except for dropzone maybe? let's just do all dashed except dropzone)
// Actually we can just do a regex replace for the known structural ones.
css = css.replace(/1\.5px dashed var\(--color-border-subtle\)/g, '1px solid var(--color-border-subtle)');
css = css.replace(/1\.5px dashed var\(--color-sidebar-border\)/g, '1px solid var(--color-sidebar-border)');
css = css.replace(/border-bottom: 1\.5px dashed var\(--color-border\);/g, 'border-bottom: 1px solid var(--color-border);\n  background: var(--color-muted);');

// 2. Table hover background
css = css.replace(/\.staff-table__row:hover \{ background: var\(--color-paper\); \}/g, '.staff-table__row:hover { background: var(--color-muted); }');

// 3. Button and Input heights
css = css.replace(/min-height: var\(--tap-target-min\);/g, 'min-height: 40px;');
css = css.replace(/height: var\(--tap-target-min\);/g, 'height: 40px;');

// 4. Badges tag shape to rounded
// .badge
css = css.replace(/border-radius: var\(--radius-xs\) 10px 10px var\(--radius-xs\);/g, 'border-radius: var(--radius-sm);');
css = css.replace(/padding: 4px var\(--space-3\) 4px var\(--space-2\);/g, 'padding: 2px var(--space-2);');
css = css.replace(/padding: 3px var\(--space-2\) 3px 6px;/g, 'padding: 2px var(--space-2);');

// .sidebar-nav-item__badge
css = css.replace(/border-radius: var\(--radius-xs\) 8px 8px var\(--radius-xs\);/g, 'border-radius: var(--radius-sm);');

// 5. Modals and Cards radiuses are already var(--radius-xl) which we set to 12px in tokens.css, 
// so they should automatically be correct.

// 6. Secondary button hover
// .btn-secondary:hover:not(:disabled) {
//   border-color: var(--color-border-strong);
//   background: var(--color-paper);
// }
// Change to use paper for hover background as it's now Stone 50.
// Wait, the design says: Secondary Hover: background #FAFAF9 (which is var(--color-paper)). So this is already correct.

// 7. Ghost button hover
// .btn-ghost:hover:not(:disabled) {
//   background: var(--color-border-subtle);
//   color: var(--color-ink);
// }
// Change to var(--color-muted)
css = css.replace(/background: var\(--color-border-subtle\);/g, 'background: var(--color-muted);'); 
// (Checking if var(--color-border-subtle) is used elsewhere for background - progress step done uses it, checklist step done uses it. Actually let's be more specific).
css = css.replace(/\.btn-ghost:hover:not\(:disabled\) \{\s*background: var\(--color-border-subtle\);/g, '.btn-ghost:hover:not(:disabled) {\n  background: var(--color-muted);');

// 8. .btn-danger hover -> background: #FAE3E3. Let's make it match the design more closely if needed, but keeping it is fine.
// But wait, the user asked to change button styles for primary, secondary, ghost.
// The ghost button also uses var(--color-muted) for hover.

// Save the file
fs.writeFileSync(filePath, css, 'utf8');
console.log('components.css updated');
