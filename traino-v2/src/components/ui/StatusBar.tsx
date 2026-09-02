/** Mimics the iOS status bar shown in the reference (time + signal/wifi/battery). */
export function StatusBar() {
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-1 text-white text-[15px] font-semibold">
      <span>9:41</span>
      <div className="flex items-center gap-1.5">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
          <rect x="0" y="7" width="3" height="5" rx="0.5" />
          <rect x="5" y="5" width="3" height="7" rx="0.5" />
          <rect x="10" y="3" width="3" height="9" rx="0.5" />
          <rect x="15" y="0" width="3" height="12" rx="0.5" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
          <path d="M8 10.2a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm-3.4-3.5a4.8 4.8 0 0 1 6.8 0l-1.1 1.1a3.2 3.2 0 0 0-4.6 0Zm-2.7-2.6a8.5 8.5 0 0 1 12.2 0L13 5.2a6.4 6.4 0 0 0-9 0Z" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="2.5" stroke="currentColor" />
          <rect x="2" y="2" width="18" height="8" rx="1.2" fill="currentColor" />
          <rect x="22.5" y="4" width="1.6" height="4" rx="0.8" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}
