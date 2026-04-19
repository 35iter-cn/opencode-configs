---
name: plan-tdd
description: "Test-Driven Development constraints for all implementation work. Must be loaded before writing any production code."
---

# Skill: plan-tdd

**Role:** Mandatory constraint for all implementation tasks. Loaded before any production code is written.

---

## The Iron Law of TDD

**NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

This is non-negotiable. There are no exceptions. There are no special cases. The cycle is absolute.

---

## The RED / GREEN Discipline

You MUST follow this sequence for every behavior:

1. **RED**: Write a test that describes the desired behavior. Run it. **Watch it fail.** If it does not fail, the test is invalid — delete it and start over.
2. **GREEN**: Write the minimum production code needed to make the test pass. Do not write extra logic. Do not anticipate future requirements.
3. **REFACTOR**: Clean the code only after the test is green. Keep all tests passing during refactoring.

**You must witness the failure.** A test that passes on the first run proves nothing.

---

## Excuses That Will Be Rejected

| Excuse                                                            | Rejection                                                                                 |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "This is too simple to test."                                     | Simplicity is not an exemption. If it's too simple to test, write the test in 30 seconds. |
| "I'll write the test after."                                      | You will not. "After" becomes "never." Tests first, always.                               |
| "Deleting failed code is wasteful."                               | Untested code is debt, not inventory. Deletion is the point of the safety net.            |
| "TDD is dogma / religious."                                       | TDD is empirical risk reduction. Your feelings do not override the protocol.              |
| "Writing the test and implementation together is the same thing." | It is not. You must see the test fail to prove it validates the behavior.                 |

---

## Red Flags — Stop Immediately

If you catch yourself doing any of the following, **halt and revert**:

- **Code before test**: Writing or modifying production code before a failing test exists.
- **Instant pass**: A new test passes on the first run without having seen it fail.
- **"Just this once"**: Rationalizing an exception to the cycle for any reason.
- **Premature abstraction**: Refactoring before the test is green.
- **Speculative code**: Adding logic "just in case" that no test currently demands.
- **Skipping the failure**: Running the test suite without verifying the new test specifically fails.

---

## RED → GREEN Example

```
Step 1 — Write the test (RED):
  describe('calculateTotal', () => {
    it('sums item prices', () => {
      expect(calculateTotal([10, 20])).toBe(30);
    });
  });
  // RUN → FAIL: calculateTotal is not defined

Step 2 — Minimum implementation (GREEN):
  function calculateTotal(items) {
    return items.reduce((sum, price) => sum + price, 0);
  }
  // RUN → PASS

Step 3 — Refactor (if needed):
  // Code is clean. No action required.
```

---

## Enforcement

- Every implementation task begins by loading this skill.
- The orchestrator will verify that tests precede production code.
- Violations require immediate rollback to the last known green state.
