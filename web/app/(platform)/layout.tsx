import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';

// Chrome for platform-wide pages (estatísticas, docs, termos). These aren't
// tied to a single vertical, so the Navbar runs in platform mode: "MapaSUS"
// with the area switcher dropdown, the platform links and the SAMU badge —
// the same navigation language as the vertical pages and the hub.
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1">
      <Navbar />

      <main className="flex-1">{children}</main>

      <Footer className="mt-12" />
    </div>
  );
}
