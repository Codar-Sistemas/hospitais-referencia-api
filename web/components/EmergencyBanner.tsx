import WarningIcon from './WarningIcon';

// Full-width red emergency strip rendered at the top of the hub and of every
// vertical page: the SAMU call-to-action plus the data-freshness disclaimer.
// The number is a tel: link so one tap dials from a phone.
export default function EmergencyBanner() {
  return (
    <div className="bg-red-600 text-white text-xs sm:text-sm font-medium text-center px-4 py-2 flex items-center justify-center gap-2">
      <WarningIcon className="w-4 h-4 shrink-0" />
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
