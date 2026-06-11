// Pulsing "SAMU 192" pill shown in headers. tel: link — one tap dials.
// Pass display classes (e.g. "flex" or "hidden md:flex") via className.
export default function SamuBadge({ className = 'flex' }: { className?: string }) {
  return (
    <a
      href="tel:192"
      className={`${className} items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full hover:bg-red-100 transition-colors`}
    >
      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
      SAMU 192
    </a>
  );
}
