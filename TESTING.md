# Testing Strategy

VideoWeave is currently in rapid-validation mode.

The goal is to protect the product's core path without spending time on exhaustive edge-case coverage before those cases appear in real usage.

## Default rule

Add a test when at least one of these is true:

- a failure would break a core user workflow;
- the logic is easy to regress and hard to notice manually;
- a real bug has already occurred and should not return;
- a stable domain contract or state transition needs protection.

Do not add tests only to increase coverage percentage.

## Current P0 focus

Keep a small set of core tests around:

- API health / boot smoke testing;
- deterministic media metadata parsing;
- later, the smallest useful upload/Job integration path once those components stabilize.

Avoid large matrices for theoretical S3, database, codec, browser, and failure-mode combinations until real usage shows they are worth maintaining.

## Expansion rule

When a real boundary causes a production or repeated development failure, add the smallest regression test that captures that failure.

This policy is intentionally optimized for fast product validation and may become stricter as VideoWeave approaches production use.
