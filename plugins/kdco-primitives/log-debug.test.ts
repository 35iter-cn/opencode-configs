import { describe, expect, it, vi, beforeEach } from "bun:test";
import { logDebug } from "./log-debug";

describe("logDebug", () => {
  const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

  beforeEach(() => {
    consoleDebugSpy.mockClear();
  });

  it("should call console.debug with formatted message when client is undefined", () => {
    logDebug(undefined, "project-id", "No .git found");

    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    expect(consoleDebugSpy).toHaveBeenCalledWith("[project-id] No .git found");
  });

  it("should call client.app.log with level debug when client is available", () => {
    const mockLog = vi.fn().mockResolvedValue(undefined);
    const client = {
      app: {
        log: mockLog,
      },
    } as any;

    logDebug(client, "project-id", "Invalid cache content");

    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledWith({
      body: { service: "project-id", level: "debug", message: "Invalid cache content" },
    });
  });

  it("should silently ignore client logging failures", async () => {
    const mockLog = vi.fn().mockRejectedValue(new Error("network error"));
    const client = {
      app: {
        log: mockLog,
      },
    } as any;

    // Should not throw
    logDebug(client, "project-id", "Something");

    // Give microtask queue a tick to resolve the rejected promise
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockLog).toHaveBeenCalledTimes(1);
  });
});