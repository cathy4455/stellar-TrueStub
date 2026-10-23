import { notificationService } from "./notification.service";
import { emailService } from "./email.service";
import { pushService } from "./push.service";

jest.mock("./email.service", () => ({
  emailService: {
    sendEmail: jest.fn(),
  },
}));

jest.mock("./push.service", () => ({
  pushService: {
    sendPush: jest.fn(),
  },
}));

const mockedEmailService = emailService as jest.Mocked<typeof emailService>;
const mockedPushService = pushService as jest.Mocked<typeof pushService>;

describe("notificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("notifyEscrowStatusChange", () => {
    it("sends email and push notifications for the user", async () => {
      mockedEmailService.sendEmail.mockResolvedValue(undefined as never);
      mockedPushService.sendPush.mockResolvedValue(undefined as never);

      await notificationService.notifyEscrowStatusChange({
        userId: "user-1",
        email: "user@example.com",
        escrowId: "escrow-1",
        status: "released",
      });

      expect(mockedEmailService.sendEmail).toHaveBeenCalledTimes(1);
      expect(mockedPushService.sendPush).toHaveBeenCalledTimes(1);
    });

    it("does not throw when the email provider errors", async () => {
      mockedEmailService.sendEmail.mockRejectedValue(new Error("email down"));
      mockedPushService.sendPush.mockResolvedValue(undefined as never);

      await expect(
        notificationService.notifyEscrowStatusChange({
          userId: "user-1",
          email: "user@example.com",
          escrowId: "escrow-1",
          status: "released",
        }),
      ).resolves.not.toThrow();
    });

    it("does not throw when the push provider errors", async () => {
      mockedEmailService.sendEmail.mockResolvedValue(undefined as never);
      mockedPushService.sendPush.mockRejectedValue(new Error("push down"));

      await expect(
        notificationService.notifyEscrowStatusChange({
          userId: "user-1",
          email: "user@example.com",
          escrowId: "escrow-1",
          status: "released",
        }),
      ).resolves.not.toThrow();
    });

    it("does not throw when both providers error", async () => {
      mockedEmailService.sendEmail.mockRejectedValue(new Error("email down"));
      mockedPushService.sendPush.mockRejectedValue(new Error("push down"));

      await expect(
        notificationService.notifyEscrowStatusChange({
          userId: "user-1",
          email: "user@example.com",
          escrowId: "escrow-1",
          status: "released",
        }),
      ).resolves.not.toThrow();
    });
  });
});
