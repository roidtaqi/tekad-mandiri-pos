import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CircleX } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as Ui from "@kastur/ui";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  Field,
  IconButton,
  Input,
  Radio,
  RadioGroup,
  SeverityBadge,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
  Tooltip,
} from "@kastur/ui";

afterEach(() => {
  cleanup();
});

describe("public UI entry point", () => {
  it("exposes the intentional M0-004 primitive inventory", () => {
    const requiredExports = [
      "Alert",
      "Badge",
      "Button",
      "Card",
      "Checkbox",
      "Container",
      "Dialog",
      "DialogClose",
      "DialogFooter",
      "Divider",
      "EmptyState",
      "Field",
      "Heading",
      "IconButton",
      "Inline",
      "Input",
      "Radio",
      "RadioGroup",
      "Select",
      "SeverityBadge",
      "Skeleton",
      "Spinner",
      "Stack",
      "Surface",
      "Switch",
      "Table",
      "TableBody",
      "TableCell",
      "TableHead",
      "TableHeader",
      "TableRow",
      "TableWrapper",
      "Text",
      "Textarea",
      "Tooltip",
    ];

    for (const exportName of requiredExports) {
      expect(Ui).toHaveProperty(exportName);
    }

    expect(Ui).not.toHaveProperty("classNames");
  });
});

describe("actions", () => {
  it("prevents activation while disabled or loading", async () => {
    const user = userEvent.setup();
    const onDisabledClick = vi.fn();
    const onLoadingClick = vi.fn();

    render(
      <>
        <Button disabled onClick={onDisabledClick}>
          Tidak tersedia
        </Button>
        <Button loading loadingLabel="Sedang menyimpan" onClick={onLoadingClick}>
          Simpan
        </Button>
      </>,
    );

    const disabledButton = screen.getByRole("button", {
      name: "Tidak tersedia",
    });
    const loadingButton = screen.getByText("Simpan").closest("button");

    expect(disabledButton).toBeInstanceOf(HTMLButtonElement);
    expect((disabledButton as HTMLButtonElement).disabled).toBe(true);
    expect(loadingButton).toBeInstanceOf(HTMLButtonElement);
    expect((loadingButton as HTMLButtonElement).disabled).toBe(true);
    expect(loadingButton?.getAttribute("aria-busy")).toBe("true");
    expect(loadingButton?.textContent).toContain("Sedang menyimpan");

    await user.click(disabledButton);

    if (loadingButton !== null) {
      await user.click(loadingButton);
    }

    expect(onDisabledClick).not.toHaveBeenCalled();
    expect(onLoadingClick).not.toHaveBeenCalled();
  });

  it("requires and renders a text alternative for an icon-only action", () => {
    render(
      <IconButton
        accessibleLabel="Tutup contoh"
        icon={<CircleX data-testid="decorative-icon" />}
      />,
    );

    const button = screen.getByRole("button", { name: "Tutup contoh" });
    const iconContainer = screen.getByTestId("decorative-icon").parentElement;

    expect(button.getAttribute("aria-label")).toBe("Tutup contoh");
    expect(iconContainer?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("form controls", () => {
  it("associates a persistent label, help text, error, and required state", () => {
    render(
      <Field
        description="Gunakan nama yang mudah dikenali."
        error="Nama wajib diisi."
        label="Nama tampilan"
        required
      >
        <Input />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Nama tampilan" });
    const description = screen.getByText("Gunakan nama yang mudah dikenali.");
    const error = screen.getByRole("alert");
    const describedBy = input.getAttribute("aria-describedby")?.split(" ") ?? [];

    expect(input.id).not.toBe("");
    expect(input.getAttribute("required")).not.toBeNull();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy).toContain(description.id);
    expect(describedBy).toContain(error.id);
    expect(error.textContent).toBe("Nama wajib diisi.");
  });

  it("uses native keyboard state for checkbox, radio, and switch", async () => {
    const user = userEvent.setup();

    render(
      <>
        <span id="radio-context">Konteks tambahan</span>
        <Checkbox label="Aktifkan pilihan" />
        <RadioGroup
          aria-describedby="radio-context"
          aria-invalid="spelling"
          label="Pilih mode"
          name="mode"
        >
          <Radio label="Mode satu" value="one" />
          <Radio label="Mode dua" value="two" />
        </RadioGroup>
        <Switch label="Gunakan opsi" />
      </>,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "Aktifkan pilihan",
    }) as HTMLInputElement;
    const secondRadio = screen.getByRole("radio", {
      name: "Mode dua",
    }) as HTMLInputElement;
    const switchControl = screen.getByRole("switch", {
      name: "Gunakan opsi",
    }) as HTMLInputElement;

    checkbox.focus();
    await user.keyboard("[Space]");
    secondRadio.focus();
    await user.keyboard("[Space]");
    switchControl.focus();
    await user.keyboard("[Space]");

    expect(checkbox.checked).toBe(true);
    expect(secondRadio.checked).toBe(true);
    expect(secondRadio.getAttribute("aria-describedby")).toContain(
      "radio-context",
    );
    expect(secondRadio.getAttribute("aria-invalid")).toBe("true");
    expect(switchControl.checked).toBe(true);
  });
});

describe("operational feedback", () => {
  it("renders exact Indonesian severity labels with non-color markers", () => {
    const cases = [
      ["INFO", "Informasi"],
      ["WARNING", "Peringatan"],
      ["REVIEW_REQUIRED", "Perlu Ditinjau"],
      ["CRITICAL", "Kritis"],
    ] as const;

    render(
      <>
        {cases.map(([severity]) => (
          <SeverityBadge key={severity} severity={severity} />
        ))}
      </>,
    );

    for (const [severity, label] of cases) {
      const labelElement = screen.getByText(label);
      const badge = labelElement.closest("[data-severity]");

      expect(badge?.getAttribute("data-severity")).toBe(severity);
      expect(badge?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("reserves live alert semantics for critical or caller-selected cases", () => {
    render(
      <>
        <Alert description="Keterangan tetap terlihat." severity="INFO" title="Catatan" />
        <Alert role="status" severity="INFO" title="Pembaruan berjalan" />
        <Alert
          description="Tindakan perlu dihentikan."
          severity="CRITICAL"
          title="Masalah kritis"
        />
      </>,
    );

    const informational = screen.getByText("Catatan").closest(".ks-alert");
    const callerSelectedStatus = screen.getByRole("status");
    const critical = screen.getByRole("alert");

    expect(informational?.getAttribute("role")).toBeNull();
    expect(informational?.getAttribute("data-severity")).toBe("INFO");
    expect(informational?.textContent).toContain("Keterangan tetap terlihat.");
    expect(callerSelectedStatus.textContent).toContain("Pembaruan berjalan");
    expect(critical.getAttribute("data-severity")).toBe("CRITICAL");
    expect(critical.textContent).toContain("Masalah kritis");
    expect(critical.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});

describe("table foundation", () => {
  it("retains native semantics, numeric alignment, and selected state", () => {
    render(
      <TableWrapper label="Contoh data operasional">
        <Table density="compact">
          <caption className="ks-sr-only">Daftar contoh</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead numeric>Nilai</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow selected>
              <TableCell>Contoh satu</TableCell>
              <TableCell numeric>12.500</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableWrapper>,
    );

    const region = screen.getByRole("region", {
      name: "Contoh data operasional",
    });
    const table = within(region).getByRole("table", { name: "Daftar contoh" });
    const numericHeader = within(table).getByRole("columnheader", {
      name: "Nilai",
    });
    const numericCell = within(table).getByRole("cell", { name: "12.500" });
    const selectedRow = within(table).getByRole("row", {
      name: "Contoh satu 12.500",
    });

    expect(table.getAttribute("data-density")).toBe("compact");
    expect(numericHeader.getAttribute("data-numeric")).toBe("true");
    expect(numericHeader.getAttribute("data-align")).toBe("end");
    expect(numericCell.getAttribute("data-numeric")).toBe("true");
    expect(numericCell.getAttribute("data-align")).toBe("end");
    expect(selectedRow.getAttribute("data-selected")).toBe("true");
    expect(selectedRow.getAttribute("aria-selected")).toBeNull();
  });
});

describe("accessible overlays", () => {
  it("associates dialog title and description, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();

    render(
      <Dialog
        description="Periksa isi contoh sebelum melanjutkan."
        footer={
          <DialogClose>
            <Button variant="secondary">Batal</Button>
          </DialogClose>
        }
        title="Tinjau contoh"
        trigger={<Button>Buka dialog</Button>}
      >
        <Input aria-label="Isi contoh" />
      </Dialog>,
    );

    const trigger = screen.getByRole("button", { name: "Buka dialog" });

    trigger.focus();
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    const title = within(dialog).getByText("Tinjau contoh");
    const description = within(dialog).getByText(
      "Periksa isi contoh sebelum melanjutkan.",
    );

    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
    expect(dialog.getAttribute("aria-describedby")).toBe(description.id);
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it("reveals supplementary tooltip content from keyboard focus", async () => {
    const user = userEvent.setup();

    render(
      <Tooltip content="Keterangan tambahan" delayDuration={0}>
        <Button>Fokus bantuan</Button>
      </Tooltip>,
    );

    await user.tab();

    expect(screen.getByRole("button", { name: "Fokus bantuan" })).toBe(
      document.activeElement,
    );
    expect(await screen.findByRole("tooltip")).toHaveProperty(
      "textContent",
      "Keterangan tambahan",
    );
  });
});
