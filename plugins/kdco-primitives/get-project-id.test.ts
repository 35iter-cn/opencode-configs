import { describe, expect, it, vi, beforeEach, afterEach } from "bun:test";
import { getProjectId } from "./get-project-id";

describe("getProjectId logDebug downgrade", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = `/tmp/test-project-id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    Bun.spawnSync(["mkdir", "-p", tmpDir]);
  });

  afterEach(() => {
    Bun.spawnSync(["rm", "-rf", tmpDir]);
  });

  it("should call logDebug (not logWarn) when directory has no .git", async () => {
    const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // No client — both fallback paths go through console
    // A non-git dir should trigger debug-level "No .git found" fallback
    const result = await getProjectId(tmpDir, undefined);

    // Should have called console.debug (logDebug path), not console.warn (logWarn path)
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining("No .git found"),
    );
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();

    // Should still return a valid hash
    expect(result).toMatch(/^[a-f0-9]{16}$/);
  });

  it("should call logDebug (not logWarn) when cache content is invalid", async () => {
    const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Create .git directory with invalid cache
    const gitDir = `${tmpDir}/.git`;
    Bun.spawnSync(["mkdir", "-p", gitDir]);
    // Write invalid cache content
    await Bun.write(`${gitDir}/opencode`, "invalid-cache-content");

    // Using Bun.spawn to mock git would be complex, so we test the cache validation path
    // by providing a directory with .git but invalid cache
    // The function should attempt git commands, fail, and fall through
    const result = await getProjectId(tmpDir, undefined);

    // "Invalid cache content" should be logged at debug level (logDebug),
    // not warn level — verify the specific message goes through console.debug
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid cache content"),
    );

    // Note: logWarn may still be called for git command failures in this test
    // scenario (non-git .git dir), which is expected and correct behavior.
    // We only verify the cache invalidation message is debug-level.

    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("should call logWarn when git rev-list returns non-zero exit code", async () => {
    const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Create .git directory (not a real git repo) so git rev-list fails
    const gitDir = `${tmpDir}/.git`;
    Bun.spawnSync(["mkdir", "-p", gitDir]);

    const result = await getProjectId(tmpDir, undefined);

    // git rev-list should fail on a non-git .git directory, triggering logWarn
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("git rev-list failed"),
    );

    // Should NOT have called console.debug for the failure path
    // (only logDebug was called for other paths, if any)
    expect(consoleDebugSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("git rev-list failed"),
    );

    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();

    // Should still return a valid hash (path hash fallback)
    expect(result).toMatch(/^[a-f0-9]{16}$/);
  });

  it("should use warn level in structured logging when git rev-list fails", async () => {
    const logCall = vi.fn().mockResolvedValue(undefined);
    const mockClient = {
      app: {
        log: logCall,
      },
    } as any;

    // Create .git directory (not a real git repo) so git rev-list fails
    const gitDir = `${tmpDir}/.git`;
    Bun.spawnSync(["mkdir", "-p", gitDir]);

    const result = await getProjectId(tmpDir, mockClient);

    // Should have called client.app.log with level "warn" for git failure
    expect(logCall).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          service: "project-id",
          level: "warn",
          message: expect.stringContaining("git rev-list failed"),
        }),
      }),
    );

    // Should still return a valid hash (path hash fallback)
    expect(result).toMatch(/^[a-f0-9]{16}$/);
  });
});