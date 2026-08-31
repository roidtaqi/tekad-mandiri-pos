import type { CSSProperties, ReactNode } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Dialog,
  DialogClose,
  Divider,
  EmptyState,
  Field,
  Heading,
  IconButton,
  Inline,
  Input,
  Radio,
  RadioGroup,
  Select,
  SeverityBadge,
  Skeleton,
  Spinner,
  Stack,
  Surface,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
  Text,
  Textarea,
  Tooltip,
} from "@kastur/ui";
import "./UiShowcase.css";

const semanticSwatches = [
  ["Kanvas", "var(--ks-color-bg-canvas)"],
  ["Permukaan", "var(--ks-color-bg-surface)"],
  ["Permukaan lembut", "var(--ks-color-bg-subtle)"],
  ["Aksi utama", "var(--ks-color-action-primary)"],
] as const;

function swatchStyle(color: string): CSSProperties {
  return { "--showcase-swatch": color } as CSSProperties;
}

function ShowcaseSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const id = `ui-${title.toLocaleLowerCase("id-ID").replaceAll(" ", "-")}`;

  return (
    <section aria-labelledby={id}>
      <Stack gap={4}>
        <Heading id={id} level={2} size="h2">
          {title}
        </Heading>
        {children}
      </Stack>
    </section>
  );
}

export default function UiShowcase() {
  return (
    <main
      className="ks-root ui-showcase"
      data-showcase-marker="KASTUR_UI_SHOWCASE_DEV_ONLY"
    >
      <Container size="wide">
        <Stack gap={8}>
          <Stack gap={3}>
            <Badge tone="info">Alat pengembangan</Badge>
            <Heading level={1} size="display">
              Etalase Fondasi UI
            </Heading>
            <Text size="large" tone="secondary">
              Referensi netral untuk meninjau token dan primitif. Ini bukan layar
              bisnis Tekad Mandiri.
            </Text>
          </Stack>

          <Divider />

          <ShowcaseSection title="Tipografi">
            <Stack gap={2}>
              <Heading level={2} size="h1">
                Judul halaman operasional
              </Heading>
              <Heading level={3} size="h2">
                Judul bagian
              </Heading>
              <Heading level={4} size="h3">
                Judul subbagian
              </Heading>
              <Text>
                Teks isi dirancang agar ringkas, tenang, dan mudah dibaca.
              </Text>
              <Text size="small" tone="secondary">
                Teks ringkas untuk konteks pendukung.
              </Text>
              <Text numeric weight="semibold">
                1.250.000 · 12,50 · 08:45
              </Text>
            </Stack>
          </ShowcaseSection>

          <ShowcaseSection title="Token semantik">
            <div className="ui-showcase__swatches">
              {semanticSwatches.map(([label, color]) => (
                <div
                  className="ui-showcase__swatch"
                  key={label}
                  style={swatchStyle(color)}
                >
                  <Text as="span" size="caption" weight="semibold">
                    {label}
                  </Text>
                </div>
              ))}
            </div>
          </ShowcaseSection>

          <ShowcaseSection title="Tindakan">
            <Inline gap={3}>
              <Button>Utama</Button>
              <Button variant="secondary">Sekunder</Button>
              <Button variant="ghost">Tanpa latar</Button>
              <Button variant="destructive">Destruktif</Button>
              <Button disabled>Nonaktif</Button>
              <Button loading loadingLabel="Sedang memuat contoh">
                Memuat
              </Button>
              <Tooltip content="Tindakan contoh dengan nama yang dapat diakses">
                <IconButton accessibleLabel="Tutup contoh" icon="×" />
              </Tooltip>
            </Inline>
          </ShowcaseSection>

          <ShowcaseSection title="Formulir">
            <div className="ui-showcase__grid">
              <Field
                description="Label tetap terlihat dan bantuan terhubung ke kontrol."
                label="Nama contoh"
                required
              >
                <Input placeholder="Masukkan nama" />
              </Field>
              <Field error="Nilai contoh perlu diperbaiki." label="Nilai contoh">
                <Input defaultValue="Tidak valid" />
              </Field>
              <Field label="Pilihan contoh">
                <Select defaultValue="satu">
                  <option value="satu">Pilihan satu</option>
                  <option value="dua">Pilihan dua</option>
                </Select>
              </Field>
              <Field label="Catatan contoh">
                <Textarea placeholder="Tulis catatan singkat" />
              </Field>
            </div>
            <Stack gap={3}>
              <Checkbox
                description="Kontrol asli tetap dapat digunakan dengan papan ketik."
                label="Aktifkan pilihan contoh"
              />
              <RadioGroup label="Kelompok pilihan" name="showcase-choice">
                <Radio label="Pilihan pertama" value="first" />
                <Radio label="Pilihan kedua" value="second" />
              </RadioGroup>
              <Switch label="Aktifkan keadaan contoh" />
            </Stack>
          </ShowcaseSection>

          <ShowcaseSection title="Status dan perhatian">
            <Inline gap={3}>
              <SeverityBadge severity="INFO" />
              <SeverityBadge severity="WARNING" />
              <SeverityBadge severity="REVIEW_REQUIRED" />
              <SeverityBadge severity="CRITICAL" />
            </Inline>
            <div className="ui-showcase__grid">
              <Alert
                description="Informasi pendukung tetap tampil bersama ikon dan teks."
                severity="INFO"
                title="Informasi contoh"
              />
              <Alert
                description="Keadaan ini perlu diperiksa, tanpa menetapkan arti bisnis."
                severity="REVIEW_REQUIRED"
                title="Perlu ditinjau"
              />
            </div>
          </ShowcaseSection>

          <ShowcaseSection title="Permukaan dan data">
            <div className="ui-showcase__grid">
              <Surface padding="spacious" tone="muted">
                <Stack gap={2}>
                  <Heading level={3} size="h3">
                    Permukaan lembut
                  </Heading>
                  <Text tone="secondary">
                    Hierarki dibuat dengan kontras permukaan dan batas yang tenang.
                  </Text>
                </Stack>
              </Surface>
              <Card>
                <Stack gap={2}>
                  <Heading level={3} size="h3">
                    Kartu
                  </Heading>
                  <Text tone="secondary">
                    Kartu dipakai saat pengelompokan benar-benar membantu pemahaman.
                  </Text>
                </Stack>
              </Card>
            </div>
            <TableWrapper label="Contoh fondasi tabel">
              <Table>
                <caption className="ks-sr-only">Contoh fondasi tabel</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead numeric>Nilai</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Contoh A</TableCell>
                    <TableCell>
                      <Badge tone="success">Siap</Badge>
                    </TableCell>
                    <TableCell numeric>1.250</TableCell>
                  </TableRow>
                  <TableRow selected>
                    <TableCell>Contoh B</TableCell>
                    <TableCell>
                      <Badge tone="neutral">Netral</Badge>
                    </TableCell>
                    <TableCell numeric>875</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableWrapper>
          </ShowcaseSection>

          <ShowcaseSection title="Pemuatan dan keadaan kosong">
            <Inline gap={4}>
              <Spinner label="Memuat contoh" />
              <Skeleton shape="text" />
              <Skeleton shape="circle" />
            </Inline>
            <EmptyState
              action={<Button variant="secondary">Tindakan relevan</Button>}
              description="Keadaan kosong menjelaskan konteks dan menawarkan langkah berikutnya."
              icon="◇"
              title="Belum ada contoh"
            />
          </ShowcaseSection>

          <ShowcaseSection title="Dialog">
            <Dialog
              description="Contoh ini memperlihatkan judul, dampak, tindakan aman, dan pengembalian fokus."
              footer={
                <>
                  <DialogClose>
                    <Button variant="secondary">Batal</Button>
                  </DialogClose>
                  <Button variant="destructive">Hapus contoh</Button>
                </>
              }
              title="Hapus contoh tampilan?"
              trigger={<Button variant="secondary">Buka dialog contoh</Button>}
            >
              <Text>
                Tindakan ini hanya merupakan demonstrasi visual dan tidak mengubah
                data apa pun.
              </Text>
            </Dialog>
          </ShowcaseSection>

          <ShowcaseSection title="Kesiapan tema gelap">
            <div
              className="ks-root ui-showcase__dark-preview"
              data-kastur-theme="dark"
            >
              <Stack gap={4}>
                <Heading level={3} size="h3">
                  Pratinjau token gelap
                </Heading>
                <Text tone="secondary">
                  Tema ini bersifat pratinjau terlokalisasi, bukan pengaturan pengguna.
                </Text>
                <Inline gap={3}>
                  <Button>Utama</Button>
                  <Button variant="secondary">Sekunder</Button>
                  <SeverityBadge severity="REVIEW_REQUIRED" />
                </Inline>
              </Stack>
            </div>
          </ShowcaseSection>
        </Stack>
      </Container>
    </main>
  );
}
