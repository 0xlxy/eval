"use client";

export function CommandPaletteTrigger({
  children,
}: {
  children: React.ReactNode;
}) {
  function openPalette() {
    // CommandPalette listens for Cmd/Ctrl+K globally — dispatch it so the
    // search button opens the same modal.
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true })
    );
  }
  return (
    <button onClick={openPalette} type="button">
      {children}
    </button>
  );
}
