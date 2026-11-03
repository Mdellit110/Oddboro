// The loading window's words. The shell sets `window.oddboroUpdating` to the
// version it is installing, or to an empty string while the office opens,
// and calls `oddboroShow` again when that changes.
window.oddboroShow = () => {
  const version = window.oddboroUpdating;
  document.getElementById('title').textContent = version
    ? `Updating Oddboro to ${version}`
    : 'Opening the office';
  document.getElementById('detail').textContent = version
    ? 'Oddboro opens again in a moment.'
    : 'The first start can take a minute.';
};
window.oddboroShow();
