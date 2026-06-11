// Red emergency pill shown in hero sections (hub + vertical homes). Rendered
// as a tel: link so one tap dials SAMU straight from a phone — an emergency
// notice the user can act on, not just read.
export default function EmergencyNotice({ label }: { label: string }) {
  return (
    <a
      href="tel:192"
      className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-full hover:bg-red-100 transition-colors"
    >
      <svg
        className="w-4 h-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      {label}
    </a>
  );
}
