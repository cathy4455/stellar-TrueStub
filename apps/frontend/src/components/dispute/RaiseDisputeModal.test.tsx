import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RaiseDisputeModal } from "./RaiseDisputeModal";

const startDispute = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/trustless-work/hooks/useSingleRelease", () => ({
  useSingleRelease: () => ({ startDispute }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("RaiseDisputeModal", () => {
  beforeEach(() => {
    startDispute.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("renders the trigger button", () => {
    render(<RaiseDisputeModal contractId="C123" />);
    expect(screen.getByText("disputes.raise")).toBeInTheDocument();
  });

  it("opens the dialog when the trigger is clicked", () => {
    render(<RaiseDisputeModal contractId="C123" />);
    fireEvent.click(screen.getByText("disputes.raise"));
    expect(screen.getByText("disputes.title")).toBeInTheDocument();
  });

  it("shows a validation error when submitting without required fields", async () => {
    render(<RaiseDisputeModal contractId="C123" />);
    fireEvent.click(screen.getByText("disputes.raise"));

    const submit = screen.getByRole("button", { name: /disputes\.submit|submit/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("disputes.validation");
    });
    expect(startDispute).not.toHaveBeenCalled();
  });

  it("raises a dispute and invokes the callback on submit", async () => {
    const onDisputeRaised = vi.fn();
    startDispute.mockResolvedValue(undefined);

    render(
      <RaiseDisputeModal
        contractId="C123"
        userWallet="GWALLET"
        onDisputeRaised={onDisputeRaised}
      />
    );

    fireEvent.click(screen.getByText("disputes.raise"));

    fireEvent.change(screen.getByLabelText(/disputes\.detailedStatement/), {
      target: { value: "Ticket was never delivered" },
    });

    // Select a reason via the underlying select trigger
    const reasonTrigger = screen.getByRole("combobox");
    fireEvent.click(reasonTrigger);
    const option = await screen.findByText("disputes.invalidTicket");
    fireEvent.click(option);

    const submit = screen.getByRole("button", { name: /disputes\.submit|submit/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(startDispute).toHaveBeenCalledWith({
        contractId: "C123",
        signer: "GWALLET",
      });
    });

    expect(onDisputeRaised).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: "C123",
        reason: "invalid_ticket",
        description: "Ticket was never delivered",
      })
    );
    expect(toastSuccess).toHaveBeenCalledWith("disputes.success");
  });
});
