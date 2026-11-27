// A toast with an Undo button, for edits to Unified playlists and gigs.
// Plain notification when there is nothing to undo.

export function undoToast(message, undo, { onUndone = null, type = 'success', ms = 6000, title = '' } = {}) {
    if (typeof document === 'undefined') return null;
    const note = document.createElement('div');
    note.className = `notification ${type}${undo ? ' has-undo' : ''}`;
    if (title) note.title = title;
    const text = document.createElement('span');
    text.textContent = message;
    note.append(text);
    if (undo) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'notification-undo';
        button.textContent = 'Undo';
        button.addEventListener('click', async () => {
            button.disabled = true;
            try { await undo(); note.remove(); onUndone?.(); }
            catch (error) { text.textContent = `Undo failed: ${error?.message || error}`; note.className = 'notification error'; button.remove(); }
        }, { once: true });
        note.append(button);
    }
    document.body.appendChild(note);
    setTimeout(() => note.remove(), ms);
    return note;
}
