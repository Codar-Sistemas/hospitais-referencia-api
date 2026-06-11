// Full-width red emergency strip rendered at the top of the hub and of every
// vertical page: the SAMU call-to-action plus the data-freshness disclaimer.
// The number is a tel: link so one tap dials from a phone.
export default function EmergencyBanner() {
  return (
    <div className="bg-red-600 text-white text-xs sm:text-sm font-medium text-center px-4 py-2 flex items-center justify-center gap-2">
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
      <span>
        <strong>
          Emergência? Ligue para o{' '}
          <a href="tel:192" className="underline underline-offset-2 hover:opacity-80">
            SAMU: 192
          </a>
          .
        </strong>{' '}
        <span className="opacity-90">
          As informações aqui podem estar desatualizadas — sempre confirme com a unidade antes de se
          deslocar.
        </span>
      </span>
    </div>
  );
}
