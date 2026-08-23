import { Heading, Surface } from "@kastur/ui";

export function HeldUnavailableScreen() {
  return (
    <Surface className="unavailable-screen" elevation={1} padding="spacious">
      <span className="screen-eyebrow">Tertahan</span>
      <Heading level={1}>Keranjang Tertahan Belum Tersedia</Heading>
      <p>
        Penyimpanan dan pemulihan draft lintas sesi belum memiliki command serta persistence domain yang disetujui.
        Keranjang aktif tidak dipalsukan sebagai transaksi.
      </p>
    </Surface>
  );
}
